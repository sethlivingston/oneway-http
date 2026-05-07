# Phase 6: Abort, Deadline & Retry — Research

**Researched:** 2026-05-08
**Domain:** TypeScript HTTP client — retry engine, abort-aware backoff, deadline scoping
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `RetryPolicy` type becomes `true | false | RetryOptions`; replaces the current `interface RetryPolicy { ... }`.  
**D-02:** Field renames: `backoffMs.initial → initialDelayMs` (default 200), `backoffMs.max → maxDelayMs` (default 10_000). All defaults: `maxAttempts=3`, `methods=["GET","HEAD","QUERY"]`, `retryableStatuses=[502,503,504]`.  
**D-03:** Retry lifecycle is status-first — check raw HTTP status before matchResponse/decode. Loop structure: `for (let attempt = 0; attempt < maxAttempts; attempt++)` — retryable + methodEligible + hasRetryBudget + signal live → cancel body, sleep, continue; otherwise dispatch.  
**D-04:** No `fetchOnce()` extraction — inline both phases in the loop body.  
**D-05:** Retry loop inline in `send.ts`; utility placement (`sleepWithAbort`, `jitterDelay`, `resolveRetryPolicy`) at agent's discretion.  
**D-06:** Body replay is free — `serializeBody()` runs once, same `fetchInit` passed every attempt.  
**D-07:** `attempt < maxAttempts` (strict `<`), never `<=`. `maxAttempts=3` → attempts 0, 1, 2.  
**D-08:** Jitter formula: `Math.floor(Math.random() * Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt)))` — `Math.min` BEFORE `Math.random`.  
**D-09:** `sleepWithAbort` implementation (exact): early-exit on pre-aborted signal; `setTimeout(resolve, ms)`; `signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason) }, { once: true })`.  
**D-10:** `resolveRetryPolicy` — no field-level merge between request and client; `RetryOptions` on request fully replaces client's; unspecified fields fall back to library defaults only.

### Agent's Discretion

- Whether to extract `src/retry.ts` for utilities vs keep inline in `send.ts`
- Internal variable names and comment style
- Test file structure and mock-fetch pattern for counting attempts
- `resolveRetryPolicy()` exact signature

### Deferred Ideas (OUT OF SCOPE)

- `Send.match()` / `Send.Matcher<R,T>` → Phase 7
- `Retry-After` header awareness → deferred to v2
- Streaming body retry → deferred to v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADR-01 | Abort — caller-scoped `AbortSignal` passed to `send()`; surfaces as `transportError.aborted` | D-09 `sleepWithAbort` + existing pre-abort guard; no changes to pre-abort guard |
| ADR-02 | Deadline covers entire operation: all attempts + backoff sleep + body read + decode; expiry is terminal | Existing `deadlineController`/`combinedSignal` already outside the loop; `sleepWithAbort(combinedSignal)` extends coverage into backoff windows |
| ADR-03 | Retry attempt count is exactly `maxAttempts - 1` retries (condition `attempt < maxAttempts`) | D-07 off-by-one rule; test-first required |
| ADR-04 | Backoff sleep is abort-aware — signal fire resolves immediately | D-09 `sleepWithAbort` implementation; P6 pitfall test |
| ADR-05 | Jitter never exceeds `maxDelayMs` | D-08 formula; P7 pitfall test |
| ADR-06 | Retry never triggers on `decodeError`, `unhandledStatus`, caller `aborted`, or deadline `timeout` | D-03 status-first structure; `decodeError`/`unhandledStatus` can only arise on final dispatch |
| ADR-07 | Default retry policy applies to GET/HEAD/QUERY on 502/503/504 | D-02 defaults; `resolveRetryPolicy` returns defaults when no policy set |
</phase_requirements>

---

## Summary

Phase 6 wraps `send()`'s single-attempt fetch block in a retry loop that is status-first: the decision to retry is made against the raw HTTP status code before body reading or decode. The locked design is well-specified and SPEC-aligned with one important **gap** to flag: D-03's loop structure shows only the status-based retry path; network errors thrown by `fetch()` are caught but not retried. ADR-07's mention of "transport failures" creates ambiguity that the planner must resolve.

The codebase is in excellent shape for this phase. `send.ts` (255 lines) has its deadline controller and `combinedSignal` already correctly scoped outside any loop. `serializeBody()` already runs once before the fetch block. The existing try/catch/finally wraps the entire dispatch path and just needs to be extended to wrap the retry loop. The only structural surgery is: replace lines 180–254 (the single-attempt fetch block) with the retry loop body, while the outer finally (`clearTimeout(deadlineTimer)`) stays in place.

`src/retry.ts` is recommended for the four utilities (`sleepWithAbort`, `jitterDelay`, `resolveRetryPolicy`, `RETRY_DEFAULTS`). This keeps `send.ts` readable and makes the utilities independently testable. All three critical pitfalls (P5 off-by-one, P6 abort-unaware sleep, P7 jitter overflow) are testable with real timers and small delay values — no fake timer infrastructure required.

**Primary recommendation:** Extract utilities to `src/retry.ts`; write the three pitfall tests first; replace lines 180–254 in `send.ts` with the retry loop.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Retry loop | API/Backend (`send.ts`) | — | All retry state is send-call-scoped; loop owns fetch orchestration |
| Retry policy resolution | Utility module (`retry.ts`) | `send.ts` (caller) | Pure function, no side effects, independently testable |
| Backoff sleep | Utility module (`retry.ts`) | — | Pure async primitive; depends only on timers and AbortSignal |
| Jitter formula | Utility module (`retry.ts`) | — | Pure math function; must be separately testable for P7 |
| Deadline scoping | `send.ts` (existing) | — | Stays outside retry loop — whole-operation deadline already correct |
| Type definitions | `types.ts` | — | `RetryOptions`, `RetryPolicy` union — zero logic, zero imports |

