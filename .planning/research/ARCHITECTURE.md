# Architecture Patterns

**Project:** oneway-http — cross-runtime TypeScript HTTP client
**Researched:** 2026-04-27
**Confidence:** HIGH (based on spec + existing codebase analysis)

---

## Recommended Architecture

### Guiding Principle

All HTTP client logic lives in runtime-neutral shared source modules. The three public
entrypoints (`src/index.ts`, `src/browser.ts`, `src/node.ts`) remain thin re-export
wrappers — exactly as they are today, but re-exporting real symbols instead of a
placeholder surface. Runtime selection continues to be expressed entirely through
`package.json` conditional exports and `tsup.config.ts` platform targets.

No runtime detection (`typeof window`, `globalThis`, `process`) belongs in any module
under `src/`. The Fetch API (`fetch`, `Request`, `Response`, `Headers`, `AbortController`,
`AbortSignal`) is standard in Node 18 + and all target browsers; there is no meaningful
transport divergence to isolate at this time.

---

## Component Map

```
Consumer
  │
  ▼ (package exports resolve via package.json)
src/index.ts | src/browser.ts | src/node.ts       ← thin re-export wrappers
  │
  ▼ (all import from shared modules)
┌─────────────────────────────────────────────────────────────────┐
│                     Shared source modules                       │
│                                                                 │
│  src/types.ts         Pure type declarations                    │
│  src/body.ts          Body.* factory namespace                  │
│  src/decode.ts        Decode.* factory namespace                │
│  src/request.ts       Request.create() + URL construction       │
│  src/merge.ts         ClientSpec + RequestSpec merge logic      │
│  src/retry.ts         RetryPolicy types + retry orchestration   │
│  src/transport.ts     fetch wrapper + TransportError mapping    │
│  src/send.ts          createClient() + client.send()            │
│  src/send-match.ts    Send.match() exhaustive helper            │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼ (optional, additive)
src/zod-adapter.ts      Zod schema → Decode.json(schema) bridge

  (unchanged)
src/shared.ts           RuntimeTarget, legacy placeholder surface (to be retired)
```

---

## Component Responsibilities

| Component | Responsibility | Runtime-specific? |
|-----------|---------------|:-----------------:|
| `src/types.ts` | All TypeScript types from the spec: `RequestSpec`, `ClientSpec`, `SendResult`, `TransportError`, `DecodeError`, `BodyPreview`, `StatusMatcher`, `ResponseMap`, `RetryPolicy`, `Method`, `QueryValue`, `DecodeIssue` | No |
| `src/body.ts` | `Body` namespace: `none()`, `json(v)`, `text(v, ct?)`, `formUrlEncoded(entries)`, `bytes(b, ct?)`. Eagerly serializes to `Uint8Array` + content-type string. | No |
| `src/decode.ts` | `Decode` namespace: `none()`, `discard()`, `text()`, `json()`, `json(schema)`, `bytes()`, `optional(inner)`. Each decoder is a value with a `.as(tag)` method. | No |
| `src/request.ts` | `Request.create(spec)` factory. Validates mutual exclusion of `path`/`absoluteUrl`. Tracks affine-consumption state on the returned object. Builds final URL from path segments. | No |
| `src/merge.ts` | `mergeSpecs(client, request)` pure function implementing the merge table from the spec: headers/query merge, scalar scalars override, complex objects replace. | No |
| `src/retry.ts` | `defaultRetryPolicy` constant. `shouldRetry(result, policy, method)` predicate. `computeBackoffMs(attempt, policy)` pure function (bounded exponential with jitter). | No |
| `src/transport.ts` | Single `attemptFetch(url, init, signal)` function. Calls `fetch()`, catches network throws, maps `AbortError` to `aborted`/`timeout`, maps other throws to `network`. Returns `Response` or `TransportError`. | No† |
| `src/send.ts` | `createClient(spec)` factory. `client.send(request, options?)` orchestrator: merge → URL → body → deadline/abort composition → retry loop → status match → decode → `SendResult`. | No |
| `src/send-match.ts` | `Send.match(result, handlers)` typed exhaustive helper. Pure TypeScript. | No |
| `src/zod-adapter.ts` | Wraps a Zod schema into a decoder adapter, normalizing Zod errors into `DecodeError.schemaMismatch`. Zod remains an optional dev/peer dependency. | No |
| `src/index.ts` | Re-exports all public symbols. Neutral build target. | No |
| `src/browser.ts` | Re-exports all public symbols. Browser build target. | Browser build |
| `src/node.ts` | Re-exports all public symbols. Node build target. | Node build |

