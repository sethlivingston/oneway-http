// src/send.ts — single-attempt transport core
// Dependency direction: client.ts → send.ts → types.ts, request.ts
// send.ts NEVER imports from client.ts (D-03: no circular imports)

import type {
  ClientSpec,
  QueryValue,
  RequestSpec,
  SendResult,
  BodyPreview,
  SendOptions,
} from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";

// Inline URL construction (D-18)
// Cannot import mergeQuery from client.ts — circular dependency (D-03)
// This function mirrors the logic of mergeQuery() from client.ts
function buildEffectiveUrl(spec: RequestSpec, clientSpec: ClientSpec): URL {
  if (spec.absoluteUrl !== undefined) {
    // D-18: absoluteUrl bypasses baseUrl entirely
    return new URL(String(spec.absoluteUrl));
  }
  const path = buildPath(spec.path);
  const base = String(clientSpec.baseUrl ?? "");
  // CRITICAL: baseUrl must end with "/" or last segment is replaced (Pitfall 5)
  const url = new URL(path, base);
  // Merge client query + request query (request wins on same key)
  const mergedQuery: Record<string, QueryValue | readonly QueryValue[]> = {};
  for (const [k, v] of Object.entries(clientSpec.query ?? {})) {
    if (v !== undefined) mergedQuery[k] = v;
  }
  for (const [k, v] of Object.entries(spec.query ?? {})) {
    if (v !== undefined) mergedQuery[k] = v;
  }
  const params = buildQuery(mergedQuery);
  const paramStr = params.toString();
  if (paramStr.length > 0) url.search = paramStr;
  return url;
}

// Inline header merge (D-19)
// Cannot import mergeHeaders from client.ts — circular dependency (D-03)
// Mirrors mergeHeaders() from client.ts: case-insensitive keys, request wins, undefined filtered
function mergeEffectiveHeaders(
  base: Record<string, string | undefined> | undefined,
  override: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(base ?? {})) {
    if (v !== undefined) result[k.toLowerCase()] = v;
  }
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v !== undefined) result[k.toLowerCase()] = v;
  }
  return result;
}

// D-11: Transport error classification — applied to BOTH fetch() catch and body-read catch (D-12)
// CRITICAL: duck-type .name — do NOT use instanceof Error, which fails across VM realms
// D-10: DOMException("Deadline exceeded", "TimeoutError").name === "TimeoutError" → timeout
// D-10: AbortController.abort() with no argument → DOMException("", "AbortError").name === "AbortError" → aborted
function classifyTransportError(error: unknown): SendResult<never> {
  let name = "";
  if (error !== null && typeof error === "object" && "name" in error) {
    const n = error.name;
    if (typeof n === "string") name = n;
  }
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  if (name === "AbortError") {
    return { kind: "transportError", error: { kind: "aborted" } };
  }
  return { kind: "transportError", error: { kind: "network", cause: error } };
}

// D-15, D-16, D-17: Body preview streaming with correct truncation detection
// Signal-aware: combinedSignal governs the body stream in Node 24+ native fetch (undici).
// When signal fires during reader.read(), the read rejects with signal.reason.
// D-12: We re-throw on error — the outer performSend() catch calls classifyTransportError().
// This ensures "deadline fires during body reading → timeout" (not network or decodeError).
async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> {
  if (response.body === null) {
    // Handles 204 No Content, 304 Not Modified, 205 Reset Content, HEAD responses
    return { text: "", bytesRead: 0, truncated: false };
  }

  // maxBytes <= 0: no preview requested — cancel the stream immediately to release the TCP
  // connection. The body is non-empty (response.body !== null) so truncated must be true.
  if (maxBytes <= 0) {
    const reader = response.body.getReader();
    await reader.cancel().catch(() => {
      // Swallow cancel errors — stream may already be errored/closed
    });
    return { text: "", bytesRead: 0, truncated: true };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bytesRead < maxBytes) {
      // reader.read() rejects when signal fires (deadline or caller abort)
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      if (value.length <= remaining) {
        chunks.push(value);
        bytesRead += value.length;
        if (bytesRead === maxBytes) {
          // D-15: Peek one extra read to determine if stream is exhausted.
          // Without this peek, a stream that delivers exactly N bytes incorrectly returns
          // truncated: true. The peek distinguishes "exactly full" from "more data pending".
          const { done: isDone } = await reader.read();
          if (!isDone) truncated = true;
          break;
        }
      } else {
        // Chunk is larger than remaining budget — definitely truncated
        chunks.push(value.slice(0, remaining));
        bytesRead += remaining;
        truncated = true;
        break;
      }
    }
  } finally {
    // Non-negotiable: cancel the reader to release the TCP connection
    await reader.cancel().catch(() => {
      // Swallow cancel errors — they indicate the stream was already errored/closed
    });
  }

  // noUncheckedIndexedAccess: use for...of (not arr[i]) + Uint8Array.set() to avoid index access
  const all = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }

  // D-17: UTF-8 first, ISO-8859-1 (latin-1) fallback per SPEC §BodyPreview
  // fatal:true lets us detect invalid sequences and fall back; latin-1 never throws
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    try {
      text = new TextDecoder("iso-8859-1").decode(all);
    } catch {
      // Swallow — preview text is best-effort
    }
  }

  return { text, bytesRead, truncated };
}

