# Phase 6: Abort, Deadline & Retry — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 5 (2 create, 3 modify)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types.ts` | model/types | — (zero logic) | `src/types.ts` (itself) | self-edit |
| `src/retry.ts` | utility | request-response + event-driven | `src/preview.ts`, `src/body.ts` | role-match |
| `src/send.ts` | service/core | request-response | `src/send.ts` (itself) | self-edit |
| `tests/unit/retry.test.ts` | test | — | `tests/unit/body.test.ts`, `tests/unit/decode.test.ts` | role-match |
| `tests/unit/send.test.ts` | test | — | `tests/unit/send.test.ts` (itself) | self-edit |

---

## Pattern Assignments

### `src/types.ts` (model/types — modify)

**Analog:** `src/types.ts` itself — follow the existing discriminated union pattern for `TransportError` and `DecodeError`.

**Existing type union pattern** (lines 34–40 and 48–51):
```typescript
export type DecodeError =
  | { kind: "unexpectedBody" }
  | { kind: "emptyBody" }
  | { kind: "invalidJson"; message: string }
  | { kind: "schemaMismatch"; issues: DecodeIssue[] }
  | { kind: "bodyReadFailed"; message: string }
  | { kind: "custom"; message: string; details?: unknown };

export type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };
```

**Pattern to replace** — current `RetryPolicy` interface (lines 97–102):
```typescript
// BEFORE (remove this):
export interface RetryPolicy {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly backoffMs?: { readonly initial: number; readonly max: number };
}
```

**Pattern to insert** — new `RetryOptions` interface + `RetryPolicy` union:
```typescript
// AFTER (insert before RequestSpecBase):
export interface RetryOptions {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

export type RetryPolicy = true | false | RetryOptions;
```

**Rules:**
- All fields `readonly` — matches every interface in `types.ts`
- Optional fields use `?:` shorthand — consistent with other optional fields in `RequestSpecBase` and `ClientSpec`
- `exactOptionalPropertyTypes` is active: `readonly T | undefined` is enforced at TypeScript level; `?:` shorthand is fine when the field is genuinely absent/optional
- `types.ts` has **zero imports and zero logic** — `RetryOptions`/`RetryPolicy` must stay pure types
- `ClientSpec.retry` and `RequestSpecBase.retry` field types change from `RetryPolicy` (old interface) to `RetryPolicy` (new union) — same field name, no callers need update at the property access level

---

### `src/retry.ts` (utility — create)

**Analogs:** `src/preview.ts` (async utility, signal-aware), `src/body.ts` (pure utility namespace + helpers)

**File header pattern** — copy from `src/preview.ts` (lines 1–4):
```typescript
// src/retry.ts — retry policy resolution, jitter delay, abort-aware sleep
// Dependency direction: send.ts → retry.ts → types.ts

import type { Method, RetryPolicy, RetryOptions } from "./types.js";
```

**Key conventions:**
- `.js` extension on all local imports (required by ESM + `NodeNext` module resolution)
- `import type` for type-only imports (matches `preview.ts` line 4, `decode.ts` line 4)
- `// src/retry.ts — ...` file header comment (matches `body.ts` line 1, `preview.ts` line 1, `decode.ts` line 1)
- `// Dependency direction: ...` on line 2 (matches `body.ts` line 2, `send.ts` line 2, `preview.ts` line 2)

**`RETRY_DEFAULTS` const pattern** — `as const satisfies` for typed readonly object:
```typescript
// src/retry.ts
export const RETRY_DEFAULTS = {
  maxAttempts: 3,
  methods: ["GET", "HEAD", "QUERY"] as const satisfies readonly Method[],
  retryableStatuses: [502, 503, 504] as const,
  initialDelayMs: 200,
  maxDelayMs: 10_000,
} as const;
```

**`ResolvedRetryPolicy` interface pattern** — readonly fields, all required (resolved, never optional):
```typescript
export interface ResolvedRetryPolicy {
  readonly maxAttempts: number;
  readonly methods: readonly Method[];
  readonly retryableStatuses: readonly number[];
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}
```

**`resolveRetryPolicy` function pattern** — pure function, null return for "no retry", D-10 no-merge semantics:
```typescript
export function resolveRetryPolicy(
  requestRetry: RetryPolicy | undefined,
  clientRetry: RetryPolicy | undefined,
): ResolvedRetryPolicy | null {
  if (requestRetry === false) return null;
  const effective: RetryPolicy | undefined =
    requestRetry !== undefined ? requestRetry : clientRetry;
  if (effective === undefined || effective === false) return null;
  if (effective === true) {
    return { ...RETRY_DEFAULTS };
  }
  // RetryOptions: merge with library defaults ONLY (not client values — D-10)
  return {
    maxAttempts: effective.maxAttempts ?? RETRY_DEFAULTS.maxAttempts,
    methods: effective.methods ?? RETRY_DEFAULTS.methods,
    retryableStatuses: effective.retryableStatuses ?? RETRY_DEFAULTS.retryableStatuses,
    initialDelayMs: effective.initialDelayMs ?? RETRY_DEFAULTS.initialDelayMs,
    maxDelayMs: effective.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs,
  };
}
```