---

## Research Findings by Question

### Q1: Retry loop restructure in `send.ts`

**Current structure (lines 180–254):**
```ts
try {
  const response = await effectiveFetch(url, fetchInit);
  // ... match/decode block ...
  return { kind: "response", ... };
} catch (error) {
  return classifyTransportError(error);
} finally {
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
}
```

**New structure:**
```ts
try {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await effectiveFetch(url, fetchInit);
    } catch (error) {
      return classifyTransportError(error); // network/abort/timeout — no retry (D-03)
    }

    // D-03: Status-first retry check (BEFORE matchResponse/decode)
    const isRetryableStatus = retryableStatuses.includes(response.status);
    const methodEligible = (methods as readonly string[]).includes(spec.method);
    const hasRetryBudget = attempt < maxAttempts - 1;
    if (isRetryableStatus && methodEligible && hasRetryBudget && !(combinedSignal?.aborted === true)) {
      response.body?.cancel();
      await sleepWithAbort(jitterDelay(attempt, initialDelayMs, maxDelayMs), combinedSignal);
      continue;
    }

    // Final dispatch: match → decode → return
    // ... existing match/decode block from lines 189–248 ...
    return { kind: "response", ... };
  }
  // Should be unreachable (loop always returns or throws), but TypeScript needs assurance:
  return classifyTransportError(new Error("retry loop exhausted without return"));
} finally {
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
}
```

**Key points:**
- The outer `try/finally` for `clearTimeout` is UNCHANGED — it stays wrapped around the loop.
- The inner `try/catch` for `fetch()` stays; on network error, we return `classifyTransportError` immediately (no retry — see Q8 for rationale).
- `sleepWithAbort` rejects when `combinedSignal` fires; the rejection propagates up through the outer try/finally → `classifyTransportError` is NOT needed here because `sleepWithAbort` rejects with `signal.reason`, which already has `name === "AbortError"` or `name === "TimeoutError"`. Wait — actually `sleepWithAbort` rejects with `signal.reason` and that rejection exits the loop body, propagates out of the outer `try` → there's no outer catch, so it becomes an unhandled rejection. **Critical:** Need an outer `catch` or handle the `sleepWithAbort` rejection.

**Correction to structure:** The `sleepWithAbort` rejection must be caught. Two options:
1. Wrap the entire retry loop in try/catch (classifyTransportError handles it)
2. Catch just `sleepWithAbort`

Option 1 is cleaner:
```ts
try {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await effectiveFetch(url, fetchInit); // inner try not needed if...
    // status-first check...
    if (retry condition) {
      response.body?.cancel();
      await sleepWithAbort(...); // rejection propagates to outer catch
      continue;
    }
    // dispatch...
    return result;
  }
  return classifyTransportError(new Error("unreachable"));
} catch (error) {
  return classifyTransportError(error);
} finally {
  clearTimeout(deadlineTimer);
}
```

This is the cleanest approach: outer `try/catch/finally` covers the entire loop. `fetch()` throws → caught → classified. `sleepWithAbort` rejects → caught → classified. This matches the existing pattern exactly. [VERIFIED: existing send.ts lines 180-254]

**Body cancellation:** `response.body?.cancel()` is unconditional — no signal needed. The cancel is "discard this stream" which is always safe regardless of signal state. [VERIFIED: CONTEXT.md D-03]

---

### Q2: `resolveRetryPolicy` function

**Signature:**
```ts
// src/retry.ts
export interface ResolvedRetryPolicy {
  readonly maxAttempts: number;
  readonly methods: readonly Method[];
  readonly retryableStatuses: readonly number[];
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}

export function resolveRetryPolicy(
  requestRetry: RetryPolicy | undefined,
  clientRetry: RetryPolicy | undefined,
): ResolvedRetryPolicy | null; // null = no retry (maxAttempts effectively 1)
```

**Semantics (D-10):**
```
resolveRetryPolicy(undefined, undefined) → null (no retry)
resolveRetryPolicy(undefined, false)     → null
resolveRetryPolicy(false,     anything)  → null
resolveRetryPolicy(undefined, true)      → DEFAULTS
resolveRetryPolicy(undefined, RetryOpts) → DEFAULTS merged with clientRetryOpts
resolveRetryPolicy(true,      anything)  → DEFAULTS
resolveRetryPolicy(RetryOpts, anything)  → DEFAULTS merged with requestRetryOpts
                                           (client values are IGNORED — D-10)
```

**Implementation:**
```ts
const RETRY_DEFAULTS = {
  maxAttempts: 3,
  methods: ["GET", "HEAD", "QUERY"] as const satisfies readonly Method[],
  retryableStatuses: [502, 503, 504] as const,
  initialDelayMs: 200,
  maxDelayMs: 10_000,
} as const;

export function resolveRetryPolicy(
  requestRetry: RetryPolicy | undefined,
  clientRetry: RetryPolicy | undefined,
): ResolvedRetryPolicy | null {
  // request: false → no retry regardless of client
  if (requestRetry === false) return null;

  // Determine effective RetryOptions (or true)
  const effective: RetryPolicy | undefined =
    requestRetry !== undefined ? requestRetry : clientRetry;

  // no policy at either level → no retry
  if (effective === undefined || effective === false) return null;

  // true → all defaults
  if (effective === true) {
    return { ...RETRY_DEFAULTS };
  }

  // RetryOptions → merge with defaults (D-10: library defaults only, not client values)
  return {
    maxAttempts: effective.maxAttempts ?? RETRY_DEFAULTS.maxAttempts,
    methods: effective.methods ?? RETRY_DEFAULTS.methods,
    retryableStatuses: effective.retryableStatuses ?? RETRY_DEFAULTS.retryableStatuses,
    initialDelayMs: effective.initialDelayMs ?? RETRY_DEFAULTS.initialDelayMs,
    maxDelayMs: effective.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs,
  };
}
```

