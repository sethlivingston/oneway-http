# Phase 6: Abort, Deadline & Retry — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap `send()` in a retry engine: abort-aware backoff sleep, capped jitter formula, status-first retry predication, and a whole-operation deadline that covers all attempts plus all backoff windows. Retry never fires after deadline expiry or on non-retryable outcomes.

**In scope:**
- `src/types.ts` — update `RetryPolicy` type to `true | false | RetryOptions`; introduce `RetryOptions` interface with correct field names
- `src/send.ts` — replace single-attempt fetch block with retry loop; retain existing deadline/signal architecture
- New utilities (`sleepWithAbort`, `jitterDelay`, `resolveRetryPolicy`, `shouldRetryStatus`) — placement at agent's discretion
- Tests — test-first for the three critical pitfalls (off-by-one, abort-unaware sleep, jitter overflow)

**Not in scope:**
- `Send.match()` / `Send.Matcher<R,T>` → Phase 7
- `Retry-After` header awareness → deferred to v2
- Streaming body retry → deferred to v2 (all v1 Body types buffer eagerly)

</domain>

<decisions>
## Implementation Decisions

### D-01: `RetryPolicy` type becomes `true | false | RetryOptions`

The current `types.ts` `interface RetryPolicy { ... }` is replaced with:

```ts
export interface RetryOptions {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

export type RetryPolicy = true | false | RetryOptions;
```

- `true` — use all library defaults (equivalent to `{}` as RetryOptions)
- `false` — explicitly disable retry, even if the client has a retry policy
- `RetryOptions` object — override specific fields; unspecified fields fall back to **library defaults**, not client values
- `undefined` on a request inherits the client's retry policy; `undefined` on the client means no retry

The old `backoffMs: { initial, max }` field is dropped entirely. It was never shipped.

### D-02: Field renames — `backoffMs` → flat `initialDelayMs` / `maxDelayMs`

SPEC field names are used verbatim:

| Old (`types.ts`) | New (SPEC-aligned) | Default |
|---|---|---|
| `backoffMs.initial` | `initialDelayMs` | `200` |
| `backoffMs.max` | `maxDelayMs` | `10_000` |
| *(none)* | `maxAttempts` | `3` |
| `methods` | `methods` | `["GET", "HEAD", "QUERY"]` |
| `retryableStatuses` | `retryableStatuses` | `[502, 503, 504]` |

### D-03: Retry lifecycle is status-first (SPEC §448–450)

Retry decisions are made against the **raw HTTP status code before `matchResponse`/decode**.

The loop structure in `send.ts`:
```
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  const response = await fetch(url, { ...fetchInit, signal: combinedSignal });

  // Status-first check: retryable status + eligible method + budget + signal live
  const isRetryableStatus = retryableStatuses.includes(response.status);
  const hasRetryBudget = attempt < maxAttempts - 1;
  if (isRetryableStatus && methodEligible && hasRetryBudget && !combinedSignal?.aborted) {
    response.body?.cancel();           // discard body — DO NOT read
    await sleepWithAbort(jitterDelay(attempt, initialDelayMs, maxDelayMs), combinedSignal);
    continue;
  }

  // Final attempt (or non-retryable outcome): run full match → decode
  return await dispatchResponse(response, spec, clientSpec, maxBytes);
}
```

Key consequences:
- `decodeError` and `unhandledStatus` can **only arise from the final attempt** (by construction)
- Retryable 502/503/504 bodies are never read — stream is cancelled cheaply
- The `dispatchResponse()` call (or equivalent inline block) runs only once

### D-04: No `fetchOnce()` extraction — inline both phases

The fetch call and the status-first branch both live inline in the loop body. `fetchOnce()` would only be called from one place and adds a name without reuse value. The `D-XX` comment style already makes the phases legible.

### D-05: Retry loop is inline in `send.ts`; utilities at agent's discretion

The retry loop replaces the current single-attempt fetch block in `performSend()`. Where `sleepWithAbort`, `jitterDelay`, `resolveRetryPolicy`, and `shouldRetryStatus` live (inline in `send.ts` vs a new `src/retry.ts`) is the **agent's discretion** — choose what keeps `send.ts` readable.

### D-06: Body replay across attempts is free

`serializeBody(spec.body)` runs once before the loop (current position in `send.ts`). All v1 `Body` types produce a buffered `BodyInit` (string or `Uint8Array`) — no `ReadableStream`. The same `serialized.init` is passed to every `fetch()` call in the loop with no re-serialization.

### D-07: Retry loop off-by-one — `attempt < maxAttempts`, never `<=`

`maxAttempts` is the **total number of send attempts including the first**. Loop must be `attempt < maxAttempts`. With `maxAttempts: 3`, the loop runs exactly 3 times (attempts 0, 1, 2). This is a critical pitfall — write the counting test before writing the loop.

