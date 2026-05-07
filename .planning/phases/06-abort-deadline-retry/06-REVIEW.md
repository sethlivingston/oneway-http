---
phase: 06-abort-deadline-retry
reviewed: 2025-07-22T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - src/retry.ts
  - src/send.ts
  - tests/unit/retry.test.ts
  - tests/unit/send.test.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2025-07-22  
**Depth:** deep  
**Files Reviewed:** 4  
**Status:** issues_found

## Summary

Reviewed the Phase 6 retry loop implementation in `src/send.ts` and the retry utilities in `src/retry.ts`, along with their unit test coverage. The core architecture is sound: all ten spec-verification items in the prompt check out.

- **Loop bound** (`attempt < maxAttempts`, not `<=`): ✅ line 199  
- **`response.body?.cancel()` before `sleepWithAbort`**: ✅ lines 214–218  
- **`combinedSignal` (not `callerSignal`) passed to `sleepWithAbort`**: ✅ line 217  
- **`combinedSignal?.aborted === true` explicit boolean comparison**: ✅ line 212  
- **`jitterDelay` — `Math.min` wraps the base before `Math.random()` multiplication**: ✅ line 86  
- **`sleepWithAbort` — pre-abort check on entry + `{ once: true }` listener**: ✅ lines 106, 116  
- **`resolveRetryPolicy` — D-10 semantics (request false → null, undefined → inherit, true → defaults, RetryOptions → library-defaults-only merge)**: ✅ lines 47–68  
- **No `as never` casts in `tests/unit/send.test.ts`**: ✅  
- **No circular import introduced** (`send.ts → retry.ts → types.ts`): ✅  
- **`types.ts` still has zero imports**: ✅

One warning-level correctness gap and one stale comment were found.

---

## Warnings

### WR-01: `response.body?.cancel()` — floating Promise risks unhandled rejection crash in Node 24

**File:** `src/send.ts:214`

**Issue:** `response.body?.cancel()` returns `Promise<void>`, but the return value is neither `await`-ed nor has a `.catch()` attached. In Node 24 (and every Node version since 15), unhandled promise rejections kill the process by default (`--unhandled-rejections=throw`). `ReadableStream.cancel()` can reject if the underlying source's cancel algorithm fails — for example when the TCP socket underlying an undici response has already errored or been half-closed. The comment "cancel is always safe" is aspirational, not a runtime guarantee.

If `cancel()` rejects after the microtask queue advances (i.e., after `await sleepWithAbort(...)` already resumed), the rejection is emitted as an unhandled rejection and crashes the Node 24 process.

**Fix:** Explicitly suppress the rejection with a no-op catch so the intent (fire-and-forget body discard) is both correct and self-documenting:

```ts
// Before:
response.body?.cancel();

// After:
response.body?.cancel().catch(() => {
  // Body discard is best-effort; ignore cancellation errors.
});
```

`await`-ing it is also acceptable and lets the outer `try/catch` handle any error, but introduces a small delay before the backoff sleep begins — likely undesirable in the hot retry path.

---

## Info

### IN-01: Stale Wave 0 planning comment in `tests/unit/send.test.ts`

**File:** `tests/unit/send.test.ts:705`

**Issue:** The comment `// Wave 0: retry type will be corrected in 06-02-PLAN.md; esbuild strips types at test time` was written during the Wave 0 TDD stub phase. Wave 1 (06-02) has since completed: `src/retry.ts` exists, the `RetryOptions` type is in `types.ts`, and the retry integration tests are green. The comment now misrepresents the state of the code — a future reader will waste time looking for a correction that already happened.

**Fix:** Remove the comment, or replace it with a brief statement of what the test actually verifies:

```ts
// ADR-03: maxAttempts:3 exhausted on persistent 502 → exactly 3 fetch calls (no off-by-one)
retry: { maxAttempts: 3, retryableStatuses: [502] },
```

---

_Reviewed: 2025-07-22_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_
