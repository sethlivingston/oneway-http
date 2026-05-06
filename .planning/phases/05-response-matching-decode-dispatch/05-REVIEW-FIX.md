---
phase: "05"
fixed_at: "2026-05-06T23:35:50Z"
review_path: .planning/phases/05-response-matching-decode-dispatch/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 05 Code Review — Fix Report

**Status:** FIXED
**Fixes applied:** 3/3
**Iteration:** 1

## Fixes Applied

### fix(05): previewFromBytes — guard maxBytes <= 0 to match readBodyPreview
**Finding:** MEDIUM — `previewFromBytes` mishandles `maxBytes < 0`
**File:** `src/preview.ts`
**Commit:** `5f6230f`
**Change:** Added `if (maxBytes <= 0) { return { text: "", bytesRead: 0, truncated: bytes.length > 0 }; }` early-return at the top of `previewFromBytes`, matching the guard already present in `readBodyPreview`. Without this guard, JavaScript's negative-index semantics in `Uint8Array.slice(0, negativeN)` returned wrong bytes.

### fix(05): send — truncated:true when readBytes returns bodyReadFailed
**Finding:** MEDIUM — `truncated: false` is semantically wrong when `readBytes` fails
**File:** `src/send.ts`
**Commit:** `7fe0c87`
**Change:** Changed `truncated: false` → `truncated: true` in the `bodyReadFailed` early-return block (line ~211). `bodyReadFailed` only occurs when `response.body` is non-null but the stream errored — the body was cut short, so `truncated: true` is the correct semantic.

### test(05): send — cover bodyReadFailed path from readBytes failure
**Finding:** MEDIUM — No test for the matched-status `readBytes` bodyReadFailed dispatch path
**File:** `tests/unit/send.test.ts`
**Commit:** `66919dd`
**Change:** Added test to SEND-10 group. The test creates a `ReadableStream` that errors immediately in `start(controller)`, wraps it in a `Response` with status 200, uses a request with `responses: { 200: Decode.json().as("data") }` (status IS matched), calls `performSend`, and asserts `result.kind === "decodeError"`, `result.error.kind === "bodyReadFailed"`, and `result.preview.truncated === true` (validating the fix from Finding 2).

## Verification

`npm run verify` passed: typecheck clean, lint clean, all 11 test files green (132 tests passed, 3 skipped, 1 todo).

---

_Fixed: 2026-05-06T23:35:50Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
