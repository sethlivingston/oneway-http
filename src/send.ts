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
  const path = spec.path !== undefined ? buildPath(spec.path) : "";
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
// CRITICAL: classify by error.name string, not instanceof — works across realm boundaries
// D-10: DOMException("Deadline exceeded", "TimeoutError").name === "TimeoutError" → timeout
// D-10: AbortController.abort() with no argument → DOMException("", "AbortError").name === "AbortError" → aborted
function classifyTransportError(error: unknown): SendResult<never> {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  if (name === "AbortError") {
    return { kind: "transportError", error: { kind: "aborted" } };
  }
  return { kind: "transportError", error: { kind: "network", cause: error } };
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

  // D-08: deadline controller — setTimeout + AbortController, NEVER AbortSignal.timeout()
  // AbortSignal.timeout() cannot be clearTimeout'd — causes timer leak after request completes
  let deadlineController: AbortController | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const callerSignal = options?.signal;

  if (effectiveDeadlineMs !== undefined) {
    deadlineController = new AbortController();
    deadlineTimer = setTimeout(
      () =>
        // D-10: "TimeoutError" name is MANDATORY — this is what classifyTransportError checks
        // Using "AbortError" or omitting the argument causes every deadline to silently return "aborted"
        deadlineController!.abort(
          new DOMException("Deadline exceeded", "TimeoutError"),
        ),
      effectiveDeadlineMs,
    );
  }

  // D-09: four signal composition cases — all cases explicitly handled
  const combinedSignal: AbortSignal | undefined =
    callerSignal !== undefined && deadlineController !== undefined
      ? AbortSignal.any([callerSignal, deadlineController.signal])
      : deadlineController !== undefined
        ? deadlineController.signal
        : callerSignal; // undefined when neither deadline nor caller signal

  // D-18: URL construction
  const url = buildEffectiveUrl(spec, clientSpec);

  // D-19: header merge — case-insensitive, request headers override client headers
  const headers = mergeEffectiveHeaders(clientSpec.headers, spec.headers);

  // Build fetch init — conditional assignment required by exactOptionalPropertyTypes (Pitfall 6)
  const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
  if (spec.body !== undefined) fetchInit.body = spec.body as BodyInit;
  if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;

  try {
    const response = await effectiveFetch(url, fetchInit);

    // Plan 03-03: full streaming readBodyPreview() replaces this placeholder
    const preview: BodyPreview = { text: "", bytesRead: 0, truncated: false };

    // D-13, D-14: Phase 3 stub — ALL HTTP responses return unhandledStatus
    return {
      kind: "unhandledStatus",
      status: response.status,
      headers: response.headers,
      preview,
    };
  } catch (error) {
    return classifyTransportError(error) as SendResult<R>;
  } finally {
    // D-08: clearTimeout in finally — fires whether fetch resolved, rejected, or awaited body
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }
}