**`send.ts` call site:**
```ts
// Resolve retry policy once before the loop
const retryPolicy = resolveRetryPolicy(spec.retry, clientSpec.retry);
const maxAttempts = retryPolicy?.maxAttempts ?? 1;
const methods = retryPolicy?.methods ?? [];
const retryableStatuses = retryPolicy?.retryableStatuses ?? [];
const initialDelayMs = retryPolicy?.initialDelayMs ?? 200;
const maxDelayMs = retryPolicy?.maxDelayMs ?? 10_000;
```

[VERIFIED: CONTEXT.md D-10, docs/SPEC.md §"Retry semantics" lines 420-440]

---

### Q3: `shouldRetryStatus` predicate vs inline

**D-03 governs:** The retry decision in the loop uses three inline boolean variables:
- `isRetryableStatus = retryableStatuses.includes(response.status)`
- `methodEligible = (methods as readonly string[]).includes(spec.method)`
- `hasRetryBudget = attempt < maxAttempts - 1`

These are already named predicates (variables) inline. Extracting to a named function like `shouldRetry(status, method, attempt, maxAttempts, retryableStatuses, methods)` would require passing 6 arguments for what amounts to a 3-boolean `&&`. The inline form is cleaner and follows D-04's "no extraction" spirit.

**What is NOT retried (ADR-06):** By construction, `decodeError` and `unhandledStatus` can only arise from the final dispatch path (after the retry check), so they are never retried. `transportError.aborted` and `transportError.timeout` exit via `classifyTransportError` in the catch block before the retry check is reached. This is enforced structurally, not by predicate.

**Recommendation:** Keep retry predicate inline; no `shouldRetryStatus` function needed. [ASSUMED — based on D-03 loop structure; consistent with D-04 "no extraction" principle]

---

### Q4: Utility file placement (`src/retry.ts` vs inline in `send.ts`)

**Evidence:**
- `send.ts` is currently **255 lines** [VERIFIED: `wc -l src/send.ts`]
- Retry loop additions: ~60 lines (loop structure + retry check + body cancel + sleep)
- Utility functions if inline: `sleepWithAbort` ~10 lines, `jitterDelay` ~5 lines, `resolveRetryPolicy` ~25 lines, `RETRY_DEFAULTS` ~8 lines = ~48 lines
- Total if everything inline: ~363 lines

**Recommendation: Extract to `src/retry.ts`**

Reasons:
1. `sleepWithAbort`, `jitterDelay`, and `resolveRetryPolicy` have **zero dependency on `send.ts` internals** — they only depend on `types.ts` (for `Method`, `RetryPolicy`, `RetryOptions`)
2. All three utility functions are the subject of critical pitfall tests — extracting makes them **directly importable** in `tests/unit/retry.test.ts` without going through `performSend`
3. `send.ts` stays at ~315 lines (adding only the loop body), matching the readability of the existing module
4. Dependency direction is clean: `send.ts → retry.ts → types.ts` — no cycles [VERIFIED: CONTEXT.md §Integration Points]
5. No barrel files rule (copilot-instructions.md) — `retry.ts` is a leaf module, not a barrel

**`src/retry.ts` exports:**
- `RETRY_DEFAULTS` (const)
- `ResolvedRetryPolicy` (interface)
- `resolveRetryPolicy()` (function)
- `jitterDelay()` (function)
- `sleepWithAbort()` (function)

---

### Q5: Test-first strategy for the 3 pitfalls

**Test file:** New `tests/unit/retry.test.ts` for pure utility tests; retry integration tests in existing `tests/unit/send.test.ts` or a new `tests/unit/send-retry.test.ts`.

**Existing mock-fetch pattern** (verified from `send.test.ts`):
```ts
const mockFetch: typeof globalThis.fetch = async () =>
  new Response(null, { status: 502 });
```

For call counting:
```ts
let callCount = 0;
const mockFetch: typeof globalThis.fetch = async () => {
  callCount++;
  return new Response(null, { status: 502 });
};
```

**P5 (Off-by-one) test — `tests/unit/send-retry.test.ts`:**
```ts
it("ADR-03: maxAttempts:3 sends exactly 3 requests (not 4)", async () => {
  let callCount = 0;
  const mockFetch: typeof globalThis.fetch = async () => {
    callCount++;
    return new Response(null, { status: 502 });
  };
  const req = Request.create({
    method: "GET", path: [], responses: {},
    retry: { maxAttempts: 3 },
  });
  await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
  expect(callCount).toBe(3);
});
```

**P6 (Abort-unaware sleep) test:**

Option A: Real timers with small values + measure elapsed time.
```ts
it("ADR-04: abort during backoff resolves in <200ms, not after full sleep", async () => {
  const controller = new AbortController();
  const mockFetch: typeof globalThis.fetch = async () => {
    // Abort after 50ms (during backoff)
    setTimeout(() => { controller.abort(); }, 50);
    return new Response(null, { status: 502 });
  };
  const req = Request.create({
    method: "GET", path: [], responses: {},
    retry: { maxAttempts: 3, initialDelayMs: 500 },
  });
  const start = Date.now();
  const result = await performSend(
    req,
    { baseUrl: "https://api.example.com/", fetch: mockFetch },
    { signal: controller.signal },
  );
  const elapsed = Date.now() - start;
  expect(result.kind).toBe("transportError");
  if (result.kind === "transportError") expect(result.error.kind).toBe("aborted");
  expect(elapsed).toBeLessThan(200); // well under 500ms backoff
});
```