### D-08: Jitter formula — cap applied before `Math.random()`

```ts
function jitterDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  return Math.floor(Math.random() * Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt)));
}
```

`Math.min(maxDelayMs, ...)` must precede `Math.random()`. Reversing the order: `base * 2^60 ≈ 1.15e18`, which produces a `setTimeout` that effectively never fires.

### D-09: `sleepWithAbort` rejects immediately on signal fire

```ts
function sleepWithAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
```

If the combined signal fires during a backoff window, `sleepWithAbort` rejects immediately → the loop `catch` (or the calling `await`) propagates the abort reason → `classifyTransportError` returns `{ kind: "transportError", error: { kind: "aborted" } }` (or `timeout` if deadline fired).

### D-10: `resolveRetryPolicy` semantics

- `retry: undefined` on request → inherit client policy
- `retry: undefined` on client → no retry (policy is `{ maxAttempts: 1 }` effectively)
- `retry: false` (request or client) → no retry; terminates resolution
- `retry: true` (request or client) → use library defaults
- `retry: RetryOptions` on request → **replaces** client's RetryOptions entirely; unspecified fields fall back to **library defaults**, not client values

This means field-level merge between request and client is explicitly prohibited. If the request sets `{ maxAttempts: 1 }`, the effective policy is `{ maxAttempts: 1, methods: [...defaults], retryableStatuses: [...defaults], initialDelayMs: 200, maxDelayMs: 10_000 }`.

### Agent's Discretion

- Whether to extract `src/retry.ts` for utilities vs keep inline in `send.ts`
- Internal variable names and comment style
- Test file structure and mock-fetch pattern for counting attempts
- `resolveRetryPolicy()` exact signature

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Retry behavior
- `docs/SPEC.md` §"Retry semantics" (lines 420–458) — `RetryOptions` type, `RetryPolicy` union, merge rules, status-first lifecycle, what is never retried
- `docs/SPEC.md` §"Abort, deadline, and retries" (lines 388–418) — abort pre-check, deadline coverage, terminal expiry behavior
- `docs/SPEC.md` §"Affine runtime behavior" (lines 459–468) — internal body replay contract

### Public types (Phase 6 changes these)
- `src/types.ts` — `RetryPolicy` (update to union), `RetryOptions` (new interface), `ClientSpec.retry`, `RequestSpecBase.retry`

### Existing send infrastructure
- `src/send.ts` — `performSend()`: existing deadline controller (lines 131–153), `serializeBody()` call (lines 157–169), single-attempt fetch block (lines 178+) — Phase 6 replaces the fetch block with the retry loop
- `.planning/phases/03-transport-send/03-CONTEXT.md` — D-07 to D-10: deadline controller design, `AbortSignal.any()` composition, `classifyTransportError` error name rules
- `.planning/REQUIREMENTS.md` — ADR-01 through ADR-07

### Pitfall record
- `.planning/ROADMAP.md` §"Phase 6" — P5 (off-by-one), P6 (abort-unaware sleep), P7 (jitter overflow) with exact failure modes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `classifyTransportError(error)` in `send.ts` — already handles `TimeoutError` / `AbortError` / network; the retry loop reuses this for errors thrown by `fetch()` or `sleepWithAbort()`
- `deadlineController` + `combinedSignal` in `send.ts` (lines 131–153) — already scoped to the outer `performSend()` call; stays outside the retry loop; no changes needed
- `serializeBody(spec.body)` result — `{ init?: BodyInit; contentType? }` — all variants are `Uint8Array` or `string`; safe to pass `fetchInit` unchanged on every attempt

### Established Patterns
- `D-XX` inline comments — document each design decision inline; Phase 6 additions should follow the same style
- `exactOptionalPropertyTypes` — `RetryOptions` fields must be `readonly T | undefined`; no `?:` shorthand inconsistency
- `noUncheckedIndexedAccess` — `retryableStatuses.includes(response.status)` is fine; array index access elsewhere needs `.at(i) ?? fallback`
- Never `instanceof` for error classification — check `error.name === "TimeoutError"` etc.

### Integration Points
- `send.ts` imports will gain: the retry utilities (wherever they land) and `resolveRetryPolicy`
- `types.ts` changes affect: `client.ts` (reads `ClientSpec.retry`), `request.ts` (reads `RequestSpecBase.retry`), any future tests referencing `RetryPolicy`
- Dependency direction after Phase 6: `send.ts → {retry utilities, body, decode, preview, response-matching, request}.ts → types.ts` — no new cycles

</code_context>

<deferred>
## Deferred Ideas

- File placement for retry utilities (agent's discretion — not discussed; agent decides what keeps `send.ts` readable)
- `Retry-After` header awareness — deferred to v2 per `.planning/STATE.md`

</deferred>

---

*Phase: 06-abort-deadline-retry*
*Context gathered: 2026-05-07*
