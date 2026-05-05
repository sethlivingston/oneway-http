---
status: issues_found
phase: "03"
phase_name: transport-send
depth: standard
files_reviewed: 11
files_reviewed_list:
  - copilot-instructions.md
  - package.json
  - src/client.ts
  - src/request.ts
  - src/send.ts
  - src/types.ts
  - tests/unit/client.test.ts
  - tests/unit/request.test.ts
  - tests/unit/send.test.ts
  - tests/unit/types.test.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
---

# Phase 03: Code Review Report

**Reviewed:** 2025-07-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 3 transport/send implementation: `src/send.ts`, `src/client.ts`, `src/request.ts`, `src/types.ts`, and corresponding unit tests. The core logic of `performSend()`, `classifyTransportError()`, and `readBodyPreview()` is sound and well-structured. The `types.ts` zero-imports invariant is enforced in both the source and a dedicated test. The affine `Request.consume()` pattern is correct, and the deadline timer pattern (using `setTimeout` + `AbortController` rather than `AbortSignal.timeout()`) is correctly motivated and mostly correctly implemented.

Three issues were found: one resource-leak bug in `performSend()` where the deadline timer is set up outside the `try/finally` block that clears it, one correctness bug in `readBodyPreview()` for the `maxBytes === 0` edge case, and a test-quality problem with duplicated suite IDs. One lower-priority inconsistency in the pre-abort guard is noted for awareness.

---

## Warnings

### WR-01: Deadline timer leaks when URL construction throws

**File:** `src/send.ts:183-202`

**Issue:** `deadlineTimer` is created at line 186 inside the `if (effectiveDeadlineMs !== undefined)` block, but `buildEffectiveUrl(spec, clientSpec)` is called at line 202 — **outside** the `try/finally` that clears the timer. If `buildEffectiveUrl` throws (e.g., `absoluteUrl` is an invalid URL string, or `baseUrl` is `undefined`/empty while `spec.path` is non-empty), the function throws before entering the `try` block. The `finally` block at line 230 never runs. `clearTimeout(deadlineTimer)` is never called.

In Node.js, `setTimeout` timers without `.unref()` hold the event loop open until they fire. A leaked timer with `deadlineMs: 60000` would prevent clean process exit for a full minute after a programming error. In long-running servers processing high volumes of requests, leaked timers accumulate until each eventually fires.

Concrete trigger: `new URL("users", "")` throws `TypeError: Invalid URL` when `clientSpec.baseUrl` is `undefined` and `spec.path` is `["users"]`. With any positive `deadlineMs` configured, this creates a leaked timer.

**Fix:** Move `buildEffectiveUrl` (and `mergeEffectiveHeaders`) inside the `try/finally` block, or restructure to ensure the timer is only created after URL construction succeeds:

```typescript
// Option A: move URL construction before timer setup
const url = buildEffectiveUrl(spec, clientSpec);           // throws first, no timer yet
const headers = mergeEffectiveHeaders(clientSpec.headers, spec.headers);

if (effectiveDeadlineMs !== undefined) {
  deadlineController = new AbortController();
  const dc = deadlineController;
  deadlineTimer = setTimeout(() => {
    dc.abort(new DOMException("Deadline exceeded", "TimeoutError"));
  }, effectiveDeadlineMs);
}

// ... combinedSignal setup ...

try {
  const response = await effectiveFetch(url, fetchInit);
  // ...
} catch (error) {
  return classifyTransportError(error);
} finally {
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
}
```

This preserves the existing `finally`-based cleanup without changing any behavior for the non-error path.

---

### WR-02: `readBodyPreview` returns `truncated: false` incorrectly when `maxBytes === 0`

**File:** `src/send.ts:97-121`

**Issue:** When `clientSpec.diagnostics?.bodyPreviewBytes` is set to `0` (or any value `≤ 0`), `maxBytes` is `0`. The `while (bytesRead < maxBytes)` loop guard evaluates `0 < 0 = false` and the loop body never executes. `truncated` stays at its initial value of `false`. The function returns `{ text: "", bytesRead: 0, truncated: false }` even if the response body is non-empty.