Option B (pure unit test — faster, more reliable): Test `sleepWithAbort` directly:
```ts
// tests/unit/retry.test.ts
it("sleepWithAbort rejects immediately when signal fires during sleep", async () => {
  const controller = new AbortController();
  setTimeout(() => { controller.abort(); }, 50);
  const start = Date.now();
  await expect(sleepWithAbort(500, controller.signal)).rejects.toBeDefined();
  expect(Date.now() - start).toBeLessThan(150);
});
```

**Recommendation: Both** — direct unit test for `sleepWithAbort` in `retry.test.ts` + integration test in `send-retry.test.ts`.

**P7 (Jitter overflow) test — pure unit, no timers needed:**
```ts
// tests/unit/retry.test.ts
it("ADR-05: jitterDelay never exceeds maxDelayMs across high attempt numbers", () => {
  const maxDelayMs = 10_000;
  for (let attempt = 0; attempt < 100; attempt++) {
    const delay = jitterDelay(attempt, 200, maxDelayMs);
    expect(delay).toBeLessThanOrEqual(maxDelayMs);
    expect(delay).toBeGreaterThanOrEqual(0);
  }
});
```

**Fake timers assessment:** Real timers with small delay values are sufficient:
- P5: no timers at all (just counting)
- P6: real 50ms abort + 500ms sleep — fast enough for unit tests
- P7: pure math — no timers

`vi.useFakeTimers()` could be used for P6 but adds complexity (`vi.advanceTimersByTime`, manual tick management). Real timers are simpler and this is an HTTP library where timer precision is observable behavior. Use real timers. [VERIFIED: vitest.config.ts uses real environment for node project]

---

### Q6: Inline match/decode block vs extraction

**D-04 is clear:** No `fetchOnce()` extraction. The match/decode block (existing lines 189–248) stays inline as the loop's non-retry path. It runs only on the final dispatch (when the retry check doesn't trigger `continue`).

**Pattern:**
```ts
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  // ... fetch + retry check (may continue) ...

  // Reaches here only on final dispatch:
  const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192;
  const match = matchResponse(response.status, spec.responses, clientSpec.responses);
  if (match === null) {
    const preview = await readBodyPreview(response, maxBytes);
    return { kind: "unhandledStatus", ... };
  }
  // ... existing readBytes + decode + return ...
}
```

The `dispatchResponse()` reference in CONTEXT.md D-03 is shorthand notation only — it does not imply a helper function extraction. [VERIFIED: CONTEXT.md D-04]

---

### Q7: AbortController/deadlineTimer scoping confirmation

**Confirmed correct:** The existing deadline controller setup (lines 131–153) is OUTSIDE any loop. This is architecturally sound for the whole-operation deadline requirement (ADR-02):

```
performSend() entry
  ├── deadlineController = new AbortController()    ← one deadline for ALL attempts
  ├── deadlineTimer = setTimeout(abort, deadlineMs)  ← one timer for ALL attempts
  ├── combinedSignal = AbortSignal.any([...])        ← used in every fetch() and every sleepWithAbort()
  ├── serializeBody() ← one serialization for ALL attempts
  ├── fetchInit ← built once, reused every attempt
  └── for (attempt 0..maxAttempts-1):
        fetch(url, { ...fetchInit, signal: combinedSignal })
        sleepWithAbort(delay, combinedSignal)   ← deadline fires here too
  finally: clearTimeout(deadlineTimer)
```

If deadline fires during any backoff sleep, `combinedSignal` fires → `sleepWithAbort` rejects with `DOMException("Deadline exceeded", "TimeoutError")` → outer catch classifies as `{ kind: "transportError", error: { kind: "timeout" } }` → retry does NOT continue. [VERIFIED: CONTEXT.md D-09, docs/SPEC.md §"Deadline" lines 399-418]

**Body cancellation signal:** `response.body?.cancel()` does NOT need the signal. The cancel call unconditionally discards the stream. If the signal fires between the retry check and the cancel call, the stream is still safely discarded. [VERIFIED: CONTEXT.md D-03]

---

### Q8: SPEC alignment check

**Reading docs/SPEC.md lines 388–468 against CONTEXT.md decisions:**

| Decision | SPEC text | Aligned? |
|----------|-----------|----------|
| D-01: `RetryPolicy = true \| false \| RetryOptions` | SPEC line 433: `type RetryPolicy = true \| false \| RetryOptions` | ✅ Exact match |
| D-02: `initialDelayMs=200, maxDelayMs=10_000` | SPEC lines 428-430: same defaults | ✅ Exact match |
| D-02: `maxAttempts=3` | SPEC line 427: default 3 | ✅ Exact match |
| D-02: `methods=["GET","HEAD","QUERY"]` | SPEC line 426: same | ✅ Exact match |
| D-02: `retryableStatuses=[502,503,504]` | SPEC line 427: same | ✅ Exact match |
| D-03: status-first retry | SPEC line 448: "Retry decisions made against raw HTTP status code before result classification" | ✅ Exact match |
| D-07: `attempt < maxAttempts` | SPEC line 446: "`maxAttempts` is total attempts including first; 3 = one initial + two retries" | ✅ Exact match |
| D-08: jitter formula | SPEC line 444: "bounded exponential with jitter; grows from `initialDelayMs` up to `maxDelayMs`" — exact formula not in SPEC, formula in CONTEXT.md is consistent | ✅ Consistent |
| D-10: no field-level merge | SPEC lines 440-441: "request-level RetryOptions replaces client's RetryOptions entirely as a unit" | ✅ Exact match |
| ADR-02: deadline is whole-operation | SPEC lines 403-410: "covers: all attempts, all backoff delays, waiting for headers, body reading, decoding" | ✅ Exact match |
| ADR-06: `decodeError` not retried | SPEC line 453: "Retries never apply to: ... decodeError" | ✅ Exact match |
| Deadline validation | SPEC line 400: `deadlineMs <= 0` → `requestError.invalidSpec` but CURRENT CODE throws `RangeError` | ⚠️ See below |

