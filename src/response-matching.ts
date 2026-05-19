// src/response-matching.ts — pure function for two-tier response map lookup
import type { ResponseMap, StatusMatcher, TaggedEntry } from "./types.js";

/**
 * Derives the class-level StatusMatcher for a numeric HTTP status code.
 * For example: 201 → "2xx", 404 → "4xx".
 * Not exported — internal implementation detail.
 */
function classOf(status: number): StatusMatcher {
  return (String(Math.floor(status / 100)) + "xx") as unknown as StatusMatcher;
}

/**
 * Looks up the appropriate TaggedEntry for the given HTTP status code by
 * consulting requestMap then clientMap in four ordered steps:
 *
 * 1. requestMap[status]           — exact match in request-level map
 * 2. clientMap[status]            — exact match in client-level map
 * 3. requestMap[classOf(status)]  — class match in request-level map (e.g. "2xx")
 * 4. clientMap[classOf(status)]   — class match in client-level map
 *
 * Exact matches always beat class matches regardless of layer.
 * Within each tier (exact or class), the request map takes precedence over the client map.
 *
 * Returns the first TaggedEntry found, or null if no entry matches.
 *
 * Maps are NEVER pre-merged; both are consulted independently in order.
 */
export function matchResponse(
  status: number,
  requestMap: ResponseMap | undefined,
  clientMap: ResponseMap | undefined,
): TaggedEntry | null {
  // Tier 1: exact match — request wins ties
  if (requestMap !== undefined) {
    const exactReq = requestMap[status];
    if (exactReq !== undefined) return exactReq;
  }

  if (clientMap !== undefined) {
    const exactCli = clientMap[status];
    if (exactCli !== undefined) return exactCli;
  }

  const cls = classOf(status);

  // Tier 2: class match — request wins ties
  if (requestMap !== undefined) {
    const classReq = requestMap[cls];
    if (classReq !== undefined) return classReq;
  }

  if (clientMap !== undefined) {
    const classCli = clientMap[cls];
    if (classCli !== undefined) return classCli;
  }

  return null;
}
