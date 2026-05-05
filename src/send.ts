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

  // D-18: URL construction
  const url = buildEffectiveUrl(spec, clientSpec);

  // D-19: header merge — case-insensitive, request headers override client headers
  const headers = mergeEffectiveHeaders(clientSpec.headers, spec.headers);

  // Build fetch init — conditional assignment required by exactOptionalPropertyTypes (Pitfall 6)
  const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
  if (spec.body !== undefined) fetchInit.body = spec.body as BodyInit;
  // Plan 03-02: combinedSignal will be assigned here

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
    // Plan 03-02: classifyTransportError() replaces this simplified handler
    return { kind: "transportError", error: { kind: "network", cause: error } };
  }
  // Plan 03-02: finally { clearTimeout } added here
}
