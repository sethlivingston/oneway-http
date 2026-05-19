// src/send.ts — single-attempt transport core
// Dependency direction: client.ts → send.ts → body.ts, preview.ts, types.ts, request.ts
// send.ts NEVER imports from client.ts (D-03: no circular imports)

import type {
  ClientSpec,
  DecodeError,
  QueryValue,
  RequestSpec,
  SendResult,
  SendOptions,
  RequestError,
} from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";
import { serializeBody } from "./body.js";
import { readBodyPreview, previewFromBytes } from "./preview.js";
import { readBytes } from "./decode.js";
import { matchResponse } from "./response-matching.js";
import { resolveRetryPolicy, jitterDelay, sleepWithAbort } from "./retry.js";

// Inline URL construction (D-18)
// Cannot import mergeQuery from client.ts — circular dependency (D-03)
// This function mirrors the logic of mergeQuery() from client.ts
function buildEffectiveUrl(spec: RequestSpec, clientSpec: ClientSpec): URL {
  if (spec.absoluteUrl !== undefined) {
    // D-18: absoluteUrl bypasses baseUrl entirely
    return new URL(String(spec.absoluteUrl));
  }
  const path = buildPath(spec.path);
  const rawBase = String(clientSpec.baseUrl ?? "");
  // Normalize baseUrl to always end with "/" so that versioned paths like "/v1" are preserved.
  // new URL("users", "https://example.com/v1") drops "/v1"; new URL("users", "https://example.com/v1/") does not.
  // Parse via URL to avoid corrupting any query/hash that may be present (e.g. "?x=1/" would be wrong).
  let base = rawBase;
  if (rawBase.length > 0) {
    const u = new URL(rawBase);
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    base = u.toString();
  }
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

// Runtime guard for reserved tag names — complements compile-time Exclude<TagsOf<R>, ReservedTags>.
// Defined at module scope to avoid per-call allocation.
// Must stay in sync with ReservedTags in src/matcher.ts.
// Cannot import ReservedTags from matcher.ts — send.ts and matcher.ts are sibling modules;
// importing would couple the dispatch layer to the matching layer.
const RESERVED_RESPONSE_TAGS = new Set([
  "transportError",
  "decodeError",
  "unhandledStatus",
  "requestError",
]);

// Exhaustive set of all DecodeError.kind values from types.ts (synchronized with DecodeError union).
// Must NOT be reduced — a partial set causes false-negatives on real decode errors.
// Must NOT match via `"kind" in v` alone — false-positive on API responses with a `kind` field.
const DECODE_ERROR_KINDS = new Set([
  "unexpectedBody",
  "emptyBody",
  "invalidJson",
  "schemaMismatch",
  "bodyReadFailed",
  "custom",
]);

function isDecodeError(v: unknown): v is DecodeError {
  if (typeof v !== "object" || v === null || !("kind" in v)) return false;
  const { kind } = v;
  return typeof kind === "string" && DECODE_ERROR_KINDS.has(kind);
}

/**
 * @internal
 * Executes a typed HTTP request against the given client configuration.
 * Handles deadline, abort, body serialization, retry, and response decoding.
 * @param request - The consumed `Request<R>` to send.
 * @param clientSpec - Client-level configuration (base URL, headers, retry, etc.).
 * @param options - Per-call options such as an `AbortSignal`.
 * @returns A `SendResult<R>` discriminated union describing the outcome.
 */
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

  // Reserved tag guard: reject any response map entry whose tag collides with a SendResult discriminant.
  // spec.responses check:
  for (const entry of Object.values(spec.responses)) {
    if (entry !== undefined && RESERVED_RESPONSE_TAGS.has(entry.tag)) {
      clearTimeout(deadlineTimer); // safe — clearTimeout(undefined) is a no-op
      return {
        kind: "requestError",
        error: { kind: "reservedResponseTag", tag: entry.tag } satisfies RequestError,
      };
    }
  }
  // clientSpec.responses check:
  for (const entry of Object.values(clientSpec.responses ?? {})) {
    if (entry !== undefined && RESERVED_RESPONSE_TAGS.has(entry.tag)) {
      clearTimeout(deadlineTimer);
      return {
        kind: "requestError",
        error: { kind: "reservedResponseTag", tag: entry.tag } satisfies RequestError,
      };
    }
  }

  // D-07: Serialize body at send() time — factory functions never throw
  // If JSON.stringify (or other serialization) throws, return requestError immediately (D-09)
  let serialized: { init?: BodyInit; contentType?: string } | undefined;
  if (spec.body !== undefined) {
    try {
      serialized = serializeBody(spec.body);
    } catch (e) {
      clearTimeout(deadlineTimer); // D-18: prevent timer leak on early return
      const message = e instanceof Error ? e.message : String(e);
      return {
        kind: "requestError",
        error: { kind: "bodySerializationFailed", message } satisfies RequestError,
      };
    }
  }

  // Build fetch init — conditional assignment required by exactOptionalPropertyTypes (Pitfall 6)
  const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
  if (serialized?.init !== undefined) fetchInit.body = serialized.init;
  // Set content-type from body serialization if caller has not set it explicitly
  if (serialized?.contentType !== undefined && headers["content-type"] === undefined) {
    headers["content-type"] = serialized.contentType;
  }
  if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;

  // D-10: Resolve retry policy once before the loop
  const retryPolicy = resolveRetryPolicy(spec.retry, clientSpec.retry);
  const maxAttempts = retryPolicy?.maxAttempts ?? 1;

  // SPEC §400: maxAttempts < 1 is a programming error — return requestError.invalidSpec
  if (maxAttempts < 1) {
    clearTimeout(deadlineTimer);
    return {
      kind: "requestError",
      error: { kind: "invalidSpec", message: "maxAttempts must be ≥ 1" } satisfies RequestError,
    };
  }

  const methods: readonly string[] = retryPolicy?.methods ?? [];
  const retryableStatuses = retryPolicy?.retryableStatuses ?? ([] as const);
  const initialDelayMs = retryPolicy?.initialDelayMs ?? 200;
  const maxDelayMs = retryPolicy?.maxDelayMs ?? 10_000;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // D-06: same fetchInit reused every attempt — serializeBody() ran once before loop
      const response = await effectiveFetch(url, fetchInit);

      // D-03: Status-first retry check — BEFORE matchResponse/decode
      // This ensures decodeError and unhandledStatus can ONLY arise on the final dispatch path (ADR-06)
      const isRetryableStatus = retryableStatuses.includes(response.status);
      const methodEligible = methods.includes(spec.method);
      const hasRetryBudget = attempt < maxAttempts - 1; // D-07: strict less-than (P5 prevention)
      if (
        isRetryableStatus &&
        methodEligible &&
        hasRetryBudget &&
        !(combinedSignal?.aborted === true) // D-09: explicit boolean comparison
      ) {
        response.body?.cancel().catch(() => {
          // Body discard is best-effort; ignore cancellation errors.
        }); // D-03: discard body — DO NOT read
        await sleepWithAbort(
          jitterDelay(attempt, initialDelayMs, maxDelayMs), // D-08: cap applied inside jitterDelay
          combinedSignal, // ADR-02: deadline covers backoff sleep; ADR-04: abort fires immediately
        );
        continue;
      }

      // Final dispatch: non-retryable status, exhausted budget, or ineligible method
      // D-15: body preview — first N bytes where N = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192
      // D-16: reader.read() rejects on signal fire → re-thrown → caught by outer catch → classifyTransportError
      // D-12: deadline during body reading → "timeout"; caller abort → "aborted"
      const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192;

      // D-13, D-14: Match status → decode → response | decodeError | unhandledStatus
      const match = matchResponse(response.status, spec.responses, clientSpec.responses);

      if (match === null) {
        // Unmatched status — stream not yet consumed, use streaming preview
        const preview = await readBodyPreview(response, maxBytes);
        return {
          kind: "unhandledStatus",
          status: response.status,
          headers: response.headers,
          preview,
        };
      }

      // Matched status — buffer full body for decode
      const bytes = await readBytes(response);
      if ("kind" in bytes) {
        // bodyReadFailed: stream consumed, preview unavailable
        return {
          kind: "decodeError",
          status: response.status,
          headers: response.headers,
          error: bytes,
          preview: { text: "", bytesRead: 0, truncated: true },
        };
      }

      const syntheticResponse = new Response(bytes);
      let decoded: unknown;
      try {
        decoded = await match.decode.fn(syntheticResponse);
      } catch (e: unknown) {
        const preview = previewFromBytes(bytes, maxBytes);
        return {
          kind: "decodeError",
          status: response.status,
          headers: response.headers,
          error: { kind: "bodyReadFailed", message: String(e) },
          preview,
        };
      }

      if (isDecodeError(decoded)) {
        const preview = previewFromBytes(bytes, maxBytes);
        return {
          kind: "decodeError",
          status: response.status,
          headers: response.headers,
          error: decoded,
          preview,
        };
      }

      // Happy path — decoder returned application data
      // as unknown as R: principled double-cast (D-06). The only path to reach here is via
      // a TaggedEntry<T> whose T is the R union component for this tag. TypeScript cannot
      // prove this statically because R is erased, but the invariant holds structurally.
      return {
        kind: "response",
        response: { tag: match.tag, body: decoded } as unknown as R,
      };
    }

    // Unreachable: loop always returns or throws via catch
    // TypeScript control-flow assurance — should never execute at runtime
    return classifyTransportError(new Error("retry loop exhausted without return"));
  } catch (error) {
    // Catches: fetch() network errors, sleepWithAbort() rejections (abort/deadline during backoff)
    return classifyTransportError(error);
  } finally {
    // D-08: clearTimeout fires whether loop resolved, threw, or slept+aborted (ADR-02)
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }
}