**⚠️ SPEC vs Current Implementation Discrepancy:**
SPEC line 400 says: "Any value less than or equal to zero surfaces as `requestError.invalidSpec` at `send()` time." Current `send.ts` line 118-119 throws `RangeError` instead. This is a pre-existing Phase 3 compliance gap, NOT introduced by Phase 6. The planner should decide whether to fix this now (returning `{ kind: "requestError", error: { kind: "invalidSpec", message: "deadlineMs must be positive" } }`) or defer to cleanup. The existing `send.test.ts` tests explicitly assert `rejects.toThrow(RangeError)` — fixing it would require updating those tests.

**⚠️ ROADMAP vs SPEC/CONTEXT.md discrepancy:**
ROADMAP §Phase 6 Plan #4 says `maxBackoffMs: 30_000`. SPEC line 430 says `maxDelayMs?: number; // default: 10_000`. CONTEXT.md D-02 says `maxDelayMs: 10_000`. **CONTEXT.md is correct** — use `10_000`. The ROADMAP entry has a typo.

**⚠️ ADR-07 ambiguity — transport failure retry:**
ADR-07 says "Default retry policy applies to GET/HEAD methods on **transport failures** and 502/503/504 responses." CONTEXT.md D-03's loop structure only shows status-based retry (retryableStatuses check on response). SPEC §"Retry semantics" line 450 says retry lifecycle starts with "(1) send the request → (2) receive the response status code" — implying only HTTP responses trigger retry, not transport errors. SPEC §"Retries never apply to" lists `caller abort` and `deadline expiry` but not `transportError.network`.

**Resolution:** CONTEXT.md D-03 governs. The locked loop structure has the fetch() in a try/catch that returns `classifyTransportError(error)` immediately — no retry on network errors. The "transport failures" in ADR-07 most naturally refers to 502/503/504 (server-side transport-layer failures), not to connection errors. **Network errors (`transportError.network`) are not retried.** The planner should confirm this interpretation.

---

## Standard Stack

### Core (no new dependencies)

| Component | Version | Status |
|-----------|---------|--------|
| TypeScript | 6.0.3 | Already installed |
| Vitest | 4.1.5 | Already installed |
| `src/types.ts` | — | Modify: add `RetryOptions` interface, update `RetryPolicy` type |
| `src/send.ts` | — | Modify: replace lines 180-254 with retry loop |
| `src/retry.ts` | — | Create new: `sleepWithAbort`, `jitterDelay`, `resolveRetryPolicy`, `RETRY_DEFAULTS` |
| `tests/unit/retry.test.ts` | — | Create new: unit tests for all 3 pitfalls + resolveRetryPolicy |

[VERIFIED: package.json, src/ directory listing]

**No new npm packages needed** — this phase uses only TypeScript, the existing type system, `setTimeout`/`clearTimeout`, and `AbortSignal`.

---

## Architecture Patterns

### System Architecture Diagram

```
performSend() entry
│
├── Pre-abort guard (unchanged)
├── request.consume() (unchanged)
├── deadlineController + deadlineTimer (unchanged, OUTSIDE loop)
├── combinedSignal construction (unchanged, OUTSIDE loop)
├── serializeBody() — ONE call, BEFORE loop (unchanged)
├── fetchInit construction — ONCE, BEFORE loop (unchanged)
│
├── resolveRetryPolicy(spec.retry, clientSpec.retry)
│     └── returns ResolvedRetryPolicy | null
│
└── try {
      for (attempt 0..maxAttempts-1) {
        ├── fetch(url, fetchInit)  ← may throw (network/abort/timeout)
        │     └── catch → classifyTransportError() → return
        │
        ├── STATUS-FIRST CHECK:
        │   isRetryableStatus = retryableStatuses.includes(response.status)
        │   methodEligible = methods.includes(spec.method)
        │   hasRetryBudget = attempt < maxAttempts - 1
        │   signal not aborted
        │         ↓ YES (all conditions met)
        │   response.body?.cancel()
        │   await sleepWithAbort(jitterDelay(attempt, ...), combinedSignal)
        │         ↓ sleep fires or rejects on signal
        │   continue → next attempt
        │         ↓ NO (condition failed)
        └── FINAL DISPATCH (existing lines 189-248)
              matchResponse() → unhandledStatus | match
              readBytes() → decodeError | bytes
              match.decode.fn() → decodeError | decoded
              return { kind: "response", ... }
    } catch (error) {
      return classifyTransportError(error);
    } finally {
      clearTimeout(deadlineTimer);  // ← unchanged
    }
```

### Recommended Project Structure (new file)

