---
phase: 08-documentation-polish
reviewed: 2025-07-17T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/matcher.ts
  - src/send.ts
  - src/index.ts
  - tests/unit/send.test.ts
  - README.md
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2025-07-17  
**Depth:** standard  
**Files Reviewed:** 5  
**Status:** issues_found

## Summary

This branch delivers reserved-tag validation, TSDoc documentation, a cleaned-up `index.ts`, and a full README rewrite. The scaffolding cleanup and documentation polish are solid. Two correctness bugs were found: a silent `undefined` return in `matcher.ts` when a response-tag handler is missing at runtime, and a timer leak in `send.ts` on the `maxAttempts < 1` early-return path. Both are independently reproducible without exotic conditions.

---

## Critical Issues

### CR-01: `matcher.ts` silently returns `undefined` when a response-tag handler is not found

**File:** `src/matcher.ts:48-50`  
**Issue:** The `"response"` branch casts `handler` out of a `Record<string, fn>` lookup, then checks `if (handler === undefined)` — but on the true branch it returns `handler as unknown as T`, which is `undefined` cast to `T`. The intent appears to be a defensive runtime guard for a path TypeScript claims is unreachable, but executing the guard silently returns `undefined` to the caller instead of throwing. Any consumer using `Send.match()` who reaches this branch (e.g., through `as any` or a JS caller) receives `undefined` without any indication something went wrong.

```ts
// current — returns undefined silently:
if (handler === undefined) {
  return handler as unknown as T;   // ← undefined cast to T
}
```

**Fix:** Throw a descriptive error. The type system already prevents valid callers from hitting this, so a throw is the correct runtime sentinel:

```ts
if (handler === undefined) {
  throw new Error(
    `[oneway-http] No handler for response tag "${result.response.tag}". ` +
    `All response tags must be covered by the Matcher.`
  );
}
```

---

### CR-02: `send.ts` leaks `deadlineTimer` on `maxAttempts < 1` early return

**File:** `src/send.ts:219-224`  
**Issue:** `deadlineTimer` is created at line 152 (before the reserved-tag and body-serialization checks). Every other early-return path before the `try/finally` block explicitly calls `clearTimeout(deadlineTimer)`. The `maxAttempts < 1` guard at line 219 is the sole exception — it returns without clearing the timer. Because this return is outside the `try` block (which starts at line 231), the `finally { clearTimeout(deadlineTimer) }` at line 333 never executes. The timer fires after `effectiveDeadlineMs` milliseconds and calls `deadlineController.abort()` on a controller that is no longer relevant.

```ts
// current — timer leaks when maxAttempts < 1 and a deadlineMs was set:
if (maxAttempts < 1) {
  return {                                        // ← deadlineTimer never cleared
    kind: "requestError",
    error: { kind: "invalidSpec", message: "maxAttempts must be ≥ 1" } satisfies RequestError,
  };
}
```

**Fix:** Add `clearTimeout(deadlineTimer)` before the return, matching the pattern used at lines 171 and 181:

```ts
if (maxAttempts < 1) {
  clearTimeout(deadlineTimer);                    // ← prevent timer leak
  return {
    kind: "requestError",
    error: { kind: "invalidSpec", message: "maxAttempts must be ≥ 1" } satisfies RequestError,
  };
}
```

---

## Warnings

### WR-01: `performSend` is exported with no TSDoc — missing `@internal`, `@param`, `@returns`

**File:** `src/send.ts:113`  
**Issue:** `performSend` is the only `export` in `send.ts` and is the single entry point for the transport core. Every other inter-module helper exported in this codebase (e.g., `mergeHeaders`, `mergeQuery`, `buildPath`, `buildQuery`, `serializeBody`, `readBytes`) carries at least an `@internal` tag plus `@param`/`@returns`. `performSend` has none. It is not re-exported from `src/index.ts`, so it qualifies as `@internal`.

**Fix:**

```ts
/**
 * @internal
 * Executes a single send cycle (with retries) for a consumed `Request`.
 * Called by `createClient().send()` — not part of the public API.
 *
 * @param request - A `Request<R>` instance; consumed exactly once inside this call.
 * @param clientSpec - The `ClientSpec` used to construct the owning `Client`.
 * @param options - Optional per-call options including a caller `AbortSignal`.
 * @returns A `Promise<SendResult<R>>` that always resolves — never rejects.
 */
export async function performSend<R>(
```

---

### WR-02: SEND-11 `clientSpec.responses` case tests only one reserved tag, not all four

**File:** `tests/unit/send.test.ts:901-914`  
**Issue:** The `spec.responses` path uses `it.each` over all four reserved tags (`"transportError"`, `"decodeError"`, `"unhandledStatus"`, `"requestError"`). The parallel `clientSpec.responses` path tests only `"transportError"`. If a future change accidentally narrowed the `RESERVED_RESPONSE_TAGS` Set or altered the loop condition, three of the four collisions would go undetected on the `clientSpec.responses` path.

**Fix:** Promote the `clientSpec.responses` test to the same `it.each` pattern:

```ts
it.each(["transportError", "decodeError", "unhandledStatus", "requestError"] as const)(
  "returns requestError.reservedResponseTag for reserved tag '%s' in clientSpec.responses",
  async (reservedTag) => {
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      responses: {
        200: { tag: reservedTag, decode: stubDecode },
      },
    });
    expect(result.kind).toBe("requestError");
    if (result.kind === "requestError") {
      expect(result.error.kind).toBe("reservedResponseTag");
      if (result.error.kind === "reservedResponseTag") {
        expect(result.error.tag).toBe(reservedTag);
      }
    }
  },
);
```

---

_Reviewed: 2025-07-17_  
_Reviewer: gsd-code-reviewer_  
_Depth: standard_