**`jitterDelay` function pattern** — pure math, `Math.min` BEFORE `Math.random` (D-08 critical):
```typescript
export function jitterDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  // D-08: Math.min(maxDelayMs, ...) BEFORE Math.random() — cap applied first
  // Reversing order: base * 2^60 ≈ 1.15e18 → effectively infinite setTimeout
  return Math.floor(
    Math.random() * Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt)),
  );
}
```

**`sleepWithAbort` function pattern** — Promise-based timer, signal-aware, exact implementation from D-09:
```typescript
export function sleepWithAbort(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // D-09: early exit if already aborted before sleep starts
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
```

**Error handling pattern:** `sleepWithAbort` rejects with `signal.reason`, which has `.name === "AbortError"` or `.name === "TimeoutError"`. The rejection propagates to `send.ts`'s outer `catch (error)` → `classifyTransportError(error)` handles it. No error handling needed inside `retry.ts`.

---

### `src/send.ts` (service/core — modify lines 180–254)

**Analog:** `src/send.ts` itself — the outer `try/catch/finally` frame is preserved exactly; only the body (lines 180–254) is replaced.

**Import additions** — extend the existing import block at lines 5–19:
```typescript
// Add to existing imports:
import {
  resolveRetryPolicy,
  jitterDelay,
  sleepWithAbort,
} from "./retry.js";
```

**Pre-loop setup** — add after fetchInit construction (after line 178), before the `try`:
```typescript
// Resolve retry policy once before the loop (D-10)
const retryPolicy = resolveRetryPolicy(spec.retry, clientSpec?.retry);
const maxAttempts = retryPolicy?.maxAttempts ?? 1;
const methods = retryPolicy?.methods ?? [];
const retryableStatuses = retryPolicy?.retryableStatuses ?? [];
const initialDelayMs = retryPolicy?.initialDelayMs ?? 200;
const maxDelayMs = retryPolicy?.maxDelayMs ?? 10_000;
```

**Retry loop pattern** — replace lines 180–254 entirely (preserving `try/catch/finally` frame):
```typescript
try {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await effectiveFetch(url, fetchInit);

    // D-03: Status-first retry check — BEFORE matchResponse/decode
    const isRetryableStatus = retryableStatuses.includes(response.status);
    const methodEligible = (methods as readonly string[]).includes(spec.method);
    const hasRetryBudget = attempt < maxAttempts - 1;
    if (isRetryableStatus && methodEligible && hasRetryBudget && !(combinedSignal?.aborted === true)) {
      response.body?.cancel();
      await sleepWithAbort(jitterDelay(attempt, initialDelayMs, maxDelayMs), combinedSignal);
      continue;
    }

    // Final dispatch (non-retryable status, exhausted budget, or ineligible method)
    // ... existing match/decode block from lines 186–248 (unchanged) ...
  }
  // Unreachable: loop always returns or throws; satisfies TypeScript control-flow
  return classifyTransportError(new Error("retry loop exhausted without return"));
} catch (error) {
  return classifyTransportError(error);
} finally {
  // D-08: clearTimeout fires whether loop resolved, threw, or slept+aborted
  if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
}
```

**`classifyTransportError` reuse pattern** (already in `send.ts`, lines 68–81):
```typescript
// CRITICAL: duck-type .name — do NOT use instanceof Error (fails across VM realms)
// D-10: DOMException("Deadline exceeded", "TimeoutError").name === "TimeoutError" → timeout
// D-10: AbortController.abort() → DOMException("", "AbortError").name === "AbortError" → aborted
function classifyTransportError(error: unknown): SendResult<never> {
  let name = "";
  if (error !== null && typeof error === "object" && "name" in error) {
    const n = error.name;
    if (typeof n === "string") name = n;
  }
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  if (name === "AbortError") {
    return { kind: "transportError", error: { kind: "aborted" } };
  }
  return { kind: "transportError", error: { kind: "network", cause: error } };
}
```

**D-XX comment style** (from `send.ts` lines 106–178) — all design decisions get inline `// D-XX:` comments. Phase 6 additions use same style:
```typescript
// D-03: Status-first retry check — BEFORE matchResponse/decode
// D-07: attempt < maxAttempts (strict <), never <=; maxAttempts=3 → attempts 0, 1, 2
// D-08: Math.min(maxDelayMs) applied before Math.random() — cap first
// D-09: sleepWithAbort rejection propagates to outer catch → classifyTransportError
// D-10: resolveRetryPolicy — no field-level merge between request and client
```