† `src/transport.ts` uses standard Fetch API — available in Node 18 + and all target
browsers. The `platform` field in `tsup.config.ts` controls bundler behavior, not
source-level branching.

---

## Data Flow

### Happy path: request → decoded response

```
1.  Consumer calls Request.create(spec)
      → affine HttpRequest object created, _consumed = false

2.  Consumer calls client.send(request, { signal? })
      → check _consumed; throw synchronous Error if already consumed
      → set _consumed = true
      → mergeSpecs(clientSpec, requestSpec) → merged spec
      → buildUrl(merged) → URL string
      → materializeBody(merged.body) → BodyInit | undefined

3.  Deadline + abort composition
      → if deadlineMs: create AbortSignal.timeout(deadlineMs)
      → if caller signal: compose with AbortSignal.any([caller, deadline])
      → track which signal fires to distinguish "aborted" vs "timeout"

4.  Retry loop
      → for each attempt:
          a. call attemptFetch(url, init, composedSignal)
          b. if TransportError returned:
               - aborted/timeout → return immediately (not retried)
               - network → check shouldRetry(error, policy, method)
                 if retryable: computeBackoffMs → delay → next attempt
                 else: return { kind: "transportError", error }
          c. if Response returned:
               - findDecoder(response.status, merged) → Decoder | "unhandled"
               - if "unhandled": read BodyPreview → return { kind: "unhandledStatus", ... }
               - if retryableStatus (502/503/504) AND policy allows:
                   read BodyPreview for logging (optional) → retry
               - else: run decoder(response) → DecodeResult
                 success → return { kind: "response", response: decoded }
                 failure → return { kind: "decodeError", ... }
```

### Response matching precedence (findDecoder)

```
status: number, merged: MergedSpec
  1. merged.request.responses[status]        exact, request layer
  2. merged.request.responses[classOf(status)]   class, request layer
  3. merged.client.responses[status]         exact, client layer
  4. merged.client.responses[classOf(status)]    class, client layer
  5. "unhandled"
```

`classOf(status)` returns `"1xx"` through `"5xx"` based on `Math.floor(status / 100)`.

### BodyPreview read path

```
response.body (ReadableStream)
  → getReader()
  → read chunks until bytesRead >= N or stream done
  → cancel reader
  → TextDecoder("utf-8", { fatal: false }).decode(accumulated)
  → { text, bytesRead, truncated: !streamDone }
```

N defaults to `clientSpec.diagnostics?.bodyPreviewBytes ?? 8192`.

---

## Browser / Node Isolation

**Short answer:** there is none needed at the source level for v1.

The Fetch API is standard in both environments. All `fetch`, `Response`, `Headers`,
`AbortController`, `AbortSignal.timeout()`, and `AbortSignal.any()` are available in
Node 18 + and in every browser targeted by the existing Playwright parity matrix.

The browser/node split is preserved at the **packaging and build level**:

| Layer | Where the split lives | Purpose |
|-------|-----------------------|---------|
| `package.json` exports | `"browser"` and `"node"` conditions | Routes bundlers/runtimes to correct artifact |
| `tsup.config.ts` | `platform: "browser"` / `platform: "node"` | Lets tsup/rollup apply platform optimizations and tree-shake dead code |
| `src/browser.ts` / `src/node.ts` | Thin re-export wrappers | Forward-compatibility: Node-specific options (custom TLS, unix agents) can be added to `src/node.ts` exports without touching browser surface |

