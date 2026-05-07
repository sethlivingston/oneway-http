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
 * 1. requestMap[status]        — exact match in request-level map
 * 2. requestMap[classOf(status)] — class match in request-level map (e.g. "2xx")
 * 3. clientMap[status]         — exact match in client-level map
 * 4. clientMap[classOf(status)] — class match in client-level map
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
  if (requestMap !== undefined) {
    const exactReq = requestMap[status];
    if (exactReq !== undefined) return exactReq;

    const classReq = requestMap[classOf(status)];
    if (classReq !== undefined) return classReq;
  }

  if (clientMap !== undefined) {
    const exactCli = clientMap[status];
    if (exactCli !== undefined) return exactCli;

    const classCli = clientMap[classOf(status)];
    if (classCli !== undefined) return classCli;
  }

  return null;
}