---

### `tests/unit/retry.test.ts` (test — create)

**Analogs:** `tests/unit/body.test.ts` (pure utility tests, describe/it structure) and `tests/unit/decode.test.ts` (same pattern)

**File header / import pattern** — copy from `tests/unit/body.test.ts` (lines 1–2):
```typescript
import { describe, it, expect } from "vitest";
import { RETRY_DEFAULTS, resolveRetryPolicy, jitterDelay, sleepWithAbort } from "../../src/retry.js";
```

**Test structure pattern** — `describe("SUITE-ID: description", () => { it("...", ...) })`:
```typescript
// From tests/unit/body.test.ts lines 3–14, tests/unit/decode.test.ts lines 5–23:
describe("RETRY-01: resolveRetryPolicy() — D-10 semantics", () => {
  it("returns null when both request and client retry are undefined", () => {
    expect(resolveRetryPolicy(undefined, undefined)).toBeNull();
  });
  it("returns null when requestRetry is false", () => {
    expect(resolveRetryPolicy(false, { maxAttempts: 3 })).toBeNull();
  });
  // ...
});
```

**P5 off-by-one test pattern** — uses `send.test.ts`'s mock-fetch call-count pattern:
```typescript
// No timer infrastructure needed — just a call counter
describe("RETRY-P5: ADR-03 — maxAttempts is total attempts, not retries", () => {
  it("maxAttempts:3 → exactly 3 fetch() calls (not 4)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 502 });
    };
    // ... performSend call ...
    expect(callCount).toBe(3);
  });
});
```

**P6 abort-unaware sleep test pattern** — real timer + elapsed time assertion:
```typescript
// From RESEARCH.md Q5 Option B — direct unit test against sleepWithAbort:
describe("RETRY-P6: ADR-04 — sleepWithAbort rejects immediately on signal fire", () => {
  it("rejects in <150ms when signal fires at 50ms during a 500ms sleep", async () => {
    const controller = new AbortController();
    setTimeout(() => { controller.abort(); }, 50);
    const start = Date.now();
    await expect(sleepWithAbort(500, controller.signal)).rejects.toBeDefined();
    expect(Date.now() - start).toBeLessThan(150);
  });

  it("rejects immediately when signal is pre-aborted", async () => {
    const signal = AbortSignal.abort();
    const start = Date.now();
    await expect(sleepWithAbort(500, signal)).rejects.toBeDefined();
    expect(Date.now() - start).toBeLessThan(20);
  });
});
```

**P7 jitter overflow test pattern** — pure math, no timers:
```typescript
// From RESEARCH.md Q5 P7 test:
describe("RETRY-P7: ADR-05 — jitterDelay never exceeds maxDelayMs", () => {
  it("stays within maxDelayMs for attempt numbers 0..99", () => {
    const maxDelayMs = 10_000;
    for (let attempt = 0; attempt < 100; attempt++) {
      const delay = jitterDelay(attempt, 200, maxDelayMs);
      expect(delay).toBeLessThanOrEqual(maxDelayMs);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });
});
```

**Real timers stance:** No `vi.useFakeTimers()`. `retry.test.ts` uses real timers with small delay values (50ms abort / 500ms sleep) — sufficient per RESEARCH.md Q5 analysis. Vitest config uses real environment.

---

### `tests/unit/send.test.ts` (test — modify: extend with retry integration)

**Analog:** `tests/unit/send.test.ts` itself — append new `describe` blocks at end of file, following the existing `SEND-0N` numbering scheme.

**Mock-fetch call-count pattern** — from `send.test.ts` lines 89–99 (fetchCalled boolean) extended to a counter:
```typescript
// Existing pattern (lines 89–99) for boolean:
let fetchCalled = false;
const mockFetch: typeof globalThis.fetch = async () => {
  fetchCalled = true;
  return new Response();
};

// Extended for counting (P5 test):
let callCount = 0;
const mockFetch: typeof globalThis.fetch = async () => {
  callCount++;
  return new Response(null, { status: 502 });
};
```

**AbortController mid-flight pattern** — from `send.test.ts` lines 335–360:
```typescript
// Existing pattern (lines 335–360):
const controller = new AbortController();
const mockFetch: typeof globalThis.fetch = (_url, init) => {
  const signal = init?.signal ?? undefined;
  return new Promise((_resolve, reject) => {
    setTimeout(() => { controller.abort(); }, 10);
    signal?.addEventListener("abort", () => {
      const reason: unknown = signal.reason;
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    });
    setTimeout(_resolve, 500);
  });
};
```