Nothing in `src/` other than the three entrypoints should import from a different
entrypoint. Shared modules import only from each other.

---

## Affine Request Enforcement

The spec requires that a `Request` consumed by `send()` cannot be sent again.

**Implementation:** `Request.create()` returns an object with a mutable `_consumed`
boolean (unexported, not part of the public type). `client.send()` reads and
atomically sets this flag before doing any async work.

```typescript
// Pseudocode
export function createClient(clientSpec: ClientSpec): Client {
  return {
    async send<R>(request: HttpRequest<R>, options?: SendOptions): Promise<SendResult<R>> {
      if (request._consumed) {
        throw new Error(
          "oneway-http: this Request has already been sent. " +
          "Call your request factory function to create a fresh Request."
        );
      }
      request._consumed = true;
      // ... rest of send
    }
  };
}
```

This is a synchronous throw — a programming error, not a `SendResult` variant —
because double-send is a caller bug, not a recoverable runtime condition.

---

## Decoder Shape

Each `Decode.*` factory returns a `Decoder<T>` value:

```typescript
interface Decoder<T> {
  readonly _tag: string;           // used by Send.match() handler lookup
  decode(response: Response): Promise<DecodeResult<T>>;
  as<Tag extends string>(tag: Tag): TaggedDecoder<Tag, T>;
}

type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DecodeError };

interface TaggedDecoder<Tag extends string, T> extends Decoder<T> {
  readonly _tag: Tag;
}
```

`Decode.json(schema?)` runs `response.json()` first, then optionally validates with
the schema adapter. Schema errors are normalized to `DecodeError` — the Zod type never
leaks into `SendResult`.

`Decode.discard()` cancels the response body stream (calls `response.body?.cancel()`)
rather than draining it, avoiding unnecessary data transfer.

---

## Send.match() Typing Pattern

`Send.match()` maps each `SendResult` variant to a handler. Response variants are
matched by the decoder's `_tag` string. Failure variants use fixed keys.

```typescript
type Matcher<Result extends SendResult<any>, Out> = {
  [K in ResponseTags<Result>]: (payload: ResponsePayload<Result, K>) => Out;
} & {
  transportError: (error: TransportError) => Out;
  decodeError: (payload: DecodeErrorPayload) => Out;
  unhandledStatus: (payload: UnhandledStatusPayload) => Out;
};

function match<R extends SendResult<any>, Out>(
  result: R,
  handlers: Matcher<R, Out>,
): Out { ... }
```

TypeScript exhaustiveness is enforced through the `satisfies Matcher<...>` constraint
in user code (as shown in the spec example). The helper itself uses a runtime
`switch`/lookup rather than type narrowing at the call site.

---

## Build-Order Implications and Dependency Sequencing

### Source-level dependency order (no circular imports)

```
Layer 0 (no local deps):
  src/types.ts

Layer 1 (depends on types only):
  src/body.ts         ← src/types.ts
  src/decode.ts       ← src/types.ts
  src/merge.ts        ← src/types.ts
  src/retry.ts        ← src/types.ts
  src/send-match.ts   ← src/types.ts

Layer 2 (depends on layer 0–1):
  src/request.ts      ← src/types.ts, src/body.ts
  src/transport.ts    ← src/types.ts

Layer 3 (depends on all below):
  src/send.ts         ← src/types.ts, src/body.ts, src/decode.ts,
                         src/request.ts, src/merge.ts, src/retry.ts,
                         src/transport.ts

Layer 4 (optional):
  src/zod-adapter.ts  ← src/types.ts, src/decode.ts

Layer 5 (public entrypoints):
  src/index.ts        ← src/send.ts, src/send-match.ts, src/body.ts,
                         src/decode.ts, src/request.ts, src/types.ts
  src/browser.ts      ← (same as above)
  src/node.ts         ← (same as above)
```