```
src/
├── retry.ts         # NEW: sleepWithAbort, jitterDelay, resolveRetryPolicy, RETRY_DEFAULTS
├── send.ts          # MODIFY: lines 180-254 replaced with retry loop
├── types.ts         # MODIFY: RetryOptions interface + RetryPolicy union
└── [unchanged: body.ts, decode.ts, preview.ts, request.ts, response-matching.ts, client.ts]

tests/unit/
├── retry.test.ts    # NEW: pitfall unit tests (P5, P6, P7) + resolveRetryPolicy
└── send.test.ts     # EXTEND: add retry integration tests (or new send-retry.test.ts)
```

### Pattern: `resolveRetryPolicy` — returns null for no-retry

Returning `null` (rather than `{ maxAttempts: 1, ... }`) makes the "skip loop, just dispatch once" path explicit in `send.ts`:
```ts
const retryPolicy = resolveRetryPolicy(spec.retry, clientSpec.retry);
if (retryPolicy === null) {
  // Fast path: single attempt, no retry check needed
  // ...
}
// Full retry loop for retryPolicy !== null
```
Alternative: always use the loop with `maxAttempts: 1` when no retry. Either works; both are correct. Null return is slightly more readable.

### Anti-Patterns to Avoid

- **`attempt <= maxAttempts`**: Sends `maxAttempts + 1` times. Always `attempt < maxAttempts`. [P5]
- **`Math.random() * Math.min(...)`**: Wrong — should be `Math.floor(Math.random() * Math.min(...))`. More critically: `Math.min(maxDelayMs, ...)` must come BEFORE `Math.random()`. [P7]
- **`setTimeout(resolve, ms)` without signal handling**: Ignores abort during sleep. Must use `sleepWithAbort`. [P6]
- **Per-attempt deadline timer**: `setTimeout` inside the loop re-applies the timeout on each attempt. Deadline must be the single outer timer. [ADR-02]
- **`instanceof Error` for signal reason**: Fails across VM realms. Use `.name` duck-typing. [existing D-11 pattern]
- **`retryableStatuses.at(i)` for includes check**: Use `.includes(response.status)` — not array index access. `noUncheckedIndexedAccess` doesn't apply to `.includes()`. [VERIFIED: CONTEXT.md code_context]
- **Spreading RetryOptions to merge with client**: D-10 prohibits field-level merge. `resolveRetryPolicy` must only merge `effective` with `RETRY_DEFAULTS`, never with `clientRetry` fields. [D-10]
- **`(methods as readonly string[])` skipped**: `spec.method` is `Method` (string literal union); `methods` is `readonly Method[]`. TypeScript will require the cast for `.includes(spec.method)` due to strict type checking. [ASSUMED — based on TypeScript strict typing patterns]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signal composition | Custom signal combining | `AbortSignal.any()` (already used) | Correct edge cases; built-in |
| Timer cleanup | Manual ref tracking | `clearTimeout` in `finally` (already done) | Already correct; just extend scope |
| Error name detection | `instanceof Error` | Duck-type `.name` check (already pattern) | Cross-realm safe |

**Key insight:** All primitives already exist in the codebase. Phase 6 assembles them into the retry loop; it does not introduce novel infrastructure.

---

## Common Pitfalls

### Pitfall P5 (CRITICAL): Off-by-one in attempt counter

**What goes wrong:** `attempt <= maxAttempts` sends `maxAttempts + 1` requests. With `maxAttempts: 3`, sends 4 requests.  
**Why it happens:** Natural language "3 attempts" is confused with loop bound.  
**How to avoid:** Write the counting test FIRST. Condition must be `attempt < maxAttempts`.  
**Warning signs:** Test shows 4 mock calls when expecting 3.

### Pitfall P6 (CRITICAL): Abort-unaware sleep

**What goes wrong:** `await new Promise(resolve => setTimeout(resolve, 500))` ignores `AbortSignal`. With a 500ms sleep and abort at 50ms, operation continues for 450ms extra.  
**Why it happens:** `setTimeout` does not observe `AbortSignal`.  
**How to avoid:** Always use `sleepWithAbort(ms, signal)` from `retry.ts`. Write the `sleepWithAbort` unit test before wiring it into `send.ts`.  
**Warning signs:** Abort test takes >150ms to resolve after abort fires.

### Pitfall P7 (CRITICAL): Jitter overflow

**What goes wrong:** `Math.floor(Math.random() * (Math.min(maxDelayMs, base * Math.pow(2, attempt))))` applied with wrong precedence: `Math.floor(Math.min(maxDelayMs, Math.random() * base * Math.pow(2, attempt)))` — at attempt 60: `base * 2^60 = 200 * 1.15e18 ≈ 2.3e20`, which overflows Number safely but produces a `setTimeout` effectively never firing (Node max timer ~24.8 days).  
**Why it happens:** `Math.min` position looks equivalent but isn't.  
**How to avoid:** Formula is: `Math.floor(Math.random() * Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt)))`. Test by calling 1000 times at high attempt values and asserting `<= maxDelayMs`.  
**Warning signs:** Delay values far exceeding `maxDelayMs` in high-attempt scenarios.

### Pitfall: `maxAttempts` validation omitted

**What goes wrong:** `resolveRetryPolicy` returns `maxAttempts: 0` or `maxAttempts: -1` if caller passes `{ maxAttempts: 0 }`. Loop never executes, returns `classifyTransportError(new Error("unreachable"))` — confusing error.  
**How to avoid:** SPEC says `maxAttempts < 1` → `requestError.invalidSpec`. Add validation before the retry loop. CAUTION: existing tests assert `RangeError` for `deadlineMs <= 0` — the pattern should be `requestError.invalidSpec` per SPEC, but changing `deadlineMs` validation is out of scope for Phase 6. For `maxAttempts`, implement SPEC-compliant: return `{ kind: "requestError", error: { kind: "invalidSpec", message: "..." } }`.  
**Warning signs:** Loop runs 0 times; result is an unexpected transport error.

