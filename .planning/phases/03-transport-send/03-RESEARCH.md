# Phase 3: Transport + Send — Research

**Researched:** 2026-05-05
**Domain:** TypeScript HTTP transport layer — `fetch`, `AbortSignal`, deadline control, body streaming, error classification
**Confidence:** HIGH (all critical claims verified against live runtime in Node 22 / project codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `createClient(spec: ClientSpec): Client` — return type changes from `ClientSpec` to `Client`. Phase 2's placeholder replaced.
- **D-02:** `Client` interface lives in `src/client.ts`; `SendOptions = { signal?: AbortSignal }` added to `types.ts`.
- **D-03:** Internal function is `performSend(request, clientSpec, options)` in `src/send.ts`. `client.ts` imports `performSend` from `send.ts` and closes over spec. Dependency: `client.ts → send.ts → types.ts, request.ts`. No circular imports.
- **D-04:** `performSend` is NOT exported from package entrypoints — internal only.
- **D-05:** Pre-abort guard at top of `performSend()`: if `options?.signal?.aborted`, return `{ kind: "transportError", error: { kind: "aborted" } }` immediately without consuming the request.
- **D-06:** "Never throws" covers transport failures, abort, deadline, body-read errors. `request.consume()` TypeError on re-use propagates as a programming error.
- **D-07:** `deadlineMs <= 0` → `RangeError("deadlineMs must be a positive integer")`. Programming error, not a structured result.
- **D-08:** Deadline uses `new AbortController()` + `setTimeout` + `finally { clearTimeout }`. **Never** `AbortSignal.timeout()`.
- **D-09:** Four signal composition cases: both → `AbortSignal.any([callerSignal, deadlineController.signal])`; deadline only → `deadlineController.signal`; caller only → `callerSignal`; neither → `undefined`.
- **D-10:** Deadline abort reason MUST be `new DOMException("Deadline exceeded", "TimeoutError")` — the `"TimeoutError"` name is what causes `error.name === "TimeoutError"` at the catch site.
- **D-11:** Classify by `error.name`: `"TimeoutError"` → timeout, `"AbortError"` → aborted, else → network. Same logic in both `fetch()` catch and body-read catch.
- **D-12:** If deadline fires during body reading → `timeout`, not `decodeError.bodyReadFailed`.
- **D-13:** Phase 3 returns `{ kind: "unhandledStatus", status, headers, preview }` for ALL HTTP responses (stub). Phase 5 replaces.
- **D-14:** Stub is documented; Phase 5 is purely additive at the stub location.
- **D-15:** Body preview reads first `N` bytes (default 8192) via `response.body.getReader()`. `truncated = true` when N bytes collected and stream is not exhausted.
- **D-16:** Body-read errors classified by `error.name` per D-11. `combinedSignal` governs body stream.
- **D-17:** Preview text: `new TextDecoder().decode(bytesUint8Array)`. Decoding errors swallowed; `text: ""` on failure.
- **D-18:** URL: `absoluteUrl` bypasses `baseUrl`. Otherwise: `new URL(buildPath(segments), baseUrl)` — `baseUrl` must end with `/` or last segment is replaced.
- **D-19:** `mergeHeaders(clientSpec.headers, requestSpec.headers)` — already in `client.ts`.
- **D-20:** `deadlineMs`: `requestSpec.deadlineMs ?? clientSpec.deadlineMs`. Request overrides client.
- **D-21:** `fetch` impl: `clientSpec.fetch ?? globalThis.fetch`. Injectable test seam.
- **D-22:** Entrypoints remain stubs; tests import directly from `../../src/send.js` and `../../src/client.js`.

### The Agent's Discretion

- Circular import resolution is a locked pattern (D-03): `performSend` accepts pre-resolved values; `send.ts` imports ONLY from `types.ts` and `request.ts`.
- Preview truncation detection: whether to peek one extra read after collecting exactly N bytes (see Pitfall 4 below).

### Deferred Ideas (OUT OF SCOPE)

- Response matching + decode dispatch → Phase 5
- Retry loop + multi-attempt deadline → Phase 6
- Body producers and decoders → Phase 4
- `requestError` variant in `SendResult` → future phase
- Entrypoint wiring → Phase 8
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEND-01 | `createClient()` constructs a client with shared defaults | D-01, D-02: `Client` interface + `createClient()` refactor in `src/client.ts` |
| SEND-02 | `send()` executes a request and returns `SendResult<R>` — never throws | D-06: never-throws contract; D-05: pre-abort guard; D-21: injectable fetch |
| SEND-03 | Header merge case-insensitive; request overrides client; `undefined` filtered | D-19: `mergeHeaders()` already correct in `client.ts` |
| SEND-04 | `responses` layers with 4-step precedence; maps never pre-merged | Stub in Phase 3 (D-13); Phase 5 implements. `requestSpec.responses` and `clientSpec.responses` passed separately to `performSend`. |
| SEND-05 | Scalar policies (`retry`, `deadlineMs`) are request-over-client override | D-20: `requestSpec.deadlineMs ?? clientSpec.deadlineMs` |
| SEND-06 | `AbortSignal.any()` composes caller + deadline; `DOMException("...", "TimeoutError")` distinguishes timeout | D-08, D-09, D-10: verified working in Node 22 [VERIFIED: runtime test] |
</phase_requirements>

---

## Summary

Phase 3 implements the single-attempt transport core: a `performSend()` function in `src/send.ts` that calls `fetch()`, composes abort signals, classifies all transport errors, reads a body preview, and returns `Promise<SendResult<R>>` that never throws. It also upgrades `src/client.ts` to return a proper `Client` interface. Phase 3 establishes the exact code structure that Phase 5 (response matching) and Phase 6 (retry) will extend additively without modifying.

The two highest-risk implementation details are: (1) the `DOMException("Deadline exceeded", "TimeoutError")` abort reason — verified live that `error.name === "TimeoutError"` when caught, enabling correct timeout classification; and (2) the circular import concern between `send.ts` and `client.ts` — resolved definitively by the D-03 dependency direction: `client.ts → send.ts`. `send.ts` imports only from `types.ts` and `request.ts`.

The body preview streaming has one non-obvious edge: when the stream delivers exactly N bytes in a single chunk, a naive implementation incorrectly sets `truncated = true`. The correct pattern peeks one additional read after collecting N bytes to verify stream exhaustion.

**Primary recommendation:** Follow the decisions in CONTEXT.md exactly. No design exploration needed — all decisions are locked. Focus execution on correctness of the three subtle mechanisms: DOMException naming, AbortSignal composition edge cases, and the truncation detection peek.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Signal composition (AbortSignal.any) | `src/send.ts` | — | Pure transport concern; deadline controller lives and dies with one performSend call |
| Deadline timer management | `src/send.ts` | — | `clearTimeout` in `finally` must be co-located with the `setTimeout` |
| Transport error classification | `src/send.ts` | — | Single classification function used in both fetch catch and body-read catch |
| URL construction | `src/send.ts` | `src/request.ts` (buildPath, buildQuery) | send.ts calls buildPath/buildQuery; URL assembly is a transport step |
| Header merge | `src/client.ts` (mergeHeaders) | `src/send.ts` (calls it) | Already implemented and tested in client.ts |
| Body preview reading | `src/send.ts` | `src/preview.ts` (Phase 4 may extract) | Phase 3 inline in send.ts; Phase 4 may extract to src/preview.ts |
| Client interface definition | `src/client.ts` | — | Client interface lives with createClient per D-02 |
| Injectable fetch seam | `ClientSpec.fetch` field (types.ts) | `src/send.ts` (reads it) | Test seam is the fetch field on ClientSpec |

---

## Standard Stack

### Core (all already in project — no new dependencies)

| Library / Global | Version | Purpose | Notes |
|---------|---------|---------|--------------|
| `globalThis.fetch` | Web standard (Node 20.3+) | HTTP transport | No polyfill needed; Node 24 native fetch is spec-identical to browser fetch [VERIFIED: STATE.md] |
| `AbortController` | Web standard | Deadline timer controller | `new AbortController()` + `setTimeout` pattern |
| `AbortSignal.any()` | Node 20.3+, modern browsers | Signal composition | Available in Node 22 (project CI target) [VERIFIED: runtime test] |
| `DOMException` | Web standard | Abort reason for deadline | `new DOMException("Deadline exceeded", "TimeoutError")` — name drives classification |
| `ReadableStream.getReader()` | Web standard | Body preview streaming | Returns `ReadableStreamDefaultReader` |
| `TextDecoder` | Web standard | UTF-8 decode of preview bytes | Use `{ fatal: false }` for non-throwing decode |

**Installation:** None. All are Web Standard globals available in Node 22+ and modern browsers.

---

## Architecture Patterns

### System Architecture Diagram

```
Request<R> + ClientSpec + SendOptions
         │
         ▼
    performSend()
         │
    ┌────▼──────────────────────────────────────────────┐
    │  Pre-abort guard (options.signal.aborted)         │
    │  deadlineMs validation (<= 0 → RangeError)        │
    │  request.consume() → RequestSpec                  │
    │  URL construction (absoluteUrl or baseUrl+path+q) │
    │  mergeHeaders(client.headers, spec.headers)       │
    │  effectiveDeadlineMs = spec.deadlineMs ??         │
    │                        client.deadlineMs          │
    │  Signal composition:                              │
    │    → AbortSignal.any([caller, deadline]) or       │
    │       deadline only / caller only / undefined     │
    └─────────────────────────┬─────────────────────────┘
                              │
            ┌─────────────────▼──────────────────┐
            │   fetch(url, { method, headers,    │
            │         body, signal })            │
            └──────┬─────────────────────────────┘
                   │
        ┌──────────┴──────────────┐
        │ throws                  │ resolves (HTTP Response)
        ▼                         ▼
  classifyError(e)         readBodyPreview()
  → TransportError         → BodyPreview
  { kind: "timeout" }          │
  { kind: "aborted" }    ┌─────▼────────────────────────────┐
  { kind: "network" }    │ Phase 3 stub: return              │
                         │ { kind: "unhandledStatus",        │
                         │   status, headers, preview }      │
                         │ (Phase 5 replaces with matching)  │
                         └───────────────────────────────────┘

finally: clearTimeout(deadlineTimer)
         reader.cancel() [in readBodyPreview]
```

### Recommended Project Structure

```
src/
├── types.ts         # + SendOptions type (single addition)
├── request.ts       # unchanged (buildPath, buildQuery, Request)
├── client.ts        # + Client interface; createClient() returns Client (imports performSend)
└── send.ts          # NEW: performSend() — transport core
tests/unit/
├── request.test.ts  # existing
├── client.test.ts   # existing (update: createClient returns Client with .send())
├── send.test.ts     # NEW: performSend unit tests
└── types.test.ts    # existing
```

### Pattern 1: performSend() skeleton with signal composition

```typescript
// Source: CONTEXT.md D-03, D-08, D-09, D-10 [VERIFIED: runtime test]
import type { ClientSpec, SendResult, SendOptions } from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";

export async function performSend<R>(
  request: Request<R>,
  clientSpec: ClientSpec,
  options?: SendOptions,
): Promise<SendResult<R>> {
  // D-05: Pre-abort guard — before consuming the request
  if (options?.signal?.aborted === true) {
    return { kind: "transportError", error: { kind: "aborted" } };
  }

  // D-07: deadlineMs validation
  const effectiveDeadlineMs = (request as unknown as { _spec?: { deadlineMs?: number } })
    // ... resolved from requestSpec after consume()
  
  const spec = request.consume(); // throws TypeError if already consumed — intentional
  
  const effectiveDeadlineMs2 = spec.deadlineMs ?? clientSpec.deadlineMs;
  if (effectiveDeadlineMs2 !== undefined && effectiveDeadlineMs2 <= 0) {
    throw new RangeError("deadlineMs must be a positive integer");
  }

  // Signal composition
  let deadlineController: AbortController | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const callerSignal = options?.signal;

  if (effectiveDeadlineMs2 !== undefined) {
    deadlineController = new AbortController();
    deadlineTimer = setTimeout(
      () => deadlineController!.abort(new DOMException("Deadline exceeded", "TimeoutError")),
      effectiveDeadlineMs2,
    );
  }

  // D-09: four cases
  const combinedSignal: AbortSignal | undefined =
    callerSignal !== undefined && deadlineController !== undefined
      ? AbortSignal.any([callerSignal, deadlineController.signal])
      : deadlineController !== undefined
        ? deadlineController.signal
        : callerSignal;

  try {
    // ... fetch call
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }
}
```

### Pattern 2: Transport error classification function

```typescript
// Source: CONTEXT.md D-11 [VERIFIED: runtime test — error.name is correct discriminant]
function classifyTransportError(error: unknown): SendResult<never> {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  if (name === "AbortError") {
    return { kind: "transportError", error: { kind: "aborted" } };
  }
  return { kind: "transportError", error: { kind: "network", cause: error } };
}
```

**Key verified fact:** `fetch()` throws `signal.reason` directly, not a new `AbortError`. When `deadlineController.abort(new DOMException("Deadline exceeded", "TimeoutError"))` fires, the caught error IS that DOMException with `name === "TimeoutError"`. Classifying by `error.name` is the correct and only reliable approach. [VERIFIED: runtime test]

### Pattern 3: Body preview with correct truncation detection

```typescript
// Source: CONTEXT.md D-15, D-16, D-17 [VERIFIED: runtime test]
async function readBodyPreview(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<BodyPreview> {
  if (response.body === null) {
    return { text: "", bytesRead: 0, truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      if (value.length <= remaining) {
        chunks.push(value);
        bytesRead += value.length;
        if (bytesRead === maxBytes) {
          // Peek one more read to check stream exhaustion
          const { done: isDone } = await reader.read();
          if (!isDone) truncated = true;
          break;
        }
      } else {
        // Chunk larger than remaining — definitely truncated
        chunks.push(value.slice(0, remaining));
        bytesRead += remaining;
        truncated = true;
        break;
      }
    }
  } catch (e) {
    // D-12: classify abort/timeout; on error return partial preview
    return classifyTransportError(e) as never; // handled by caller
  } finally {
    await reader.cancel().catch(() => {/* swallow cancel errors */});
  }

  // Assemble bytes
  const all = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }

  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(all);
  } catch { /* swallow — text remains "" */ }

  return { text, bytesRead, truncated };
}
```

**Note on the peek pattern:** After collecting exactly N bytes, a one-byte peek determines if the stream is exhausted. [VERIFIED: runtime test]. Without the peek, a stream that delivers exactly N bytes returns `truncated: true` incorrectly.

### Pattern 4: URL construction

```typescript
// Source: CONTEXT.md D-18 [VERIFIED: runtime test]

function buildUrl(
  spec: RequestSpec,
  clientSpec: ClientSpec,
): URL {
  if (spec.absoluteUrl !== undefined) {
    return new URL(String(spec.absoluteUrl));
  }
  const path = spec.path !== undefined ? buildPath(spec.path) : "";
  const base = String(clientSpec.baseUrl ?? "");
  // CRITICAL: baseUrl must end with "/" or last segment is replaced
  // "https://api.example.com/v1/" + "users/123" → correct
  // "https://api.example.com/v1"  + "users/123" → v1 is replaced
  const url = new URL(path, base);
  
  const mergedQuery = mergeQuery(clientSpec.query, spec.query);
  const params = buildQuery(mergedQuery);
  const paramStr = params.toString();
  if (paramStr.length > 0) url.search = paramStr;
  
  return url;
}
```

### Pattern 5: Client interface + createClient refactor

```typescript
// Source: CONTEXT.md D-01, D-02, D-03
// In src/types.ts (addition):
export type SendOptions = { signal?: AbortSignal };

// In src/client.ts (addition):
import type { SendOptions, SendResult, ClientSpec } from "./types.js";
import type { Request } from "./request.js";
import { performSend } from "./send.js";

export interface Client {
  send<R>(request: Request<R>, options?: SendOptions): Promise<SendResult<R>>;
}

export function createClient(spec: ClientSpec): Client {
  return {
    send: (req, opts) => performSend(req, spec, opts),
  };
}
```

### Anti-Patterns to Avoid

- **`AbortSignal.timeout()` for deadline:** Cannot `clearTimeout()` — leaks timer after request completes. Always use `new AbortController()` + explicit `setTimeout` + `finally { clearTimeout }`.
- **`error instanceof DOMException` for classification:** Unreliable across realm boundaries (iframes, workers). Use `error.name` string comparison.
- **`error instanceof Error` before accessing `.name`:** Unknown errors may not be `Error` instances. Access via `error instanceof Error ? error.name : ""` pattern, or cast through `unknown`.
- **Spreading headers with `{ ...base, ...override }`:** Spreads `undefined` values as `undefined` keys, violating `exactOptionalPropertyTypes`. Use the existing `mergeHeaders()` loop.
- **`response.body?.getReader()` without `finally { reader.cancel() }`:** Abandons TCP socket open until GC. Non-negotiable `finally` block.
- **`send.ts` importing from `client.ts`:** Creates circular import. `send.ts` imports ONLY from `types.ts` and `request.ts` (D-03).
- **Calling `request.consume()` before pre-abort guard:** If signal is already aborted, the request is consumed unnecessarily. Guard fires first, before `consume()` (D-05).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signal composition | Custom `addEventListener("abort", ...)` logic | `AbortSignal.any([a, b])` | Web standard; handles all edge cases including pre-aborted signals |
| Deadline timer | Custom deadline class | `new AbortController()` + `setTimeout` + `finally { clearTimeout }` | The established pattern; `AbortSignal.timeout()` is the wrong tool (no clearTimeout) |
| URL encoding | `encodeURI` / manual percent-encoding | `encodeURIComponent` in `buildPath()` (already implemented) + `URLSearchParams` in `buildQuery()` | Already tested and correct in Phase 2 |
| Header normalization | Custom toLowerCase logic | `mergeHeaders()` (already in client.ts) | Already implemented and tested |

**Key insight:** All the hard merge and encoding logic is already implemented and tested from Phase 2. `performSend()` calls the existing utilities; it does not re-implement them.

---

## Common Pitfalls

### Pitfall 1: Wrong DOMException name → timeout classified as aborted (CRITICAL)

**What goes wrong:** `deadlineController.abort()` called without a reason, or with `new DOMException("...", "AbortError")`. The caught error has `name === "AbortError"`, and classifies as `aborted` instead of `timeout`. Every deadline expiry silently returns the wrong result.

**Why it happens:** `AbortController.abort()` without an argument creates an `AbortError` by default. The `"TimeoutError"` name must be explicitly provided.

**How to avoid:** Always: `deadlineController.abort(new DOMException("Deadline exceeded", "TimeoutError"))`.

**Warning signs:** A test that sets `deadlineMs: 1` and expects `{ kind: "timeout" }` returns `{ kind: "aborted" }` instead.

**Verification:** [VERIFIED: runtime test] — `new DOMException("Deadline exceeded", "TimeoutError")` caught after `throw reason` has `name === "TimeoutError"`.

### Pitfall 2: Circular import between send.ts and client.ts

**What goes wrong:** `send.ts` imports `mergeHeaders`/`mergeQuery` from `client.ts`, AND `client.ts` imports `performSend` from `send.ts`. Node/bundler raises circular dependency error.

**Why it happens:** Both files need to share merge utilities and transport function.

**How to avoid:** Per D-03, `send.ts` imports ONLY from `types.ts` and `request.ts`. Merge utilities are called by `createClient()` in `client.ts` before passing resolved values to `performSend`, OR `performSend` accepts pre-merged parameters. `send.ts` must never import from `client.ts`.

**Warning signs:** TypeScript/bundler circular import warning at compile time.

### Pitfall 3: Pre-abort check after consume()

**What goes wrong:** `request.consume()` called before checking `options?.signal?.aborted`. If aborted, the request is consumed (affine state changed) even though no network call was made. Caller cannot re-send with a fresh signal.

**Why it happens:** Natural flow — check signal, then consume, then fetch. D-05 reverses this.

**How to avoid:** Check `options?.signal?.aborted` BEFORE calling `request.consume()`. Return immediately if true.

**Spec reference:** SPEC.md §Abort: "If `send()` is called with a signal that is already in the aborted state, the result is immediately `{ kind: "transportError", error: { kind: "aborted" } }`. No network call is made."

### Pitfall 4: Incorrect truncation detection for exactly-N bytes

**What goes wrong:** A stream delivering exactly `bodyPreviewBytes` bytes in one chunk sets `truncated = true` incorrectly. The stream was actually fully read.

**Why it happens:** When `bytesRead === maxBytes` after collecting a chunk, the loop breaks and sets `truncated = true` without checking if the stream is empty.

**How to avoid:** After collecting exactly N bytes, do one additional `reader.read()`. If `done: true`, set `truncated = false`. If more data, set `truncated = true`.

**Verification:** [VERIFIED: runtime test] — peek pattern correctly returns `truncated: false` for exact-N stream, `truncated: true` for N+1 stream.

### Pitfall 5: baseUrl trailing slash

**What goes wrong:** `new URL("users/123", "https://api.example.com/v1")` → `https://api.example.com/users/123` (v1 path segment replaced). Expected: `https://api.example.com/v1/users/123`.

**Why it happens:** Standard URL resolution replaces the last segment of the base when the relative URL is not absolute-path-rooted.

**How to avoid:** Document in comments that `baseUrl` should end with `/`. Optionally normalize `baseUrl` to append `/` if missing before calling `new URL(path, baseUrl)`.

**Verification:** [VERIFIED: runtime test] — `new URL("users/123", "https://api.example.com/v1/")` → correct; without trailing slash → incorrect.

### Pitfall 6: `exactOptionalPropertyTypes` with signal in fetch init

**What goes wrong:** `{ signal: combinedSignal }` where `combinedSignal` can be `undefined` — TypeScript rejects this under `exactOptionalPropertyTypes` because `signal?: AbortSignal` doesn't accept `undefined` as an explicit value.

**Why it happens:** `exactOptionalPropertyTypes` distinguishes between omitted and `undefined`.

**How to avoid:** Build the fetch init object conditionally:
```typescript
const fetchInit: RequestInit = { method, headers, redirect: "follow" };
if (spec.body !== undefined) fetchInit.body = spec.body as BodyInit;
if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;
```

Or use spread with explicit exclusion. Do not pass `signal: undefined`.

**Verification:** [VERIFIED: tsconfig.json] — `exactOptionalPropertyTypes: true` is active.

### Pitfall 7: `noUncheckedIndexedAccess` in byte array assembly

**What goes wrong:** `arr[0]` has type `number | undefined` even after `arr.length > 0`. TypeScript rejects direct use without narrowing.

**How to avoid:** Use `.at(0) ?? 0` for single-element access, or use the `Uint8Array.set()` offset pattern for multi-chunk assembly (avoids per-byte indexing entirely).

**Verification:** [VERIFIED: tsconfig.json] — `noUncheckedIndexedAccess: true` is active.

### Pitfall 8: `verbatimModuleSyntax` — type-only imports

**What goes wrong:** `import { Request } from "./request.js"` where `Request` is only used as a type → TypeScript error under `verbatimModuleSyntax` unless the import is `import type`.

**How to avoid:** Use `import type { ... }` for all type-only imports. Use `import { ... }` only when the imported identifier is used as a value at runtime (e.g., calling `buildPath`, `buildQuery`, `mergeHeaders`, `mergeQuery`).

```typescript
import type { ClientSpec, SendResult, BodyPreview, SendOptions } from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";
```

**Verification:** [VERIFIED: tsconfig.json] — `verbatimModuleSyntax: true` is active.

---

## AbortSignal.any() — Edge Cases in Node 22

[VERIFIED: runtime test — Node v22.22.2]

1. **Pre-aborted input signal:** `AbortSignal.any([alreadyAborted, fresh])` returns an already-aborted signal immediately. The combined signal's `reason` is the first aborted input's `reason`. This is correct behavior — the pre-abort guard (D-05) catches this before `AbortSignal.any()` is called.

2. **Both signals fire simultaneously:** The first to fire wins; `reason` is that signal's reason. No race condition in JS event loop (single-threaded).

3. **Single-element array:** `AbortSignal.any([s])` is valid and returns a signal that mirrors `s`.

4. **`combinedSignal` vs `deadlineController.signal`:** When only a deadline exists (no caller signal), use `deadlineController.signal` directly rather than `AbortSignal.any([deadlineController.signal])`. The D-09 four-case handling is correct — `AbortSignal.any` with one signal still works but is unnecessary overhead.

5. **Body stream and the combined signal (Node 24):** In Node.js native fetch (undici), the fetch signal governs the body stream. When the signal fires during `reader.read()`, the read rejects with the signal's reason. This is the mechanism that makes D-12 work: deadline fires during body reading → `reader.read()` rejects with the DOMException → classified as `timeout`. [ASSUMED — based on undici behavior; not directly tested in this session]

---

## DOMException Reason Classification — How fetch() Propagates

[VERIFIED: runtime test]

`fetch()` does NOT create a new `AbortError` when aborted. It throws `signal.reason` directly.

```
Signal aborted with: new DOMException("Deadline exceeded", "TimeoutError")
fetch() throw site: throws that exact DOMException
caught error.name: "TimeoutError" ✓

Signal aborted with: (no reason / default)
fetch() throw site: throws DOMException("", "AbortError")
caught error.name: "AbortError" ✓
```

Classification algorithm:
1. `error.name === "TimeoutError"` → `{ kind: "timeout" }` 
2. `error.name === "AbortError"` → `{ kind: "aborted" }`
3. anything else → `{ kind: "network", cause: error }`

**Why `error.name` not `error instanceof DOMException`:** Both timeout and abort errors ARE DOMExceptions, so `instanceof` doesn't distinguish them. `instanceof` also fails across realm boundaries (workers, iframes). Name-based classification is correct and portable.

---

## Body Preview Streaming — Edge Cases

[VERIFIED: runtime test]

| Scenario | Expected Result |
|----------|----------------|
| `response.body === null` (204/304/205) | `{ text: "", bytesRead: 0, truncated: false }` — return immediately |
| Empty stream (200 + Content-Length: 0) | `{ text: "", bytesRead: 0, truncated: false }` — `done: true` on first read |
| Short body (< N bytes) | `{ text: "...", bytesRead: actual, truncated: false }` |
| Exactly N bytes in one chunk | `{ bytesRead: N, truncated: false }` — requires peek read |
| Exactly N bytes in multiple chunks | `{ bytesRead: N, truncated: false }` — peek read after last chunk |
| N+1 bytes | `{ bytesRead: N, truncated: true }` |
| Large body (> N) | `{ bytesRead: N, truncated: true }` |
| Deadline fires during read | Body-read catch fires → classify by `error.name` → return transport error |
| Truncated UTF-8 at boundary | TextDecoder `{ fatal: false }` inserts `\uFFFD` — no throw |

**`reader.cancel()` in finally:** Non-negotiable. The SPEC says preview reads from `response.body` directly (not `Response.clone()`). The reader must be cancelled to release the TCP socket when done or on error. `cancel()` returns a Promise — `await reader.cancel().catch(() => {})` is correct pattern.

**`{ fatal: false }` on TextDecoder:** Confirmed to produce replacement characters (`\uFFFD`) instead of throwing on truncated multi-byte sequences. [VERIFIED: runtime test]

---

## Circular Import Resolution

**Problem:** If `send.ts` imports `mergeHeaders`/`mergeQuery` from `client.ts` AND `client.ts` imports `performSend` from `send.ts` → circular dependency.

**Solution (D-03, locked):** `send.ts` imports ONLY from `types.ts` and `request.ts`. Merge utilities are called by `client.ts` before passing resolved values to `performSend`, OR `performSend` calls them itself by having `client.ts` import them and pass the resolved values.

**Cleanest implementation:** `performSend` performs all merging internally, importing `mergeHeaders` and `mergeQuery` directly. Wait — that requires `send.ts` to import from `client.ts` (where those functions live). That IS the circular problem.

**Resolution:** Move to Option A — `performSend` accepts pre-merged parameters:

```typescript
// client.ts creates the closure and passes merged values:
export function createClient(spec: ClientSpec): Client {
  return {
    send: <R>(req: Request<R>, opts?: SendOptions) => {
      // mergeHeaders / mergeQuery called HERE in client.ts closure:
      return performSend(req, spec, opts);  // OR pass pre-merged values
    }
  };
}
```

OR Option B (preferred per CONTEXT.md code_context note): `performSend` accepts the raw `ClientSpec` and calls `mergeHeaders`/`mergeQuery` internally — but those utilities are imported from `client.ts` only if they stay in `client.ts`. 

**The actual clean solution:** Move `mergeHeaders` and `mergeQuery` to be importable by `send.ts` without creating a cycle. They can stay in `client.ts` because `send.ts` DOES NOT import from `client.ts`. Instead, `send.ts` re-implements the merge inline OR the functions are moved to a shared utility.

**CONTEXT.md code_context recommended resolution:** `performSend` accepts already-resolved `effectiveHeaders`, `effectiveQuery`, `effectiveDeadlineMs`, `effectiveFetch`, and `mergedResponseMap` as parameters derived by `createClient()`'s closure. This way `send.ts` imports nothing from `client.ts`.

**Practical implementation:**

```typescript
// src/send.ts imports: types.ts + request.ts ONLY
export async function performSend<R>(
  request: Request<R>,
  clientSpec: ClientSpec,  // ← ClientSpec type from types.ts (no import of client.ts)
  options?: SendOptions,
): Promise<SendResult<R>>

// src/client.ts imports send.ts + types.ts + request.ts
// Calls mergeHeaders/mergeQuery inside createClient's send closure
// Passes clientSpec to performSend (performSend calls merge utils it has from its own imports)
```

Wait, but `mergeHeaders` and `mergeQuery` live in `client.ts`. If `send.ts` needs them... they need to be moved or duplicated. The cleanest solution: move `mergeHeaders` and `mergeQuery` to `src/utils.ts` or keep them in `client.ts` but call them from within `createClient()`'s closure, passing results to `performSend`.

**Final recommended pattern:**

```typescript
// src/client.ts
import { mergeHeaders, mergeQuery } from "./client.js"; // own utilities
import { performSend } from "./send.js";

export function createClient(spec: ClientSpec): Client {
  return {
    send: <R>(req: Request<R>, opts?: SendOptions) => {
      // Pre-merge in the closure here, pass to performSend:
      // OR: pass raw spec and let performSend do the merging
      return performSend(req, spec, opts);
    }
  };
}

// src/send.ts needs merge functions. They should NOT come from client.ts.
// Option: inline the two trivially small merge operations in send.ts
// OR: factor mergeHeaders/mergeQuery into src/merge.ts (new file, imported by both)
```

**Recommended:** Keep `mergeHeaders` / `mergeQuery` in `client.ts` (they're already there and tested). `performSend` accepts `ClientSpec` (a type, not an import from `client.ts`). Inside `performSend`, call merge inline with the same logic (since they're 10 lines each) OR have `createClient` pass pre-resolved values. The CONTEXT.md code_context recommendation is explicit: pass pre-resolved values or call them from the `client.ts` closure.

**Definitive decision:** The planner should choose ONE of these and note it. Both eliminate the cycle. The "pass pre-resolved to performSend" approach is clean and avoids any merge logic duplication.

---

## TypeScript Strictness Concerns

[VERIFIED: tsconfig.json — all flags active]

### exactOptionalPropertyTypes
- **Impact on fetch init:** `{ signal?: AbortSignal }` — do not set `signal: undefined`. Build the object conditionally.
- **Impact on `SendOptions`:** `{ signal?: AbortSignal }` — `options?.signal` is `AbortSignal | undefined`, not `AbortSignal`. Access with `options?.signal?.aborted`.
- **Impact on `ClientSpec` fields:** All optional fields are genuinely optional — do not read them as `| undefined` explicitly in property definitions.

### verbatimModuleSyntax
- **Rule:** All type-only imports MUST use `import type { ... }`.
- **Affected imports in send.ts:**
  - `import type { ClientSpec, SendResult, TransportError, BodyPreview, SendOptions } from "./types.js"` — all types
  - `import type { Request } from "./request.js"` — type only
  - `import { buildPath, buildQuery } from "./request.js"` — runtime values
- **Note:** `RequestSpec` is returned by `request.consume()` — it's a type, not a value; `import type`.

### noUncheckedIndexedAccess
- **Impact:** `chunks[0]` is `Uint8Array | undefined`. Use the `Uint8Array.set(chunk, offset)` assembly pattern (which iterates with `for...of`) to avoid indexed access.
- **Impact on query/header records:** `record["key"]` is `string | undefined`. Guard with `?? ""` or check for presence.

### Module resolution: `.js` extensions required
- All relative imports MUST use `.js` extension in `.ts` files.
- **Correct:** `import { buildPath } from "./request.js"`
- **Wrong:** `import { buildPath } from "./request"`
- [VERIFIED: copilot-instructions.md] — explicitly required; enforced by `eslint-plugin-import-x`.

---

## Test Strategy

### Fetch as Injectable Test Seam

`ClientSpec.fetch` is `typeof globalThis.fetch` — inject a Vitest `vi.fn()` returning a pre-built `Response`:

```typescript
// tests/unit/send.test.ts
import { describe, it, expect, vi } from "vitest";
import { performSend } from "../../src/send.js";
import { Request } from "../../src/request.js";

function makeMockFetch(response: Response) {
  return vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(
    async () => response
  );
}

const baseClient = {
  baseUrl: "https://example.com/",
};

it("returns unhandledStatus for any HTTP response", async () => {
  const mockFetch = makeMockFetch(new Response("body", { status: 200 }));
  const req = Request.create({ method: "GET", path: ["items"], responses: {} });
  const result = await performSend(req, { ...baseClient, fetch: mockFetch });
  expect(result.kind).toBe("unhandledStatus");
  expect((result as { status: number }).status).toBe(200);
});
```

### Testing Abort/Deadline Deterministically

**Approach:** Use `AbortController` directly — no real `setTimeout` needed.

```typescript
it("returns aborted when signal pre-aborted", async () => {
  const ac = new AbortController();
  ac.abort();
  const req = Request.create({ method: "GET", path: [], responses: {} });
  const result = await performSend(req, { baseUrl: "https://example.com/", fetch: vi.fn() }, { signal: ac.signal });
  expect(result).toEqual({ kind: "transportError", error: { kind: "aborted" } });
  // Verify fetch was never called:
  expect(vi.fn()).not.toHaveBeenCalled(); // use the actual mock
});
```

**Testing deadline timeout:**

```typescript
it("returns timeout when deadline fires during fetch", async () => {
  // Mock fetch that never resolves
  const hangingFetch = vi.fn(() => new Promise<Response>(() => {}));
  const req = Request.create({ method: "GET", path: [], responses: {} });
  const result = await performSend(
    req,
    { baseUrl: "https://example.com/", fetch: hangingFetch, deadlineMs: 1 }
  );
  expect(result).toEqual({ kind: "transportError", error: { kind: "timeout" } });
});
```

**Caution with hanging promises:** Tests with `deadlineMs: 1` will wait 1ms. Acceptable for unit tests. Use `vi.useFakeTimers()` if you need deterministic control without real-time waiting.

### Testing Body Preview

```typescript
it("reads body preview bytes", async () => {
  const body = "Hello, world!";
  const mockFetch = makeMockFetch(new Response(body, { status: 200 }));
  const req = Request.create({ method: "GET", path: [], responses: {} });
  const result = await performSend(req, { baseUrl: "https://example.com/", fetch: mockFetch });
  expect(result.kind).toBe("unhandledStatus");
  const r = result as { preview: { text: string; bytesRead: number; truncated: boolean } };
  expect(r.preview.text).toBe(body);
  expect(r.preview.bytesRead).toBe(body.length);
  expect(r.preview.truncated).toBe(false);
});
```

### Key Test Cases to Cover

| Test | Req | Assert |
|------|-----|--------|
| Pre-aborted signal → no fetch call | SEND-02, SEND-06 | `result.kind === "transportError"`, `error.kind === "aborted"`, `fetch` not called |
| Deadline fires (1ms) during hanging fetch | SEND-06 | `result.kind === "transportError"`, `error.kind === "timeout"` |
| Caller abort during hanging fetch | SEND-06 | `result.kind === "transportError"`, `error.kind === "aborted"` |
| Network error (fetch throws) | SEND-02 | `result.kind === "transportError"`, `error.kind === "network"` |
| HTTP 200 response → unhandledStatus stub | SEND-02 | `result.kind === "unhandledStatus"`, `result.status === 200` |
| HTTP 404 response → unhandledStatus stub | SEND-02 | same pattern |
| `deadlineMs <= 0` → RangeError thrown | SEND-05 | `throws RangeError` |
| Request.consume() called twice → TypeError propagated | SEND-02 | second `performSend` with same request throws |
| Header merge case-insensitive | SEND-03 | fetch called with merged, lowercased headers |
| Request deadlineMs overrides client | SEND-05 | `deadlineMs: 1` on request overrides `deadlineMs: 5000` on client |
| Body preview truncation at N bytes | SEND-02 | `truncated: true` for body > N bytes |
| Body preview no truncation at exactly N | SEND-02 | `truncated: false` for body exactly N bytes |
| `null` body (204) → preview `{ text: "", bytesRead: 0 }` | SEND-02 | null body handled |
| `absoluteUrl` bypasses baseUrl | SEND-01 | fetch called with absoluteUrl |
| `baseUrl + path + query` assembly | SEND-01 | URL constructed correctly |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AbortSignal.timeout(n)` | `new AbortController()` + `setTimeout` + `finally { clearTimeout }` | N/A — `AbortSignal.timeout()` has always lacked clearTimer | Cannot use `AbortSignal.timeout()` — timer leaks |
| Node.js `node-fetch` polyfill | Native `fetch` | Node 18 (stable in 21+) | No adapter needed; one `send.ts` for all runtimes |
| `error instanceof DOMException` to check abort | `error.name === "TimeoutError"` / `"AbortError"` | Always | Name-based is cross-realm portable |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | In Node.js native fetch (undici), the fetch signal governs the body ReadableStream such that `reader.read()` rejects with signal.reason when the signal fires during body reading | AbortSignal edge cases, Pitfall classification | If wrong: deadline fires during body reading but `reader.read()` does not reject → body read hangs until stream closes. Would require additional signal check in read loop. |

All other critical claims were verified against the live Node v22.22.2 runtime in this session.

---

## Open Questions (RESOLVED)

1. **`mergeHeaders`/`mergeQuery` placement for circular import elimination**
   - What we know: Current `mergeHeaders`/`mergeQuery` live in `client.ts`, fully tested. `send.ts` must not import `client.ts`.
   - What's unclear: Whether the planner chooses (a) pass pre-resolved values from `createClient()` closure, (b) duplicate the 10-line implementations inline in `send.ts`, or (c) extract to `src/utils.ts`.
   - Recommendation: Option (a) — `createClient()` passes raw `ClientSpec` to `performSend`, and `performSend` receives `mergeHeaders`/`mergeQuery` as injected helpers, OR simply re-implements the 3-line merge inline (these are genuinely trivial). Option (c) introduces a new file that CONTEXT.md doesn't mention. Option (a) is the pattern the CONTEXT.md code_context note explicitly recommends.
   > RESOLVED: D-03 in CONTEXT.md locks Option (a) — `createClient()` passes the raw `ClientSpec` into `performSend`'s closure. No new file needed; no circular import.

2. **`Response` body availability for preview in Node environments**
   - What we know: Native fetch in Node 24+ returns a proper `Response` with `body: ReadableStream`.
   - What's unclear: Whether there are any edge cases in vitest's test environment (jsdom vs native Node) that affect `response.body`.
   - Recommendation: Tests run in `environment: "node"` (confirmed in `vitest.config.ts`) which uses Node's native fetch — `response.body` is a real ReadableStream.
   > RESOLVED: `vitest.config.ts` confirms `environment: "node"` for the unit project. Node's native fetch returns a real `ReadableStream` body — no jsdom edge cases apply.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v22.22.2 | — |
| `AbortSignal.any()` | SEND-06 | ✓ | Node 20.3+ | — |
| `DOMException` global | SEND-06 | ✓ | Web standard | — |
| `ReadableStream.getReader()` | Body preview | ✓ | Web standard | — |
| `TextDecoder` | Body preview text | ✓ | Web standard | — |
| `vitest` | Testing | ✓ | 4.1.5 | — |
| `typescript` | Type-checking | ✓ | 6.0.3 | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (exists; `tests/unit/**/*.test.ts` already in `unitInclude`) |
| Quick run command | `npx vitest run --project node tests/unit/send.test.ts` |
| Full suite command | `npx vitest run --project node` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEND-01 | `createClient()` returns `Client` with `.send()` | unit | `npx vitest run --project node tests/unit/client.test.ts` | ✅ (needs update) |
| SEND-01 | `absoluteUrl` bypasses `baseUrl` in URL construction | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-02 | `send()` returns `unhandledStatus` for HTTP response | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-02 | `send()` never throws (network error → structured result) | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-02 | Body preview populated in `unhandledStatus` | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-03 | Header merge case-insensitive, request wins | unit | `npx vitest run --project node tests/unit/client.test.ts` | ✅ (covered by existing mergeHeaders tests) |
| SEND-04 | `responses` not pre-merged (request map passed separately) | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-05 | Request `deadlineMs` overrides client | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-06 | Pre-aborted signal → immediate `aborted` result, no fetch | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-06 | Deadline fires → `timeout` (not `aborted`) | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-06 | Caller abort during request → `aborted` | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |
| SEND-06 | `clearTimeout` fires in `finally` even on error | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --project node tests/unit/send.test.ts`
- **Per wave merge:** `npx vitest run --project node`
- **Phase gate:** `npm run verify` (typecheck + lint + full test suite) green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/send.test.ts` — covers SEND-02, SEND-05, SEND-06 (new file; does not exist)
- [ ] `tests/unit/client.test.ts` — needs update for SEND-01: `createClient()` return type is now `Client` with `.send()` method

*(All other test infrastructure exists and covers Phase 3 adequately.)*

---

## Project Constraints (from copilot-instructions.md)

| Directive | Source | Impact on Phase 3 |
|-----------|--------|------------------|
| `.js` extensions required on all relative imports | copilot-instructions.md | All imports in `send.ts` and updated `client.ts` must use `.js` |
| `verbatimModuleSyntax` active — `import type` for type-only | tsconfig.json | Separate value imports from type imports |
| `exactOptionalPropertyTypes` — no `{ field: undefined }` | tsconfig.json | Conditional fetch init object assembly |
| `noUncheckedIndexedAccess` — no bare array indexing | tsconfig.json | Use `for...of` for chunk assembly |
| No `console` logging in library code | copilot-instructions.md | `send.ts` must have zero `console.*` calls |
| Named exports only (no `export default`) | copilot-instructions.md | `export async function performSend...`, `export interface Client...` |
| Structured values, no thrown exceptions for HTTP outcomes | SPEC.md, STATE.md | `performSend` must never throw for HTTP/transport outcomes |
| `docs/SPEC.md` is sole behavioral source of truth | STATE.md | Any behavior question → check SPEC.md first |
| Zero runtime dependencies | STATE.md | No new npm packages |
| ESM-only, no CJS | REQUIREMENTS.md | `.js` extensions, no `require()` |

---

## Sources

### Primary (HIGH confidence)

- **Runtime tests** (`node -e "..."` against Node v22.22.2) — DOMException behavior, AbortSignal.any, URL construction, TextDecoder, body preview streaming, truncation detection
- `docs/SPEC.md` — behavioral source of truth for all transport semantics
- `.planning/phases/03-transport-send/03-CONTEXT.md` — all implementation decisions (D-01 through D-22)
- `src/types.ts` — actual type definitions as implemented in Phase 2
- `src/request.ts` — Request class, buildPath, buildQuery
- `src/client.ts` — mergeHeaders, mergeQuery, createClient
- `tsconfig.json` — confirmed strict flags
- `vitest.config.ts` — test infrastructure (projects, include patterns)
- `tests/unit/client.test.ts`, `tests/unit/request.test.ts` — existing test patterns

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — SEND-01 through SEND-06 requirement definitions
- `.planning/ROADMAP.md` — Phase 3 goal, plans, pitfall warnings
- `copilot-instructions.md` — project conventions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Web standard globals, verified in Node 22 runtime
- Architecture: HIGH — locked decisions from CONTEXT.md, verified against live code
- Pitfalls: HIGH — critical ones verified with runtime tests; A1 assumption flagged
- Test strategy: HIGH — follows established project patterns from Phase 2 tests

**Research date:** 2026-05-05
**Valid until:** Stable (Web standard APIs; no fast-moving dependencies)
