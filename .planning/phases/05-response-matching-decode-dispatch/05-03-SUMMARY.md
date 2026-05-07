---
phase: "05"
plan: "03"
subsystem: transport-dispatch
tags: [dispatch, decode, response-matching, send, preview]
dependency_graph:
  requires: ["05-01", "05-02"]
  provides: ["end-to-end-dispatch", "send-happy-path"]
  affects: ["src/send.ts", "tests/unit/send.test.ts"]
tech_stack:
  added: []
  patterns:
    - "exhaustive DECODE_ERROR_KINDS set for isDecodeError type guard"
    - "as unknown as R double-cast for generic phantom type dispatch"
    - "readBodyPreview for unmatched-status streaming preview"
    - "previewFromBytes for post-readBytes decode-error preview"
key_files:
  created: []
  modified:
    - src/send.ts
    - tests/unit/send.test.ts
decisions:
  - "DECODE_ERROR_KINDS uses Set<string> (no as const) to satisfy Set.has(string) overload"
  - "isDecodeError uses (v as Record<string, unknown>)['kind'] as string to avoid as const issues"
  - "readBytes failure wraps as decodeError (not bodyReadFailed directly) matching SendResult union"
  - "headers field uses response.headers (Headers object) per SendResult type — not Object.fromEntries"
  - "response shape is { tag, body } as unknown as R — only principled cast in dispatch path"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-06T23:03:30Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 05 Plan 03: Decode Dispatch Wiring Summary

**One-liner:** JWT-free decode dispatch wired into send.ts — matchResponse → readBytes → decode → typed SendResult including response, decodeError, and unhandledStatus paths.

## What Was Built

Replaced the Phase 3 stub in `src/send.ts` (lines 168–174) with full decode dispatch logic:

1. **`matchResponse()`** — looks up `TaggedEntry` from request-level and client-level response maps
2. **Unmatched path** — calls `readBodyPreview(response, maxBytes)` streaming preview, returns `{ kind: "unhandledStatus" }`
3. **`readBytes()`** — buffers full body for matched status; returns `decodeError` on stream failure
4. **Synthetic Response** — constructs `new Response(bytes)` for the decoder
5. **Decoder invocation** — `match.decode.fn(syntheticResponse)` in try/catch; throws → `decodeError / bodyReadFailed`
6. **`isDecodeError()`** — duck-type check using exhaustive `DECODE_ERROR_KINDS` set (6 kinds)
7. **Decode error path** — calls `previewFromBytes(bytes, maxBytes)` for buffered preview
8. **Happy path** — `{ kind: "response", response: { tag: match.tag, body: decoded } as unknown as R }`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `as const` on DECODE_ERROR_KINDS Set caused typecheck failure**
- **Found during:** Task T1 typecheck
- **Issue:** `new Set([...] as const)` produces `Set<"unexpectedBody" | ...>` whose `.has()` only accepts the union type, not `string`. The plan's instruction included `as const` which is incompatible with calling `.has((v as Record<string, unknown>)["kind"] as string)`.
- **Fix:** Removed `as const` so Set infers as `Set<string>` — `.has(string)` works correctly.
- **Files modified:** `src/send.ts`
- **Commit:** 0ccd6bf

**2. [Rule 1 - Bug] Plan's `return bytes` for bodyReadFailed is not a valid SendResult**
- **Found during:** Task T1 code review
- **Issue:** Plan's dispatch pseudocode says `return bytes` when `readBytes` returns a bodyReadFailed object. But `SendResult<R>` has no `{ kind: "bodyReadFailed" }` variant — only `decodeError` wrapping a `DecodeError`. The research file (Pattern 3) has the correct shape.
- **Fix:** Return `{ kind: "decodeError", status, headers: response.headers, error: bytes, preview: { text: "", bytesRead: 0, truncated: false } }` per the research.
- **Files modified:** `src/send.ts`
- **Commit:** 0ccd6bf

**3. [Rule 1 - Bug] Plan's DECODE_ERROR_KINDS set had wrong kind strings**
- **Found during:** Task T1 code review
- **Issue:** Plan's critical constraints listed `"invalidContentType"` and `"decodeFailed"` which don't exist in `DecodeError` union. Missing `"schemaMismatch"` and `"custom"`.
- **Fix:** Used actual DecodeError kinds from `types.ts`: `unexpectedBody`, `emptyBody`, `invalidJson`, `schemaMismatch`, `bodyReadFailed`, `custom`.
- **Files modified:** `src/send.ts`
- **Commit:** 0ccd6bf

**4. [Rule 1 - Bug] Plan dispatch pseudocode has `headers: Object.fromEntries(response.headers)` but SendResult.headers is typed as `Headers`**
- **Found during:** Task T1 code review
- **Issue:** `Object.fromEntries(response.headers)` produces `Record<string, string>` but `SendResult.headers` is `Headers`. Using plain `response.headers` matches the type.
- **Fix:** Use `response.headers` directly (matching existing stub behavior and SendResult type).
- **Files modified:** `src/send.ts`
- **Commit:** 0ccd6bf

**5. [Rule 1 - Bug] SEND-06 test expected Phase 3 stub behavior (always unhandledStatus)**
- **Found during:** Task T2 (confirmed by test run — expected failure)
- **Issue:** Existing SEND-06 test asserted `result.kind === "unhandledStatus"` for a matched status with a decoder returning `DecodeError`. With real dispatch, this correctly returns `decodeError`.
- **Fix:** Updated SEND-06 describe/test descriptions and assertions to reflect actual Phase 5 behavior.
- **Files modified:** `tests/unit/send.test.ts`
- **Commit:** 4272e82

## Known Stubs

None — all dispatch paths are fully wired. The happy path, unhandled status path, bodyReadFailed path, and decodeError path are all real implementations.

## Test Coverage Added (SEND-10)

7 new integration tests covering:
1. Matched + successful decode → `response` with `{tag, body}`
2. Unmatched status → `unhandledStatus` via `readBodyPreview` 
3. Matched + decoder throws → `decodeError` / `bodyReadFailed` (no throw from send())
4. Matched + decoder returns DecodeError → `decodeError` + `previewFromBytes`
5. `bodyPreviewBytes` controls preview cap on decode error
6. Class-level `"2xx"` matcher hits status 201
7. `clientSpec.responses` fallback used when request map misses

## Self-Check: PASSED

- [x] `src/send.ts` exists and modified
- [x] `tests/unit/send.test.ts` exists and extended
- [x] Commit 0ccd6bf exists (T1)
- [x] Commit 4272e82 exists (T2)
- [x] `npm run typecheck` passes
- [x] `npm run test` passes: 131 passed | 3 skipped | 1 todo (135 total)