### Pitfall: `sleepWithAbort` rejection handling

**What goes wrong:** If `sleepWithAbort` rejects, the rejection must be caught and classified by `classifyTransportError`. If the outer `try/catch` is omitted or scoped incorrectly, this becomes an unhandled rejection.  
**How to avoid:** The outer `try { for loop } catch (error) { return classifyTransportError(error) }` pattern already in `send.ts` naturally handles this. Do NOT add inner try/catch around just the sleep call — keep the unified outer catch.

---

## Code Examples

### `sleepWithAbort` — exact locked implementation

```ts
// src/retry.ts
// Source: CONTEXT.md D-09 (locked decision — do not deviate)
function sleepWithAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => { clearTimeout(timer); reject(signal.reason); },
      { once: true },
    );
  });
}
```

Note: `signal?.aborted === true` (explicit boolean comparison) required by TypeScript Narrows [B] rule "Require explicit boolean comparisons".

### `jitterDelay` — exact locked implementation

```ts
// src/retry.ts
// Source: CONTEXT.md D-08 — Math.min BEFORE Math.random (CRITICAL)
function jitterDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  return Math.floor(Math.random() * Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt)));
}
```

### `RetryOptions` + `RetryPolicy` type update

```ts
// src/types.ts — replaces existing interface RetryPolicy { ... }
export interface RetryOptions {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

export type RetryPolicy = true | false | RetryOptions;
```

Both `ClientSpec.retry` and `RequestSpecBase.retry` stay typed as `RetryPolicy?` (no other change to those interfaces).

### Import additions to `send.ts`

```ts
// src/send.ts additions:
import type { RetryPolicy } from "./types.js";
import { resolveRetryPolicy, sleepWithAbort, jitterDelay } from "./retry.js";
```

Use `import type` for `RetryPolicy` only if it was already used as a type — `RetryPolicy` appears in `types.ts`, not directly used at runtime in `send.ts`. `resolveRetryPolicy`, `sleepWithAbort`, `jitterDelay` are values, so regular import.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `interface RetryPolicy { backoffMs: { initial, max } }` | `type RetryPolicy = true \| false \| RetryOptions` with flat `initialDelayMs`/`maxDelayMs` | Phase 6 (this phase) | All existing code using `spec.retry?.backoffMs` must update; `backoffMs` was never shipped so no migration needed |
| Single-attempt fetch | Retry loop with status-first check | Phase 6 (this phase) | `performSend` behavior changes; existing tests remain valid (no retry policy → same behavior) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `(methods as readonly string[]).includes(spec.method)` requires a cast because `Method` is a string literal union and `readonly Method[].includes()` accepts only `Method` not `string` | Anti-Patterns | Compile error if assumption wrong; easy to fix inline |
| A2 | `shouldRetryStatus` as named predicate is not needed — inline boolean variables are cleaner | Q3 | Style only; no behavioral impact |
| A3 | Network errors (`transportError.network`) are NOT retried per D-03's loop structure | Q8 / Open Questions | If wrong, requires catch block with retry logic — behavioral change |
| A4 | `resolveRetryPolicy` returning `null` for no-retry is preferable to `{ maxAttempts: 1 }` | Q2 | Style only; both implementations are correct |

---

## Open Questions

1. **ADR-07: Are `transportError.network` errors retried?**
   - What we know: D-03 loop structure shows only status-based retry. SPEC lifecycle says "(1) send → (2) receive status code" — network errors never reach step 2. SPEC's "never retry" list doesn't explicitly exclude network errors. ROADMAP Plan #3 says `shouldRetry()` returns true for `transportError.network` but this predates CONTEXT.md.
   - What's unclear: Does "transport failures" in ADR-07 mean 502/503/504 only, or also connection errors?
   - Recommendation: Follow D-03 strictly — no retry on network errors. Connection errors are typically non-idempotent or infrastructure failures where immediate retry is rarely helpful. If network-error retry is desired, it can be added in a follow-on phase.

2. **`deadlineMs` validation: `RangeError` vs `requestError.invalidSpec`**
   - What we know: SPEC says `requestError.invalidSpec`; current code throws `RangeError`; existing tests assert `RangeError`.
   - What's unclear: Should Phase 6 fix this compliance gap while touching `send.ts`?
   - Recommendation: Defer to Phase 8 (polish) to avoid test churn. Phase 6 should follow the existing `RangeError` pattern for `deadlineMs` and use `requestError.invalidSpec` for `maxAttempts < 1` as SPEC requires.

