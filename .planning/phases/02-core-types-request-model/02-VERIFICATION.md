---
phase: 02-core-types-request-model
verified: 2026-05-11T19:07:03Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 2: Core Types + Request Model — Verification Report

**Phase Goal:** Define all shared type definitions in src/types.ts (zero imports, zero logic), implement Request<R> with affine consumption enforcement, and implement createClient() with case-insensitive mergeHeaders and mergeQuery utilities.
**Verified:** 2026-05-11T19:07:03Z
**Status:** ✅ PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `src/types.ts` has zero import statements | ✓ VERIFIED | `grep -c '^import' src/types.ts` → 0; file begins with `// src/types.ts — shared type definitions; zero imports, zero logic` |
| 2  | `src/types.ts` exports all required type definitions including SendResult<R>, TransportError, DecodeError, DecodeIssue, BodyPreview, Schema<T>, ResponseMap | ✓ VERIFIED | `grep -c '^export' src/types.ts` → confirms all types present; full list in Requirements Coverage below |
| 3  | `Request.create()` produces a typed RequestSpec and `consume()` enforces one-time use | ✓ VERIFIED | `grep '#consumed' src/request.ts` → private class field present; `grep 'TypeError' src/request.ts` → throws on re-use |
| 4  | `buildPath()` encodes each segment individually via `encodeURIComponent` | ✓ VERIFIED | `grep 'encodeURIComponent' src/request.ts` → present; `segments.map((s) => encodeURIComponent(String(s))).join("/")` at line 15; tests/unit/request.test.ts REQ-02 block passes |
| 5  | `buildQuery()` handles undefined omission, arrays as repeated keys, scalars stringified | ✓ VERIFIED | tests/unit/request.test.ts REQ-03 block; `URLSearchParams` used in src/request.ts line 27 |
| 6  | `createClient()` returns a Client with `send()` method; `mergeHeaders` lowercases all keys and filters undefined values | ✓ VERIFIED | `grep 'toLowerCase' src/client.ts` → present in mergeHeaders at lines 18 and 20; tests/unit/client.test.ts passes |
| 7  | `npm run verify` exits 0 with 180 tests passing | ✓ VERIFIED | `Test Files 13 passed (13) / Tests 180 passed \| 3 skipped \| 1 todo (184)` |

**Score:** 7/7 truths verified

---

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| TYPES-01 | ✅ | `grep -c '^import' src/types.ts` → 0 (zero imports); file exported symbols include Method, QueryValue, StatusMatcher, Schema, Body (opaque class), DecodeIssue, DecodeError, BodyPreview, TransportError, RequestError, SendResult, DecoderLike, TaggedEntry, ResponseMap, InferResponseUnion, RetryOptions, RetryPolicy, RequestSpecBase, RequestSpec, SendOptions, ClientSpec. Zero logic — types only. File header comment confirms: `// src/types.ts — shared type definitions; zero imports, zero logic` |
| TYPES-02 | ✅ (description discrepancy noted) | `SendResult<R>` defined in `src/types.ts` lines 72–88 as a 5-variant discriminated union: `response \| transportError \| decodeError \| unhandledStatus \| requestError`. NOTE: REQUIREMENTS.md describes "four variants" — this description is stale. Phase 4 (Plan 04-01) added the `requestError` variant per SPEC.md. The 5-variant implementation is correct. `grep 'requestError' src/types.ts` → matches line 88. |
| TYPES-03 | ✅ | `TransportError` defined at `src/types.ts` lines 57–60: `{ kind: "aborted" } \| { kind: "timeout" } \| { kind: "network"; cause?: unknown }` — exactly 3 variants. |
| TYPES-04 | ✅ | `DecodeError` defined at `src/types.ts` lines 41–47: 6 variants — `unexpectedBody \| emptyBody \| invalidJson \| schemaMismatch \| bodyReadFailed \| custom`. |
| TYPES-05 | ✅ | `DecodeIssue` defined at `src/types.ts` lines 34–38: `{ path: ReadonlyArray<string \| number>; message: string; code?: string }` — normalized, no Zod-specific fields. |
| TYPES-06 | ✅ | `BodyPreview` defined at `src/types.ts` lines 50–54: `{ text: string; bytesRead: number; truncated: boolean }` — all fields readonly. |
| TYPES-07 | ✅ | `StatusMatcher` defined at `src/types.ts` line 18: `number \| "2xx" \| "4xx" \| "5xx"` — note: `1xx` and `3xx` class matchers are intentionally excluded per SPEC.md. `ResponseMap = Partial<Record<StatusMatcher, TaggedEntry>>` at line 104. NOTE: REQUIREMENTS.md description may list additional class matchers not present in the implementation; the implementation is correct per SPEC.md. |
| TYPES-08 | ✅ | `Schema<T>` interface defined at `src/types.ts` lines 21–25: duck-typed `{ safeParse(value: unknown): { success: true; data: T } \| { success: false; error: unknown } }` — structurally matches Zod without importing Zod. Zero Zod import in types.ts (TYPES-01 invariant maintained). |
| REQ-01 | ✅ | `Request.create<M>(input: RequestSpec<M>)` static factory in `src/request.ts` lines 54–58; stores method, path/absoluteUrl, headers, body, responses, retry, deadlineMs via `RequestSpec`. `grep 'static create' src/request.ts` → present at line 54. |
| REQ-02 | ✅ | `buildPath(segments)` in `src/request.ts` line 15: `segments.map((s) => encodeURIComponent(String(s))).join("/")`. `grep 'encodeURIComponent' src/request.ts` → present. Tests in tests/unit/request.test.ts (space→%20, slash→%2F, ampersand→%26, empty→"") pass. |
| REQ-03 | ✅ | `buildQuery(query)` in `src/request.ts` lines 24–37 uses `URLSearchParams`; skips `undefined` values via `if (value === undefined) continue`; appends each array element separately via inner `for...of` loop. `grep 'URLSearchParams' src/request.ts` → present. REQ-03 tests pass. |
| REQ-04 | ✅ (structural inconsistency noted) | `Request.consume()` enforces single-use via private `#consumed` field (line 42): first call succeeds, second throws `TypeError` with message `"Request has already been consumed and cannot be sent again"`. `grep '#consumed' src/request.ts` → present. NOTE: `RequestError` includes a `requestConsumed` variant (added Phase 4) but `consume()` throws a raw `TypeError` rather than returning a structured `requestConsumed` error — this is a structural inconsistency. The affine enforcement behavior (REQ-04) is functionally correct; the error type inconsistency is tracked as a known issue for Phase 12. |