**Result kind-narrowing pattern** — from `send.test.ts` lines 22–29:
```typescript
// Standard pattern throughout send.test.ts:
expect(result.kind).toBe("transportError");
if (result.kind === "transportError") {
  expect(result.error.kind).toBe("aborted");
}
```

**New describe blocks to append** — follow `SEND-0N` numbering (current max is `SEND-08`, so start at `SEND-09`):
```typescript
describe("SEND-09: retry loop — ADR-03 off-by-one (maxAttempts = total attempts)", () => {
  // P5: maxAttempts:3 → exactly 3 fetch() calls
});

describe("SEND-10: retry loop — ADR-04 abort during backoff (integration)", () => {
  // P6: abort during 500ms backoff resolves in <200ms
  // Complements retry.test.ts P6 unit test
});

describe("SEND-11: retry loop — ADR-06 non-retryable outcomes are not retried", () => {
  // network error on first attempt → no retry → single call
  // 200 status → no retry
  // POST method with 502 → no retry (method not in default methods)
});

describe("SEND-12: retry loop — resolveRetryPolicy integration", () => {
  // client retry:true + request retry:false → no retry (request false wins)
  // request RetryOptions fully replaces client — D-10 no-merge
});
```

---

## Shared Patterns

### Module File Header
**Source:** All of `src/body.ts` (line 1), `src/preview.ts` (line 1), `src/decode.ts` (line 1), `src/send.ts` (line 1)
**Apply to:** `src/retry.ts`
```typescript
// src/retry.ts — <one-line description of module purpose>
// Dependency direction: send.ts → retry.ts → types.ts
```

### Import Style (ESM + `.js` extensions)
**Source:** `src/send.ts` lines 5–19, `src/preview.ts` lines 4–5, `src/decode.ts` lines 4–5
**Apply to:** `src/retry.ts`, `src/send.ts` (added import)
```typescript
import type { Method, RetryPolicy, RetryOptions } from "./types.js";
// ↑ import type for type-only; .js extension always; path relative with ./
```

### Error Classification (Duck-type, no instanceof)
**Source:** `src/send.ts` lines 64–81 (`classifyTransportError`)
**Apply to:** `src/retry.ts` (no new classification needed — `sleepWithAbort` rejection handled by `send.ts`'s existing outer catch)
```typescript
// CRITICAL: duck-type .name — do NOT use instanceof Error, which fails across VM realms
// name === "TimeoutError" → timeout; name === "AbortError" → aborted
```

### Test Import Pattern
**Source:** `tests/unit/body.test.ts` line 1–2, `tests/unit/send.test.ts` lines 1–6
**Apply to:** `tests/unit/retry.test.ts`
```typescript
import { describe, it, expect } from "vitest";
import { ... } from "../../src/retry.js";
// ↑ .js extension, ../../src/ relative path from tests/unit/
```

### Test Describe/It Naming
**Source:** `tests/unit/body.test.ts` lines 3–14, `tests/unit/send.test.ts` lines 7–12
**Apply to:** `tests/unit/retry.test.ts`, `tests/unit/send.test.ts` additions
```typescript
describe("SUITE-NN: Short description of invariant being tested", () => {
  it("specific condition → expected outcome", () => { ... });
});
// Pattern: UPPERCASE-ID + colon + description referencing the design decision
```

### Signal Composition and Pre-abort Guard
**Source:** `src/send.ts` lines 107–109 (pre-abort guard), lines 131–153 (deadline + combinedSignal)
**Apply to:** `src/retry.ts` (`sleepWithAbort` pre-abort early exit), `src/send.ts` retry loop (pass `combinedSignal` to `sleepWithAbort`)
```typescript
// Pre-abort check pattern (send.ts line 107):
if (options?.signal?.aborted === true) { ... }

// In sleepWithAbort:
if (signal?.aborted === true) { reject(signal.reason); return; }
```

### `noUncheckedIndexedAccess` Compliance
**Source:** `src/send.ts` (general style), CONTEXT.md §Established Patterns
**Apply to:** `src/retry.ts`, `src/send.ts` modifications
```typescript
// Array includes() is safe — no index access
retryableStatuses.includes(response.status);  // ✅
// Avoid array[i] without fallback — use .at(i) ?? fallback
```

---

## No Analog Found

None — all five files have strong analogs within the codebase.

---

## Metadata

**Analog search scope:** `src/`, `tests/unit/`
**Files scanned:** `src/types.ts`, `src/send.ts`, `src/body.ts`, `src/preview.ts`, `src/decode.ts`, `tests/unit/send.test.ts`, `tests/unit/body.test.ts`, `tests/unit/decode.test.ts`
**Pattern extraction date:** 2026-05-08