export async function performSend<R>(
  request: Request<R>,
  clientSpec: ClientSpec,
  options?: SendOptions,
): Promise<SendResult<R>> {
  // D-05: Pre-abort guard — BEFORE request.consume()
  if (options?.signal?.aborted === true) {
    return { kind: "transportError", error: { kind: "aborted" } };
  }

  // D-06: request.consume() throws TypeError on re-use — programming error, not structured result
  const spec = request.consume();

  // D-20: effectiveDeadlineMs = requestSpec.deadlineMs ?? clientSpec.deadlineMs (request wins)
  const effectiveDeadlineMs = spec.deadlineMs ?? clientSpec.deadlineMs;

  // D-07: deadlineMs validation — programming error, not a structured result
  if (effectiveDeadlineMs !== undefined && effectiveDeadlineMs <= 0) {
    throw new RangeError("deadlineMs must be a positive integer");
  }

  // D-21: injectable fetch seam — clientSpec.fetch ?? globalThis.fetch
  const effectiveFetch = clientSpec.fetch ?? globalThis.fetch;

  // D-18: URL construction — must happen before timer setup so a throw doesn't leak the timer
  const url = buildEffectiveUrl(spec, clientSpec);

  // D-19: header merge — case-insensitive, request headers override client headers
  const headers = mergeEffectiveHeaders(clientSpec.headers, spec.headers);

  // D-08: deadline controller — setTimeout + AbortController, NEVER AbortSignal.timeout()
  // AbortSignal.timeout() cannot be clearTimeout'd — causes timer leak after request completes
  let deadlineController: AbortController | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const callerSignal = options?.signal;

  if (effectiveDeadlineMs !== undefined) {
    deadlineController = new AbortController();
    const dc = deadlineController;
    deadlineTimer = setTimeout(() => {
      // D-10: "TimeoutError" name is MANDATORY — this is what classifyTransportError checks
      // Using "AbortError" or omitting the argument causes every deadline to silently return "aborted"
      dc.abort(new DOMException("Deadline exceeded", "TimeoutError"));
    }, effectiveDeadlineMs);
  }

  // D-09: four signal composition cases — all cases explicitly handled
  const combinedSignal: AbortSignal | undefined =
    callerSignal !== undefined && deadlineController !== undefined
      ? AbortSignal.any([callerSignal, deadlineController.signal])
      : deadlineController !== undefined
        ? deadlineController.signal
        : callerSignal; // undefined when neither deadline nor caller signal

  // Build fetch init — conditional assignment required by exactOptionalPropertyTypes (Pitfall 6)
  const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
  if (spec.body !== undefined) fetchInit.body = spec.body;
  if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;

  try {
    const response = await effectiveFetch(url, fetchInit);

    // D-15: body preview — first N bytes where N = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192
    // D-16: reader.read() rejects on signal fire → re-thrown → caught by outer catch → classifyTransportError
    // D-12: deadline during body reading → "timeout"; caller abort → "aborted"
    const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192;
    const preview = await readBodyPreview(response, maxBytes);

    // D-13, D-14: Phase 3 stub — ALL HTTP responses return unhandledStatus
    return {
      kind: "unhandledStatus",
      status: response.status,
      headers: response.headers,
      preview,
    };
  } catch (error) {
    return classifyTransportError(error);
  } finally {
    // D-08: clearTimeout in finally — fires whether fetch resolved, rejected, or awaited body
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }
}