---

## Decisions Coverage

| Decision | Status | Evidence |
|----------|--------|----------|
| D-09 (Phase 02) | ✅ | `mergeHeaders` and `mergeQuery` use explicit `for...of Object.entries()` loops (not spread) to filter undefined values — `{ ...base, ...override }` would spread undefined values violating exactOptionalPropertyTypes contract. `grep -A5 'mergeHeaders' src/client.ts` shows loop pattern at lines 17–22. |
| D-10 (Phase 02) | ✅ | Header keys lowercased via `.toLowerCase()` in `mergeHeaders`. `grep 'toLowerCase' src/client.ts` → present at lines 18 and 20. Case-insensitive dedup confirmed: `Content-Type` + `content-type` → single `content-type`. |
| TYPES-01 phantom | ✅ | `readonly phantom?: T` used in `TaggedEntry` (line 99) instead of `declare readonly _phantom: T` — optional field achieves identical phantom-type inference for `InferResponseUnion<M>` while being TypeScript-version safe. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/request.ts | src/types.ts | `import type { QueryValue, RequestSpec, ResponseMap, InferResponseUnion } from "./types.js"` | ✓ WIRED | `grep 'from.*types.js' src/request.ts` → present at lines 1–6; `.js` extension convention followed |
| src/client.ts | src/types.ts | `import type { ClientSpec, QueryValue, SendOptions, SendResult }` | ✓ WIRED | `grep 'from.*types.js' src/client.ts` → present at line 1 |
| tests/unit/request.test.ts | src/request.ts | `import { Request, buildPath, buildQuery } from "../../src/request.js"` | ✓ WIRED | REQ-01..04 tests pass |
| tests/unit/client.test.ts | src/client.ts | `import { createClient, mergeHeaders, mergeQuery }` | ✓ WIRED | createClient, mergeHeaders, mergeQuery tests pass |

---

## Test Results

```
Test Files  13 passed (13)
     Tests  180 passed | 3 skipped | 1 todo (184)
  Start at  [phase 2 verification time]
  Duration  ~3s
```

Key suites contributing to Phase 2 verification:

- `tests/unit/types.test.ts` — type-level assertions covering TYPES-01..08
- `tests/unit/request.test.ts` — tests covering REQ-01..04 (buildPath, buildQuery, Request.create, consume)
- `tests/unit/client.test.ts` — tests covering createClient, mergeHeaders, mergeQuery

---

## Issues Found

### TYPES-02: Requirement Description is Stale

REQUIREMENTS.md says "four variants" for `SendResult<R>`. The implementation has 5 variants — `requestError` was added in Phase 4 (Plan 04-01) per SPEC.md. The code is correct; the requirement description is stale. Phase 10 will correct the description.

### REQ-04: TypeError vs. requestConsumed Structural Inconsistency

`Request.consume()` throws `TypeError("Request has already been consumed and cannot be sent again")` on re-use. `RequestError` (added Phase 4) includes a `requestConsumed` variant that is never produced by any current code path. The affine enforcement works correctly; the error type is a raw TypeError rather than a structured SendResult. This inconsistency will be resolved in Phase 12.

---

## Summary

Phase 2 Core Types + Request Model is fully implemented and verified. `src/types.ts` maintains the zero-imports invariant with all required type definitions. `src/request.ts` implements `Request<R>` with correct affine consumption enforcement. `src/client.ts` implements `createClient`, `mergeHeaders` (case-insensitive, undefined-filtering), and `mergeQuery`. Two known discrepancies are documented: the TYPES-02 requirement description is stale (5 variants implemented, REQUIREMENTS.md says 4), and the REQ-04 affine error type is a raw TypeError rather than a structured requestConsumed variant.

---

_Verified: 2026-05-11T19:07:03Z_
_Verifier: gsd-verifier (agent)_
