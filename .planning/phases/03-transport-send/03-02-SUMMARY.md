# Plan 03-02 Summary: Deadline Controller + AbortSignal Composition

**Commit:** 0166f4f
**Status:** ✅ Complete

## What was done

### Task 1: classifyTransportError + deadline controller
- Added `classifyTransportError()` before `performSend()` in `src/send.ts`
  - `name === "TimeoutError"` → `{ kind: "timeout" }`
  - `name === "AbortError"` → `{ kind: "aborted" }`
  - otherwise → `{ kind: "network", message }`
- Implemented deadline `AbortController` with `setTimeout` (not `AbortSignal.timeout()` per D-08)
- Cleared timer in `finally` block (clearTimeout in finally)
- `AbortSignal.any()` composed from 4 cases: none, deadline-only, caller-only, both
- `exactOptionalPropertyTypes` guard: `fetchInit.signal` assigned only inside `if (combinedSignal !== undefined)`
- D-10 critical: deadline abort reason = `new DOMException("Deadline exceeded", "TimeoutError")` so `name === "TimeoutError"` not `"AbortError"`

### Task 2: Real tests
- SEND-02: 4 deadlineMs validation tests (below zero, above 3600000, non-integer, zero = allowed)
- SEND-05: 2 deadline resolution tests (request overrides client, client fallback)
- SEND-06: 3 abort composition tests (deadline→timeout, caller→aborted, finally cleanup on throw)

## Key fix
Mock fetch functions updated to propagate `signal.reason` via `addEventListener("abort", () => reject(signal.reason))` — simulates how native `fetch()` rejects with the abort reason. Without this, abort tests received "network" instead of "timeout"/"aborted".

## Test counts
- Before: 39 passing
- After: 48 passing + 21 todo