### Build execution order (tsup)

tsup processes all three entrypoints in sequence (root first, then browser, then node)
as defined in the `defineConfig([...])` array. Each is independent; tsup bundles each
entry fully including its shared dependencies. No special ordering is needed between
the three builds beyond the current `clean: true` on the first and `clean: false` on
the subsequent two.

Zod is **not** a runtime dependency in `package.json`. The zod adapter lives in
`src/zod-adapter.ts` and is only imported by consumers who call `Decode.json(zodSchema)`.
Since tsup bundles with `treeshake: true`, consumers who never use a Zod schema pay
no bundle cost for Zod.

### Test execution order

The existing `pretest → build → test` chain is correct and must be preserved.
New unit tests for shared modules can run in the Node vitest project without a real
HTTP server. Behavior integration tests that need a real HTTP endpoint should use
Node's `node:http` `createServer` in a `beforeAll` hook — no new infrastructure
is required.

---

## Patterns to Follow

### Pattern: Decoder as a value with `.as(tag)`

Decoder objects carry their tag with them. The tag becomes the key in `Send.match()`
handler objects and in `SendResult` response variants. This is how the response map
in `RequestSpec.responses` produces a typed discriminated union at the call site.

```typescript
// In request spec
responses: {
  200: Decode.json(GhRepoList).as("repoList"),   // tag = "repoList"
  304: Decode.none().as("notModified"),           // tag = "notModified"
}

// SendResult<R> where R = { tag: "repoList"; body: GhRepoList }
//                         | { tag: "notModified" }
```

### Pattern: Eager body materialization for replay

`Body.*` factories serialize their input immediately (at `Request.create` time, not
at `send` time). The serialized `Uint8Array` is stored on the body value. This makes
bodies replayable across retry attempts without needing to re-serialize, and without
ever dealing with `ReadableStream` positioning issues.

### Pattern: Merge before act

`mergeSpecs` is called once at the start of `client.send()` and produces a single
`MergedSpec` that flows through URL building, body materialization, retry orchestration,
and response matching. Nothing downstream reads from `clientSpec` or `requestSpec`
directly.

### Pattern: Compose abort signals rather than branch on them

Use `AbortSignal.any([callerSignal, deadlineSignal])` to produce a single composed
signal passed to `fetch()`. To distinguish which signal fired, attach `"abort"` event
listeners to each individual signal before calling `fetch()`, storing the cause.

---

## Anti-Patterns to Avoid

### Anti-Pattern: Runtime detection inside shared modules

**What happens:** `if (typeof window !== "undefined")` or similar checks appear in
`src/send.ts` or `src/transport.ts`.
**Why bad:** The package already models this split via exports and build targets.
Runtime checks add fragile branching, break tree-shaking, and contradict the
architectural invariant.
**Instead:** Keep all shared modules runtime-neutral. If a genuine platform difference
emerges, add an overload to `src/browser.ts` or `src/node.ts` and a separate
implementation file, not an inline branch.

### Anti-Pattern: Leaking Zod types into SendResult

**What happens:** `DecodeError` carries a `ZodError` in a typed field.
**Why bad:** Locks the public API to Zod. The spec explicitly says the decode contract
must allow swapping Zod for Valibot without changing the library surface.
**Instead:** The Zod adapter catches all `ZodError`s and maps them to
`{ kind: "schemaMismatch", issues: DecodeIssue[] }` before they reach `SendResult`.

### Anti-Pattern: HTTP status treated as a transport exception

**What happens:** `send()` rejects its promise for 4xx/5xx responses.
**Why bad:** Core design violation. Any response with an HTTP status code is a valid
HTTP response and must flow through response matching, not the catch path.
**Instead:** `fetch()` rejects only on network failure. Any resolved `Response` object
(regardless of status) enters the status-matching path.

### Anti-Pattern: Consuming the response body in transport.ts

