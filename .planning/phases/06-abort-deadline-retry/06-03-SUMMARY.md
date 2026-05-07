# Plan 06-03 Summary — Retry Loop in send.ts

**Status:** COMPLETE ✅
**Wave:** 2 (final)
**Files modified:** `src/send.ts`, `tests/unit/send.test.ts`

## Tasks Executed

### T1: Three edits to src/send.ts

1. **Import** — Added `import { resolveRetryPolicy, jitterDelay, sleepWithAbort } from "./retry.js"` after last existing import.

2. **Policy resolution** — Inserted before `try {`:
   - `resolveRetryPolicy(spec.retry, clientSpec.retry)` → null or ResolvedRetryPolicy
   - Guard: `maxAttempts < 1` → returns `requestError.invalidSpec` immediately
   - Extracted loop constants: `methods`, `retryableStatuses`, `initialDelayMs`, `maxDelayMs`

3. **Retry loop** — Replaced single-attempt `try/catch/finally` with:
   - `for (let attempt = 0; attempt < maxAttempts; attempt++)` (D-07: strict less-than)
   - Status-first check BEFORE matchResponse/decode (D-03)
   - `isRetryableStatus && methodEligible && hasRetryBudget && !(combinedSignal?.aborted === true)`
   - `response.body?.cancel()` → `sleepWithAbort(jitterDelay(...), combinedSignal)` → `continue`
   - Final dispatch (non-retryable path): unhandledStatus, decodeError, or response — unchanged logic
   - Unreachable fallthrough `classifyTransportError(new Error(...))` for TypeScript flow assurance

### T2: Remove `as never` casts + fix timer leak

- Removed all 9 `as never` casts from ADR-XX blocks in `tests/unit/send.test.ts`
- Fixed leaked 300ms timer in SEND-05: wrapped `controller.enqueue` in try/catch to guard against already-closed controller (race condition with slower ADR retry tests)

## Test Results

| Suite | Before | After |
|---|---|---|
| `retry.test.ts` | 21/21 GREEN | 21/21 GREEN |
| `send.test.ts` | 42 pass / 4 fail | **46/46 GREEN** |
| All other tests | unchanged | unchanged |
| Total | 149 pass / 4 fail | **153/153 GREEN** |

## Verification Gates

- `grep -c "as never" tests/unit/send.test.ts` → **0** ✅
- `npx tsc --noEmit` → **clean** ✅
- `npx vitest run --project node` → **153 passed, 0 errors** ✅

## Commit

`7e1d0e7` — feat(06-03): add retry loop to send.ts — all ADR tests pass