Per the `BodyPreview` contract, `truncated: true` means "more data exists beyond what was read." A body with content that was not read because `maxBytes === 0` satisfies that condition; returning `false` is incorrect.

`bodyPreviewBytes` is typed `number | undefined` with no minimum-value validation, so `0` and negative values are accepted without error.

**Fix:** Add a guard before the reader loop (the reader still needs to be cancelled to release the TCP connection):

```typescript
async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> {
  if (response.body === null) {
    return { text: "", bytesRead: 0, truncated: false };
  }

  // maxBytes <= 0: no preview requested; cancel stream immediately
  if (maxBytes <= 0) {
    const reader = response.body.getReader();
    await reader.cancel().catch(() => {});
    return { text: "", bytesRead: 0, truncated: true };
  }

  const reader = response.body.getReader();
  // ... rest of existing logic unchanged ...
}
```

Alternatively, add validation in `performSend` parallel to the `deadlineMs` check:

```typescript
const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192;
if (maxBytes <= 0) {
  throw new RangeError("diagnostics.bodyPreviewBytes must be a positive integer");
}
```

---

### WR-03: Duplicate `describe` suite IDs in send.test.ts

**File:** `tests/unit/send.test.ts:13, 73, 118, 306, 408`

**Issue:** Three separate `describe` blocks are labeled `"SEND-02"` and two are labeled `"SEND-06"`. Specifically:

- Line 13: `"SEND-02: performSend() never throws for HTTP outcomes"`
- Line 73: `"SEND-02: performSend() pre-abort guard (D-05)"` ← should be SEND-03 or similar
- Line 118: `"SEND-02: deadlineMs validation (D-07)"` ← should be SEND-04 or similar
- Line 306: `"SEND-06: AbortSignal.any() composition — deadline and caller abort (D-09, D-10)"`
- Line 408: `"SEND-06: body preview reading (D-15, D-16, D-17)"` ← should be SEND-07 or similar

Test reporters (Vitest's built-in reporter, CI output, coverage tools) use suite names for identification and grouping. Duplicate names make failures ambiguous in CI output and mean that the "pre-abort guard" and "deadlineMs validation" suites are not independently addressable by ID. This also suggests the spec requirement numbering was not tracked consistently as tests were added.

**Fix:** Assign each `describe` block a unique sequential ID matching the requirement it covers. Based on the content, the corrected IDs should be:

- Line 73: `"SEND-03: performSend() pre-abort guard (D-05)"`
- Line 118: `"SEND-04: deadlineMs validation (D-07)"`
- Line 408: `"SEND-07: body preview reading (D-15, D-16, D-17)"`

---

## Info

### IN-01: Pre-abort guard returns `"aborted"` regardless of signal reason

**File:** `src/send.ts:159-161`

**Issue:** The pre-abort guard at line 159 always returns `{ kind: "transportError", error: { kind: "aborted" } }` without inspecting `options.signal.reason`. In contrast, `classifyTransportError` (line 63) duck-types the error's `.name` property to distinguish `"TimeoutError"` from `"AbortError"`.

If a caller passes a signal that was previously aborted due to a timeout — for example, if a `deadlineController.signal` from a prior request is stored and reused — `performSend` returns `"aborted"` instead of `"timeout"`, inconsistent with what `classifyTransportError` would return for the same signal reason.

In practice, callers are unlikely to reuse a timed-out signal across calls (the pre-abort guard is primarily for `AbortController.abort()` use cases), so this has low practical impact today. It is noted here as a consistency gap that could matter if the signal type is expanded in future phases.

**Fix (optional):** Apply the same `name`-based classification in the pre-abort path:

```typescript
if (options?.signal?.aborted === true) {
  const reason: unknown = options.signal.reason;
  let name = "";
  if (reason !== null && typeof reason === "object" && "name" in reason) {
    const n = reason.name;
    if (typeof n === "string") name = n;
  }
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  return { kind: "transportError", error: { kind: "aborted" } };
}
```

---

_Reviewed: 2025-07-24T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