**What happens:** `src/transport.ts` calls `response.json()` or `response.text()`.
**Why bad:** Response bodies are single-use streams. Consuming in transport leaves
nothing for decode. Preview and decode are distinct consumers.
**Instead:** `src/transport.ts` returns the raw `Response` object. `src/send.ts`
passes it to the decoder or preview reader exactly once.

### Anti-Pattern: Adding feature tests outside the parity harness

**What happens:** Tests for `Request.create()` or `client.send()` are written in a
Node-only file.
**Why bad:** The core architectural promise is runtime parity. Export-surface and
behavioral regressions in browser builds will go undetected.
**Instead:** Export-surface assertions for all new public symbols belong in
`tests/parity/entrypoint-cases.ts`. Behavior tests that are Node-only by necessity
(e.g., HTTP server setup) live in a clearly named `tests/behavior/` directory and
are scoped to the Node vitest project. Cross-runtime behavior cases use the parity
project matrix.

---

## Compatibility with Existing Structure

| Existing artifact | Impact of new implementation |
|-------------------|------------------------------|
| `package.json` exports | **No change.** The three export paths and conditional conditions remain identical. |
| `tsup.config.ts` | **No change.** The three-entry build matrix, `platform` settings, and `sharedOptions` remain. If Zod becomes an optional peer dep, add `external: ["zod"]` to sharedOptions. |
| `tsconfig.json` | **No change.** Path aliases for the three package entrypoints remain. |
| `vitest.config.ts` | **No change** to project matrix. New test directories may be added as additional `include` patterns inside the Node project config. |
| `src/shared.ts` | **Retire placeholder exports; keep `RuntimeTarget`.** `PlaceholderDescription`, `OnewayHttpSurface`, and `createPlaceholderSurface` are removed as placeholder scaffolding is replaced. `RuntimeTarget` remains useful as a type. |
| `src/index.ts` / `src/browser.ts` / `src/node.ts` | **Widen re-exports.** Replace placeholder surface wiring with named re-exports of all public symbols from the new shared modules. |
| `tests/parity/placeholder-assertions.ts` | **Replace.** Placeholder assertions are removed. New parity assertions verify that `createClient`, `Request`, `Body`, `Decode`, and `Send` are exported from all three entrypoints with correct types. |
| `tests/parity/entrypoint-cases.ts` | **Replace cases.** New cases assert real API surface instead of placeholder surface. |
| `dist/` | **Regenerated.** No manual changes. |

---

## Scalability Considerations

This is a library, not a service. "Scaling" means the API surface stays stable and
the implementation stays correct under increased usage.

| Concern | Approach |
|---------|----------|
| Schema library swap (Zod → Valibot) | `DecodeError` is already normalized; swap the adapter in `src/zod-adapter.ts` only |
| Adding Node-specific transport options (TLS, agent) | Add to `src/node.ts` exports only; shared modules unaffected |
| Supporting streaming request bodies (post-v1) | New `Body.stream()` factory in `src/body.ts`; only `src/transport.ts` needs to handle the new body kind |
| Adding caching/ETag helpers | New `src/etag.ts` helper; purely additive, no changes to core pipeline |
| Retry policy extensibility | `RetryPolicy` type can grow new optional fields without breaking existing callers |

---

## Sources

- `docs/SPEC.md` — authoritative behavioral specification (HIGH confidence)
- `.planning/codebase/ARCHITECTURE.md` — existing structural invariants (HIGH confidence)
- `.planning/codebase/STRUCTURE.md` — file placement conventions (HIGH confidence)
- `.planning/codebase/CONVENTIONS.md` — naming and style rules (HIGH confidence)
- `package.json`, `tsup.config.ts` — build and export contracts (HIGH confidence)
- WHATWG Fetch Standard — `fetch`, `AbortSignal.any`, `AbortSignal.timeout` (HIGH confidence, standard in Node 18 + and all target browsers)

---

*Architecture analysis: 2026-04-27*