3. **`maxAttempts < 1` validation: where does it live?**
   - What we know: SPEC says values < 1 surface as `requestError.invalidSpec`.
   - Recommendation: Validate in `resolveRetryPolicy` (throw `Error`) or in `send.ts` immediately after calling `resolveRetryPolicy`. Return `{ kind: "requestError", error: { kind: "invalidSpec", message: "RetryOptions.maxAttempts must be >= 1" } }` from `send.ts` — consistent with structured-result contract.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 6 is code-only changes; no external tools, services, or CLIs required beyond the existing TypeScript/Vitest toolchain already installed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --project node tests/unit/retry.test.ts tests/unit/send.test.ts` |
| Full suite command | `npx vitest run --project node` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ADR-01 | Abort during backoff → `transportError.aborted` | integration | `npx vitest run --project node tests/unit/send.test.ts` | ✅ (extend) |
| ADR-02 | Deadline fires during sleep → `timeout`; no further attempts | integration | same | ✅ (extend) |
| ADR-03 | `maxAttempts:3` → exactly 3 fetch calls (off-by-one prevention) | integration | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| ADR-04 | `sleepWithAbort` rejects immediately on signal fire | unit | `npx vitest run --project node tests/unit/retry.test.ts` | ❌ Wave 0 |
| ADR-05 | `jitterDelay` never exceeds `maxDelayMs` at any attempt count | unit | same | ❌ Wave 0 |
| ADR-06 | `decodeError` result: no retry; single fetch call | integration | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| ADR-07 | Default policy: GET/HEAD/QUERY retry on 502/503/504 with `maxAttempts:3` | integration | same | ❌ Wave 0 |
| D-10 | `resolveRetryPolicy` — request RetryOptions replaces client entirely | unit | `npx vitest run --project node tests/unit/retry.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --project node tests/unit/retry.test.ts tests/unit/send.test.ts`
- **Per wave merge:** `npx vitest run --project node`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/retry.test.ts` — covers ADR-04, ADR-05, D-10 (sleepWithAbort + jitterDelay + resolveRetryPolicy unit tests)
- [ ] ADR-03 test in `tests/unit/send.test.ts` or `tests/unit/send-retry.test.ts` — request-counting mock fetch
- [ ] ADR-06 test — `decodeError` does not trigger retry
- [ ] ADR-07 test — default policy covers GET/HEAD/QUERY

---

## Security Domain

Phase 6 introduces no new network interfaces, authentication, input handling, or cryptographic operations. All new code is pure retry orchestration logic (timers, counters, signal handling) with no security-sensitive surface.

| ASVS Category | Applies | Rationale |
|---------------|---------|-----------|
| V2 Authentication | No | No auth logic in retry utilities |
| V3 Session Management | No | No session state |
| V4 Access Control | No | No access control |
| V5 Input Validation | Minimal | `maxAttempts < 1` validation (structured error, not security boundary) |
| V6 Cryptography | No | No crypto |

No threat patterns introduced by retry logic.

---

## Sources

### Primary (HIGH confidence)

- `src/send.ts` (lines 100–255) — existing `performSend` implementation structure [VERIFIED: direct read]
- `docs/SPEC.md` (lines 388–470) — Abort/deadline/retry/affine SPEC sections [VERIFIED: direct read]
- `.planning/phases/06-abort-deadline-retry/06-CONTEXT.md` — all locked decisions D-01 through D-10 [VERIFIED: direct read]
- `src/types.ts` — current `RetryPolicy` interface [VERIFIED: direct read]
- `tests/unit/send.test.ts` — mock-fetch pattern, test structure [VERIFIED: direct read]
- `vitest.config.ts` — test configuration, project names [VERIFIED: direct read]

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` §Phase 6 — pitfall descriptions P5/P6/P7, plan outline [VERIFIED: direct read; note: `maxBackoffMs: 30_000` is a typo — SPEC says 10_000]
- `.planning/REQUIREMENTS.md` §"Abort, Deadline & Retry" — ADR-01 through ADR-07 [VERIFIED: direct read]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from existing codebase; no new dependencies
- Architecture: HIGH — `send.ts` structure verified line-by-line; SPEC/CONTEXT alignment confirmed
- Pitfall strategy: HIGH — all three pitfalls have verified test patterns; P7 formula verified against D-08
- Open questions: MEDIUM — ADR-07 network-error interpretation is a genuine ambiguity between CONTEXT.md and ADR-07 text

**Research date:** 2026-05-08
**Valid until:** Phase 6 completion (stable spec; no external dependencies)

---

## RESEARCH COMPLETE

**Phase:** 06 - abort-deadline-retry
**Confidence:** HIGH

### Key Findings

1. **`src/retry.ts` extraction is recommended** — the four utilities (`sleepWithAbort`, `jitterDelay`, `resolveRetryPolicy`, `RETRY_DEFAULTS`) have no dependency on `send.ts` internals, are independently testable, and keep `send.ts` at ~315 lines.

2. **Retry loop replaces exactly lines 180–254** — the outer `try/catch/finally` for `clearTimeout` stays unchanged; the loop body is inserted in place of the single-attempt fetch block.

3. **All three pitfall tests are feasible with real timers** — no `vi.useFakeTimers()` needed; P5 uses call counting, P6 uses real 50ms abort timing, P7 uses pure math iteration.

4. **SPEC alignment is clean** — every locked CONTEXT.md decision matches SPEC verbatim. Two anomalies flagged: (a) ROADMAP has `30_000` typo for `maxDelayMs`; (b) existing `deadlineMs` validation throws `RangeError` instead of returning `requestError.invalidSpec`.

5. **ADR-07 transport-failure ambiguity** — D-03's loop structure does not retry network errors; the `catch` block returns `classifyTransportError` immediately. Planner should confirm this is correct for "transport failures" in ADR-07.

### File Created

`.planning/phases/06-abort-deadline-retry/06-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All verified from codebase; no new packages |
| Architecture | HIGH | Line-by-line verification of send.ts; SPEC/CONTEXT aligned |
| Pitfall Tests | HIGH | Patterns derived from verified existing test file |
| Open Questions | MEDIUM | ADR-07 network-error interpretation genuinely ambiguous |

### Open Questions

- **Q: Does "transport failures" in ADR-07 include `transportError.network`?** If yes, the catch block in the retry loop needs retry logic for network errors. If no (recommended), catch returns immediately.
- **Q: Should Phase 6 fix `deadlineMs` validation to return `requestError.invalidSpec` (SPEC-correct) or preserve `RangeError` (existing tests)?** Recommendation: defer to Phase 8.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
