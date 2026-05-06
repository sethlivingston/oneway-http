# ROADMAP: oneway-http

**Project:** `@sethlivingston/oneway-http`
**Milestone:** v1 — Full SPEC.md implementation
**Granularity:** Standard (8 phases, 3–5 plans per phase)
**Coverage:** 53/53 v1 requirements mapped ✓
**Created:** 2026-05-04

---

## Phases

- [ ] **Phase 1: Infrastructure Fixes** — Correct tsconfig, Vitest source aliases, neutral entrypoint runtime detection
- [ ] **Phase 2: Core Types + Request Model** — All shared types, `Request` class, `createClient()`, merge rules
- [x] **Phase 3: Transport + Send** — Single-attempt `send()`, `AbortSignal` composition, transport error classification
- [ ] **Phase 4: Body Producers + Decoders** — All `Body.*` producers and `Decode.*` decoders, body normalization, `BodyPreview`
- [ ] **Phase 5: Response Matching + Decode Dispatch** — 4-step precedence algorithm, decode dispatch, wires happy path end-to-end
- [ ] **Phase 6: Abort, Deadline & Retry** — Retry loop, whole-operation deadline, abort-aware backoff sleep, jitter cap
- [ ] **Phase 7: Typed Matcher** — `Send.match()`, `Send.Matcher<R,T>` mapped type, exhaustiveness enforcement
- [ ] **Phase 8: Documentation & Polish** — TSDoc, README examples, Zod peer dep declaration

---

## Phase Details

### Phase 1: Infrastructure Fixes

**Goal:** The build and test environment works correctly — TypeScript type-checks against `module: Preserve`, Vitest resolves imports from `src/` without a prior build, and the neutral entrypoint detects the runtime at runtime rather than hardcoding it.

**Depends on:** Nothing (first phase — unblocks all subsequent phases)

**Requirements:** INFRA-01, INFRA-02, INFRA-03

**Plans:**
1. **`tsconfig.json` migration** — Remove `baseUrl: "."` and `ignoreDeprecations: "6.0"`; change `module: "NodeNext"` → `module: "Preserve"`; change `moduleResolution: "NodeNext"` → `moduleResolution: "Bundler"`; verify all paths entries remain valid (they are already relative `./src/...` — no fixup needed).
2. **Vitest source aliases** — Add `resolve.alias` to `vitest.config.ts` mapping all three package export paths to their `src/` counterparts (`@sethlivingston/oneway-http` → `./src/index.ts`, `/browser` → `./src/browser.ts`, `/node` → `./src/node.ts`); remove the `pretest` build dependency from the dev iteration loop.
3. **Neutral entrypoint runtime detection** — Fix `src/index.ts` line 7: replace hardcoded `runtimeTarget: "browser"` with a runtime check (e.g., `typeof window !== "undefined" ? "browser" : "node"`); run parity tests to confirm `node` target sees the correct value in Node.js.

**Success Criteria** (what must be TRUE):
1. `tsc --noEmit` passes with zero errors after tsconfig migration; no `ignoreDeprecations` workaround remains.
2. `npx vitest run` (without a prior `npm run build`) resolves all imports from `src/` and passes all existing parity tests.
3. The neutral entrypoint exports `runtimeTarget: "node"` when imported in Node.js and `runtimeTarget: "browser"` when imported in a browser context.
4. The existing parity test suite (Node + Chromium + Firefox + WebKit) passes with no regressions.

**Implementation Notes:**
- `module: NodeNext` is **NOT deprecated** in TypeScript 6. The sole reason for `ignoreDeprecations` was `baseUrl` being deprecated. The migration to `Preserve`+`Bundler` is the canonical pairing for tsup/esbuild projects — it aligns TypeScript's module resolution model with how esbuild actually resolves modules.
- After the alias fix, `npx vitest run` and `npm test` both work; `npm test` still runs the full build first (needed for dist-level parity assertions).
- The `.js` extension requirement on relative imports (`import "./url.js"` in `.ts` files) must be enforced by the existing `import-x/extensions` ESLint rule. Verify the rule is active post-migration.

**Pitfall Warnings:**
- ⚠️ **P12 — `.js` extension enforcement**: With `moduleResolution: Bundler`, TypeScript becomes more permissive about extensions. Verify `eslint-plugin-import-x` is configured to require `.js` on all relative imports, or runtime `ERR_MODULE_NOT_FOUND` will appear in production dist.
- ⚠️ **P13 — Vitest stale dist**: Without aliases, any `npx vitest run` that bypasses `pretest` silently tests stale built code. The alias fix is the complete solution.

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Migrate tsconfig.json to Preserve + Bundler; confirm ESLint .js extension enforcement
- [ ] 01-02-PLAN.md — Add Vitest resolve.alias for src/ resolution; remove pretest scripts; update verify script
- [ ] 01-03-PLAN.md — Replace hardcoded runtimeTarget: "browser" with globalThis.document runtime detection

---

### Phase 2: Core Types + Request Model

**Goal:** The type foundation (`types.ts`) and the `Request` class exist and are correct — every subsequent module can import from `types.ts`; `Request.create()` produces a valid spec value; affine enforcement prevents re-use; header/query merge rules handle `undefined` correctly.

**Depends on:** Phase 1 (correct TypeScript environment required before writing `strictPropertyTypes`-sensitive code)

**Requirements:** TYPES-01, TYPES-02, TYPES-03, TYPES-04, TYPES-05, TYPES-06, TYPES-07, TYPES-08, REQ-01, REQ-02, REQ-03, REQ-04

**Plans:**
1. **`src/types.ts` — all shared type definitions** — Define `SendResult<R>` (4-variant discriminated union), `TransportError` (aborted|timeout|network), `DecodeError` (6-variant union), `DecodeIssue`, `BodyPreview`, `ResponseMap`, `StatusMatcher`, `Schema<T>` duck-type interface, `RequestSpec`, `ClientSpec`, `Method`, `QueryValue`, `RetryPolicy`, `TaggedEntry`. Zero logic, zero imports.
2. **`src/request.ts` — `Request` class + path/query building** — Private `#consumed = false` and `#spec` fields; `Request.create()` static factory; `consume()` method (sets `#consumed`, throws if already consumed); path segment encoding (encode each segment separately, join with `/`, resolve against `baseUrl`); query building (plain object, `undefined` omits, arrays repeat, numbers/booleans stringified).
3. **`src/client.ts` — `createClient()` + merge rules** — `mergeHeaders()` with explicit `undefined`-filter and case-insensitive key normalization (`.toLowerCase()`); `mergeQuery()` with `undefined`-omit semantics; `createClient()` storing `ClientSpec` with all six defaults (`baseUrl`, `headers`, `query`, `responses`, `retry`, `deadlineMs`, `diagnostics`).

**Success Criteria** (what must be TRUE):
1. `Request.create({ method: "GET", path: ["users", userId] })` produces a `RequestSpec` with correctly encoded path segments and `undefined` query keys omitted.
2. Calling `send(request, client)` twice on the same `Request` instance throws a runtime error on the second call with a message that names the consumed request.
3. `mergeHeaders({ "Content-Type": "application/json" }, { "content-type": undefined })` returns `{ "content-type": "application/json" }` — `undefined` does not wipe the inherited value.
4. `tsc --noEmit` passes; `types.ts` has zero imports.

**Implementation Notes:**
- `types.ts` is the **dependency root** — it must import nothing. All other modules import from it.
- `Schema<T>` is a structural duck-type interface that matches Zod's `safeParse` shape. No Zod import in `types.ts` or anywhere in library runtime code.
- `declare readonly _phantom: T` on `TaggedEntry` — use `declare` (not a value field) to be compatible with `exactOptionalPropertyTypes`.
- Affine enforcement: private class field `#consumed = false`; `consume()` sets it; `send()` is the only caller of `consume()`.

**Pitfall Warnings:**
- ⚠️ **P9 — `exactOptionalPropertyTypes` header spread**: Never merge layers with `{ ...base, ...override }`. Spreading `{ accept: undefined }` silently sets `accept: undefined` in the result. Use the explicit `undefined`-filtering loop in `mergeHeaders()`.
- ⚠️ **Affine bypass**: Use JS private fields (`#consumed`), not `Symbol.for()` or WeakMap — `Symbol.for()` is globally accessible and defeats the affine protection.

**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md — Extend vitest.config.ts for unit test discovery; create Wave 0 test stubs; implement src/types.ts (all 15 shared types, zero imports)
- [ ] 02-02-PLAN.md — Replace request.test.ts stubs with real assertions; implement src/request.ts (Request class, buildPath, buildQuery)
- [ ] 02-03-PLAN.md — Replace client.test.ts stubs with real assertions; implement src/client.ts (createClient, mergeHeaders, mergeQuery)

---

### Phase 3: Transport + Send

**Goal:** `send()` executes a single HTTP request against a client, returns a `SendResult<R>` promise that never throws, correctly classifies all transport errors, and composes the caller's abort signal with the deadline signal using `AbortSignal.any()`.

**Depends on:** Phase 2 (requires `RequestSpec`, `ClientSpec`, `TransportError`, `SendResult` types)

**Requirements:** SEND-01, SEND-02, SEND-03, SEND-04, SEND-05, SEND-06

**Plans:**
1. **`src/send.ts` — single-attempt `send()` skeleton** — Accept `(request: Request<R>, client: Client, options?: { signal?: AbortSignal })`; call `request.consume()`; build the full request URL (baseUrl + path + query); apply merged headers; call `fetch(url, { method, headers, body, signal: combinedSignal })`; return `Promise<SendResult<R>>`.
2. **Deadline controller + `AbortSignal.any()` composition** — Create `deadlineController = new AbortController()`; schedule `setTimeout(() => deadlineController.abort(new DOMException("Deadline exceeded", "TimeoutError")), deadlineMs)` with `clearTimeout` in a `finally` block; compose with `AbortSignal.any([callerSignal, deadlineController.signal])` to produce `combinedSignal`.
3. **Transport error classification** — Wrap the `fetch()` call in `try/catch`; classify by `error.name`: `"TimeoutError"` → `{ kind: "transportError", error: { kind: "timeout" } }`; `"AbortError"` → `{ kind: "transportError", error: { kind: "aborted" } }`; anything else → `{ kind: "transportError", error: { kind: "network", cause: error } }`. Apply identical classification in body-reading catch blocks.

**Success Criteria** (what must be TRUE):
1. `send()` returns `{ kind: "transportError", error: { kind: "timeout" } }` when `deadlineMs` expires — not `{ kind: "aborted" }`.
2. `send()` returns `{ kind: "transportError", error: { kind: "aborted" } }` when the caller's `AbortController` fires.
3. `send()` never throws — all outcomes are returned as `SendResult` values including network failures.
4. The deadline `AbortController`'s `clearTimeout` fires in the `finally` block whether the request succeeds, fails, or is aborted.

**Implementation Notes:**
- **No platform-specific transport adapter needed** — Node 24 native `fetch` (undici 6.24.x) is spec-identical to browser `fetch`. Write one `send.ts` used by all three entrypoints.
- `AbortSignal.any()` is available with no polyfill (Node 20.3+; project pins Node 24).
- **Do NOT use `AbortSignal.timeout()` for the deadline** — it creates an internal timer you cannot `clearTimeout()`, risking timer leaks.
- **Highest-risk classification**: deadline must use `DOMException("...", "TimeoutError")`. If this is wrong, every deadline expiry misclassifies as `aborted` — permanently and silently. Verify with a targeted test before moving on.
- In this phase, response matching and decoding are stubs (return `unhandledStatus` for all responses). Full dispatch wiring happens in Phase 5.

**Pitfall Warnings:**
- ⚠️ **P1 (CRITICAL) — AbortSignal reason classification**: `fetch()` throws `signal.reason` directly. Deadline controller MUST call `.abort(new DOMException("Deadline exceeded", "TimeoutError"))`. Classify by `error.name`, never by `error instanceof DOMException`.
- ⚠️ **P5 — `AbortSignal.timeout()` misuse**: Cannot clear the internal timer — always use `new AbortController()` + `setTimeout` + `finally { clearTimeout(...) }`.

**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — Test stub (Wave 0) + SendOptions + Client interface + createClient refactor + send.ts skeleton
- [x] 03-02-PLAN.md — Deadline controller + AbortSignal.any() composition + classifyTransportError
- [x] 03-03-PLAN.md — readBodyPreview() with peek-read truncation + TextDecoder + complete test suite

---

### Phase 4: Body Producers + Decoders

**Goal:** All `Body.*` producers and `Decode.*` decoders are implemented; `null` and empty-stream bodies both normalize to zero bytes before any decoder runs; `BodyPreview` reads up to N bytes with connection-safe cancellation and non-fatal UTF-8 decoding.

**Depends on:** Phase 3 (requires raw byte buffer produced by transport layer; `BodyPreview` is a body read)

**Requirements:** BODY-01, BODY-02, BODY-03, BODY-04, BODY-05, DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, PREV-01, PREV-02, PREV-03

**Plans:**
1. **`src/body.ts` — `Body.*` producer namespace** — `Body.none()`, `Body.json(value)` (JSON.stringify + UTF-8 + sets `content-type: application/json`), `Body.text(value, contentType?)` (UTF-8, defaults to `text/plain; charset=utf-8`), `Body.formUrlEncoded(entries)` (`URLSearchParams` for correct encoding, supports repeated keys), `Body.bytes(bytes, contentType?)` (raw binary). Opaque `Body` type — internals not exported.
2. **`src/decode.ts` — body normalization + `Decode.*` decoders** — Shared `normalizeBody(response)` → `Uint8Array` (handles `response.body === null` as 0-byte and 0-byte stream as 0-byte); implement `Decode.none()`, `Decode.text()`, `Decode.json()`, `Decode.bytes()`, `Decode.optional(inner)`. All decoders receive `Uint8Array`, never a raw `ReadableStream`.
3. **`Decode.discard()` + `Decode.json(schema)` + Schema adapter** — `Decode.discard()`: call `response.body?.cancel()` in a `finally` block (null-guard required for 204/304/205); `Decode.json(schema)`: run `schema.safeParse(parsed)`, normalize errors with `isZodError()` duck-type check (not `instanceof`), map to `DecodeIssue[]`. `Schema<T>` interface accepts any object with `.safeParse()`.
4. **`src/preview.ts` — `BodyPreview` implementation** — `getReader()` from `response.body`; collect chunks up to `bodyPreviewBytes` limit (default 8192); `finally { reader.cancel() }` (non-negotiable); decode with `new TextDecoder("utf-8", { fatal: false })`; return `{ text, bytesRead, truncated }`. Configurable via `client.diagnostics.bodyPreviewBytes`.

**Success Criteria** (what must be TRUE):
1. `Decode.none()` returns `decodeError.unexpectedBody` for both a `204` response (`body === null`) and a `200` response with `Content-Length: 0` (empty stream) when any bytes are present; passes for both when body is truly empty.
2. `Decode.discard()` on a `204` response does not throw; after `Decode.discard()` on any response, `response.bodyUsed` is `true` and no socket is leaked.
3. `Decode.json(zodSchema)` returns a properly typed decoded value on success and returns `{ kind: "schemaMismatch", issues: DecodeIssue[] }` on validation failure — even when the consumer has a different Zod version installed.
4. `BodyPreview` on a 50 KB response body with a 256-byte cap returns `{ truncated: true, bytesRead: 256 }` and does not buffer the full 50 KB.
5. `BodyPreview.text` does not throw when truncation falls mid-UTF-8 sequence; replacement characters (`\uFFFD`) at the boundary are acceptable.

**Implementation Notes:**
- **Both `null` body and 0-byte stream must normalize to `Uint8Array(0)` before any decoder runs.** This is the single shared preprocessing step — do not handle these cases per-decoder.
- `Decode.discard()` uses `response.body?.cancel()` (cancel, not drain). Cancel is the correct choice for explicit discard — drain wastes memory on large bodies.
- **`noUncheckedIndexedAccess` does not narrow after length checks.** Use `.at(i) ?? fallback` or `arr[i]!` with an explicit prior guard in all byte-indexing code.
- **Zod `instanceof` checks fail across module boundaries.** Duck-type on `.issues` array: `"issues" in e && Array.isArray(e.issues)`.
- Body preview reads from `response.body` ReadableStream directly — NOT via `Response.clone()`. Clone buffers the entire body regardless of the byte limit.

**Pitfall Warnings:**
- ⚠️ **P2 — `null` body vs empty stream**: `204/304/205` → `response.body === null`; `200 + Content-Length: 0` → non-null stream that reads 0 bytes. Both must normalize to zero bytes before decoders run. Test both explicitly.
- ⚠️ **P3 (CRITICAL) — Reader not cancelled = connection leak**: `finally { reader.cancel() }` is non-negotiable in `BodyPreview`. Abandoning a reader leaves the TCP socket open until GC. Confirmed to exhaust connection pools under load.
- ⚠️ **P4 — Discard: cancel not drain**: `response.body.cancel()` is correct. Draining a 50 MB error body to allow keep-alive reuse is the wrong trade-off for a library where discard is explicit.
- ⚠️ **P8 — `noUncheckedIndexedAccess` byte indexing**: `arr[0]` is `number | undefined` even after a length check. Use `.at(0) ?? 0` or `arr[0]!`.
- ⚠️ **P10 — TextDecoder fatal mode**: Use `{ fatal: false }` for preview. `{ fatal: true }` throws on any truncated multi-byte sequence, crashing the preview component.
- ⚠️ **P14 — Zod `instanceof` across boundaries**: Duck-type on `.issues`, never `instanceof ZodError`.

**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 04-01-PLAN.md — Wave 1: Test stubs (body + decode) + types.ts changes + src/body.ts

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 04-02-PLAN.md — Wave 2: src/decode.ts — all Decode.* decoders (parallel with 04-03)
- [ ] 04-03-PLAN.md — Wave 2: src/preview.ts extract + src/send.ts updates (parallel with 04-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 04-04-PLAN.md — Wave 3: src/index.ts exports + full suite verification gate

---

### Phase 5: Response Matching + Decode Dispatch + Body Preview Integration

**Goal:** `matchResponse()` correctly applies the 4-step precedence algorithm; `send()` dispatches to the matched decoder and returns the correct `SendResult` variant; `BodyPreview` is included in `decodeError` and `unhandledStatus` results; the full happy path (request → match → decode → typed result) works end-to-end.

**Depends on:** Phase 4 (decoders and `BodyPreview` must exist before dispatch can call them)

**Requirements:** RESP-01, RESP-02, RESP-03, RESP-04, PREV-01, PREV-02, PREV-03

**Plans:**
1. **`src/response-matching.ts` — `matchResponse()` pure function** — Accept `(status: number, requestMap: ResponseMap | undefined, clientMap: ResponseMap | undefined)`; implement 4-step lookup: (1) request exact, (2) request class (`"2xx"` etc.), (3) client exact, (4) client class; return matched `TaggedEntry` or `null` for `unhandledStatus`; `classOf(status)` helper (`Math.floor(status / 100) + "xx"`). Maps are **never pre-merged** — both passed separately.
2. **`send.ts` dispatch integration** — After `fetch()` resolves: call `matchResponse(response.status, requestResponses, clientResponses)`; on `null` → capture `BodyPreview`, return `{ kind: "unhandledStatus", status, headers, preview }`; on match → read body bytes via `normalizeBody()`, call `entry.decoder(bytes)`, on success return `{ kind: "response", response: decoded }`, on failure capture `BodyPreview` and return `{ kind: "decodeError", status, headers, error, preview }`.
3. **`ResponsesOf<M>` type machinery** — Generic inference chain: `ResponseMap` → `TaggedEntry<Tag, T>[]` → `ResponsesOf<M>` (extracts the union of `T` types from the map); thread `R` through `Request<R>` → `send()` return type `Promise<SendResult<R>>`; verify that adding a new entry to `responses` narrows the result union automatically.

**Success Criteria** (what must be TRUE):
1. A `200` response with a matching entry in `requestResponses` is decoded and returned as `{ kind: "response", response: <typed value> }` — request exact match wins over client class match.
2. A `502` response with no match in any map returns `{ kind: "unhandledStatus", status: 502, preview: { text: "...", bytesRead: N, truncated: false } }`.
3. A `200` response where the decoder throws (e.g., invalid JSON when `Decode.json()` is used) returns `{ kind: "decodeError", error: { kind: "invalidJson" }, preview: { ... } }` — not a thrown exception.
4. TypeScript produces a type error when a `Send.match()` handler is missing for a response tag that exists in the `ResponseMap`. (Validates `ResponsesOf<M>` threading before Phase 7.)
5. `matchResponse()` is a pure function — tested in isolation with no HTTP calls.

**Implementation Notes:**
- Response maps must **never be pre-merged** — the 4-step precedence requires both layers present independently. Passing a merged map collapses the layering and loses precedence.
- `BodyPreview` is captured **after** match failure or decode failure using the existing Phase 4 preview implementation. It is not captured on success.
- The `ResponsesOf<M>` type machinery is the foundation for `Send.Matcher<R,T>` in Phase 7 — get the inference chain right here.

**Pitfall Warnings:**
- ⚠️ **Pre-merge anti-pattern**: Never call `{ ...clientResponses, ...requestResponses }` before matching. Pass both maps to `matchResponse()` separately. Pre-merging destroys the 4-step precedence.
- ⚠️ **Eager decode anti-pattern**: Match status first (pure lookup), then decode body (stream read). Reading the body before confirming a match wastes I/O for unhandled statuses.

**Plans:** 3 plans

Plans:
**Wave 1**
- [ ] 05-01-PLAN.md — Type additions + exports (`DecoderLike` in `types.ts`, `readBytes` export, `previewFromBytes` in `preview.ts`)
- [ ] 05-02-PLAN.md — `src/response-matching.ts` + `tests/unit/response-matching.test.ts` (pure function, RESP-01/02)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 05-03-PLAN.md — `send.ts` dispatch integration + `send.test.ts` extensions (full end-to-end, all RESP/PREV requirements)

---

### Phase 6: Abort, Deadline & Retry

**Goal:** `send()` wraps the single-attempt loop in a retry engine with correct attempt counting, an abort-aware backoff sleep, and a capped jitter formula; the whole-operation deadline covers all attempts plus all backoff windows; retry never fires after deadline expiry or on non-retryable outcomes.

**Depends on:** Phase 5 (retry wraps the complete single-attempt dispatch loop including decode; deadline must cover body reading)

**Requirements:** ADR-01, ADR-02, ADR-03, ADR-04, ADR-05, ADR-06, ADR-07

**Plans:**
1. **`sleepWithAbort()` utility + `jitterDelay()` formula** — `sleepWithAbort(ms, signal)`: `new Promise((resolve, reject)` with `signal.aborted` early exit, `setTimeout(resolve, ms)`, and `signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason) }, { once: true })`; `jitterDelay(attempt, base, cap)`: `Math.floor(Math.random() * Math.min(cap, base * Math.pow(2, attempt)))` — cap applied **before** `Math.random()`.
2. **Retry loop in `send.ts`** — Replace single-attempt call with `for (let attempt = 0; attempt < maxAttempts; attempt++)` (0-based, strict `<`); on retryable failure: check `attempt < maxAttempts - 1 && shouldRetry(result)`; if yes, `await sleepWithAbort(jitterDelay(attempt, base, cap), combinedSignal)`; if signal aborts during sleep, classify and return immediately.
3. **Retry predicate + whole-operation deadline** — `shouldRetry()`: returns `false` for `decodeError`, `unhandledStatus`, `transportError.aborted`, `transportError.timeout`; returns `true` for `transportError.network` on retryable method and retryable status codes (502/503/504); deadline `AbortController` and `clearTimeout` scoped to the outer `send()` call — covers all attempts + all backoff sleeps + body reads.
4. **Default retry policy** — Apply to `GET`/`HEAD` methods: `maxAttempts: 3`, `baseBackoffMs: 200`, `maxBackoffMs: 30_000`, retryable statuses `[502, 503, 504]`; non-`GET`/`HEAD` methods have `maxAttempts: 1` (no retry) by default; per-request `retry` option overrides client default.

**Success Criteria** (what must be TRUE):
1. With `maxAttempts: 3`, a mock server receives **exactly 3** HTTP requests before `send()` resolves — no more, no less.
2. Aborting at 50 ms into a 500 ms backoff window causes `send()` to resolve in under 100 ms as `{ kind: "transportError", error: { kind: "aborted" } }` — not after the full 500 ms.
3. Backoff delay never exceeds `maxBackoffMs` (30 s default) across 10 consecutive attempts — verified by logging delay values.
4. After deadline expiry, `send()` returns `{ kind: "transportError", error: { kind: "timeout" } }` immediately — retry does not fire, and the next attempt does not start.
5. `send()` with a `decodeError` result never retries — the request resolves on the first attempt regardless of method.

**Implementation Notes:**
- **THREE independent retry bugs must be prevented simultaneously:**
  1. **Off-by-one**: condition MUST be `attempt < maxAttempts`, never `attempt <= maxAttempts`. With `maxAttempts: 3`, sends exactly 3 times.
  2. **Abort-unaware sleep**: naïve `setTimeout` does not respect `AbortSignal`. Use `sleepWithAbort()` which rejects immediately when the combined signal fires.
  3. **Jitter overflow**: apply `Math.min(cap, ...)` **before** `Math.random()` — never after. `base * 2^60 = 1.15e18`; `setTimeout(fn, 1.15e18)` effectively never fires.
- Deadline is **whole-operation** — one `AbortController` + `setTimeout` scoped to the outer `send()` call, not per-attempt.
- Write tests for all three pitfall scenarios before writing production code (test-first for this phase).

**Pitfall Warnings:**
- ⚠️ **P5 (CRITICAL) — Off-by-one**: `attempt <= maxAttempts` sends `maxAttempts + 1` requests. Use `attempt < maxAttempts`. Test with a request-counting mock server.
- ⚠️ **P6 (CRITICAL) — Abort during backoff**: Naïve `setTimeout`-based sleep ignores abort signals. With a 500 ms backoff and abort at 200 ms, the operation will wait the full 300 ms extra. Use `sleepWithAbort()`.
- ⚠️ **P7 (CRITICAL) — Jitter overflow**: `Math.min(cap, base * 2^attempt)` — cap before random. Without the cap, attempt 10 produces >100 s sleep; attempt 60 produces a timer that effectively never fires.
- ⚠️ **Deadline per-operation, not per-attempt**: If deadline is applied per-attempt, the total operation can take `maxAttempts × deadlineMs` — violating the spec.

**Plans:** TBD

---

### Phase 7: Typed Matcher

**Goal:** `Send.match(result, handlers)` exhaustively dispatches over `SendResult<R>` at runtime; `Send.Matcher<R,T>` enforces at compile time that every response tag plus the three fixed keys (`transportError`, `decodeError`, `unhandledStatus`) has a handler; adding a new response entry to `ResponseMap` immediately produces a type error at all `Send.match()` call sites with a missing handler.

**Depends on:** Phase 5 (requires `ResponsesOf<M>` and `TagsOf<R>` machinery to be correct)

**Requirements:** MATCH-01, MATCH-02, MATCH-03

**Plans:**
1. **`TagsOf<R>` type utility + `Send.Matcher<R,T>` mapped type** — `TagsOf<R>` extracts tag string literals from the response union `R` (distributive conditional type over `R`); `Send.Matcher<R,T>` is `{ [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } & { transportError: (e: TransportError) => T; decodeError: (e: DecodeError, status: number, headers: Headers, preview: BodyPreview) => T; unhandledStatus: (status: number, headers: Headers, preview: BodyPreview) => T }`.
2. **`Send.match()` runtime implementation in `src/matcher.ts`** — `function match<R, T>(result: SendResult<R>, handlers: Send.Matcher<R,T>): T` — switch on `result.kind`; for `"response"` kind: access `handlers` by `result.response.tag` (cast `handlers` as `Record<string, (r: unknown) => T>` to satisfy `noUncheckedIndexedAccess`); call the handler with `result.response`; for `transportError`/`decodeError`/`unhandledStatus` delegate to the fixed handlers.
3. **Integration tests for exhaustiveness** — Verify that (a) omitting any handler key is a TypeScript compile error; (b) adding a new `ResponseMap` entry propagates as a required handler key; (c) `satisfies Send.Matcher<typeof result, string>` enforces all variants without widening; (d) object spread of partial handler fragments composes correctly.

**Success Criteria** (what must be TRUE):
1. `Send.match(result, { user: r => r.name, transportError: e => "err", decodeError: () => "err", unhandledStatus: () => "err" })` compiles and returns the correct value when `result` is a `{ kind: "response", response: { tag: "user", ... } }`.
2. Omitting `transportError` from the handlers object is a TypeScript compile-time error — not a runtime error.
3. Adding `"404": { decoder: Decode.none(), tag: "notFound" as const }` to `responses` causes TypeScript to report an error at every existing `Send.match()` call site that lacks a `notFound` handler.
4. `satisfies Send.Matcher<R, string>` idiom works for defining reusable partial fragments that can be composed with object spread.

**Implementation Notes:**
- `Send.Matcher<R,T>` is a **mapped type** over `TagsOf<R>` (string literal union from the response tags) plus three fixed keys.
- `noUncheckedIndexedAccess` requires a cast when accessing handlers by tag key — `(handlers as Record<string, (r: unknown) => T>)[tag]` is the correct pattern. Verify this does not require `as any`.
- The `satisfies` idiom works naturally with this design — handler fragments can be defined with `satisfies Partial<Send.Matcher<R,T>>` and composed.

**Pitfall Warnings:**
- ⚠️ **Silent exhaustiveness gaps**: Exhaustiveness must be enforced at the type level — a missing handler is a compile error, not a runtime `undefined`. Verify `Send.Matcher<R,T>` has no optional properties.
- ⚠️ **`noUncheckedIndexedAccess` handler dispatch**: Accessing `handlers[tag]` returns `handler | undefined` at the type level even with the correct cast. The cast to `Record<string, (r: unknown) => T>` resolves this — verify during implementation.

**Plans:** TBD

---

### Phase 8: Documentation & Polish

**Goal:** Every public symbol has TSDoc; the README enables any user (including AI agents) to correctly use the library from types and README alone; `package.json` correctly declares Zod as an optional peer dependency.

**Depends on:** Phase 7 (all public API must be finalized before documentation is written)

**Requirements:** DOC-01, DOC-02, DOC-03

**Plans:**
1. **TSDoc on all public exports** — Add TSDoc to: `Request` + `Request.create()`, `createClient()`, `send()`, all `Body.*` functions, all `Decode.*` functions, `Send.match()`, all types in `types.ts` (`SendResult`, `TransportError`, `DecodeError`, `DecodeIssue`, `BodyPreview`, `ResponseMap`, `Schema`, `RetryPolicy`); mark `Request.consume()` as `@internal` to suppress from IntelliSense.
2. **README — real usage examples** — Sections: ESM-only declaration + install; quick-start example (mirrors the SPEC.md introductory example); result-union pattern explanation (`SendResult<R>` — why no throws); `Send.match()` exhaustive handler example; retry policy configuration example; Zod schema decoder example (`Decode.json(schema)` with type inference shown); known limitations (`Body.formData()` not yet implemented, CJS not supported).
3. **`package.json` — Zod peer dependency finalization** — Add `peerDependencies: { "zod": "^3.25.0" }`, `peerDependenciesMeta: { "zod": { "optional": true } }`, verify `devDependencies` includes `"zod": "^3.25.0"`; confirm `engines: { "node": ">=24.0.0" }` is present.

**Success Criteria** (what must be TRUE):
1. Every exported function and type has TSDoc visible in editor IntelliSense (hover over `send()`, `Body.json()`, `Decode.text()`, `Send.match()` — all show descriptions and parameter docs).
2. `Request.consume()` does not appear in IntelliSense autocomplete for the `Request` type.
3. A developer can follow the README quick-start example from zero to a working typed HTTP call without reading `docs/SPEC.md` or any source file.
4. `npm install @sethlivingston/oneway-http` in a project without Zod installed succeeds without warnings; installing with Zod satisfies the peer dependency.
5. The README prominently states ESM-only and shows correct `import` syntax (not `require`).

**Implementation Notes:**
- Zod peer dep range: `"zod": "^3.25.0"` covers Zod v3.25+. Zod v4 support can be added post-v1 via the `Schema<T>` duck-type seam without a breaking change.
- `peerDependenciesMeta` with `optional: true` prevents npm from warning when Zod is not installed (it is only needed for `Decode.json(schema)`).
- README goal: **fully usable by AI agents from types and README alone**. Show complete working examples, not partial snippets. Include the type signature of `SendResult<R>` inline to make the result union self-explanatory.
- `Decode.discard()` reader cancellation in `finally` blocks must have a code comment explaining the connection-leak prevention.

**Pitfall Warnings:**
- ⚠️ **P11 — ESM CJS confusion**: README must prominently state ESM-only. `require()` of this package produces `MODULE_NOT_FOUND` with no ESM hint. Clear documentation is the mitigation.
- ⚠️ **Zod peer dep range**: `^3.25.0` is the minimum for the `zod/v3` subpath; verify this is correct and does not exclude any widely-used Zod 3.x minor versions.

**Plans:** TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Fixes | 0/3 | Not started | — |
| 2. Core Types + Request Model | 0/3 | Not started | — |
| 3. Transport + Send | 0/3 | Not started | — |
| 4. Body Producers + Decoders | 0/4 | Not started | — |
| 5. Response Matching + Decode Dispatch | 0/3 | Not started | — |
| 6. Abort, Deadline & Retry | 0/4 | Not started | — |
| 7. Typed Matcher | 0/3 | Not started | — |
| 8. Documentation & Polish | 0/3 | Not started | — |

---

## Dependency Chain

```
Phase 1 — Infrastructure Fixes
    │  tsconfig + Vitest aliases + entrypoint fix
    │  unblocks every subsequent phase
    ▼
Phase 2 — Core Types + Request Model
    │  types.ts is the dependency root
    │  header merge pitfall isolated here
    ▼
Phase 3 — Transport + Send (single attempt)
    │  AbortSignal composition correct before retry added
    │  transport error classification locked in here
    ▼
Phase 4 — Body Producers + Decoders
    │  decoders consume raw bytes produced by Phase 3
    │  body normalization, connection-safe preview implemented
    ▼
Phase 5 — Response Matching + Decode Dispatch
    │  wires decoders to status codes
    │  completes the happy path; ResponsesOf<M> machinery ready
    ▼
Phase 6 — Abort, Deadline & Retry
    │  retry wraps the complete Phase 5 dispatch loop
    │  three independent bugs addressed simultaneously
    ▼
Phase 7 — Typed Matcher
    │  requires SendResult<R> and ResponsesOf<M> from Phases 2–5
    │  capstone of the type system design
    ▼
Phase 8 — Documentation & Polish
       all public API finalized; document and publish
```

---

## Coverage Map

| Requirement | Phase | Category |
|-------------|-------|----------|
| INFRA-01 | Phase 1 | Infrastructure Fixes |
| INFRA-02 | Phase 1 | Infrastructure Fixes |
| INFRA-03 | Phase 1 | Infrastructure Fixes |
| TYPES-01 | Phase 2 | Core Types |
| TYPES-02 | Phase 2 | Core Types |
| TYPES-03 | Phase 2 | Core Types |
| TYPES-04 | Phase 2 | Core Types |
| TYPES-05 | Phase 2 | Core Types |
| TYPES-06 | Phase 2 | Core Types |
| TYPES-07 | Phase 2 | Core Types |
| TYPES-08 | Phase 2 | Core Types |
| REQ-01 | Phase 2 | Request Model |
| REQ-02 | Phase 2 | Request Model |
| REQ-03 | Phase 2 | Request Model |
| REQ-04 | Phase 2 | Request Model |
| SEND-01 | Phase 3 | Transport & Send |
| SEND-02 | Phase 3 | Transport & Send |
| SEND-03 | Phase 3 | Transport & Send |
| SEND-04 | Phase 3 | Transport & Send |
| SEND-05 | Phase 3 | Transport & Send |
| SEND-06 | Phase 3 | Transport & Send |
| BODY-01 | Phase 4 | Body Producers |
| BODY-02 | Phase 4 | Body Producers |
| BODY-03 | Phase 4 | Body Producers |
| BODY-04 | Phase 4 | Body Producers |
| BODY-05 | Phase 4 | Body Producers |
| DEC-01 | Phase 4 | Body Decoders |
| DEC-02 | Phase 4 | Body Decoders |
| DEC-03 | Phase 4 | Body Decoders |
| DEC-04 | Phase 4 | Body Decoders |
| DEC-05 | Phase 4 | Body Decoders |
| DEC-06 | Phase 4 | Body Decoders |
| DEC-07 | Phase 4 | Body Decoders |
| DEC-08 | Phase 4 | Body Decoders |
| RESP-01 | Phase 5 | Response Matching |
| RESP-02 | Phase 5 | Response Matching |
| RESP-03 | Phase 5 | Response Matching |
| RESP-04 | Phase 5 | Response Matching |
| PREV-01 | Phase 5 | Body Preview |
| PREV-02 | Phase 5 | Body Preview |
| PREV-03 | Phase 5 | Body Preview |
| ADR-01 | Phase 6 | Abort, Deadline & Retry |
| ADR-02 | Phase 6 | Abort, Deadline & Retry |
| ADR-03 | Phase 6 | Abort, Deadline & Retry |
| ADR-04 | Phase 6 | Abort, Deadline & Retry |
| ADR-05 | Phase 6 | Abort, Deadline & Retry |
| ADR-06 | Phase 6 | Abort, Deadline & Retry |
| ADR-07 | Phase 6 | Abort, Deadline & Retry |
| MATCH-01 | Phase 7 | Typed Matcher |
| MATCH-02 | Phase 7 | Typed Matcher |
| MATCH-03 | Phase 7 | Typed Matcher |
| DOC-01 | Phase 8 | Documentation |
| DOC-02 | Phase 8 | Documentation |
| DOC-03 | Phase 8 | Documentation |

**Total: 53/53 v1 requirements mapped ✓ — No orphans**

---

## Highest-Risk Areas

### Risk 1: AbortSignal Error Classification (Phase 3)

The deadline controller **must** abort with `new DOMException("Deadline exceeded", "TimeoutError")` — not a plain `AbortError`, not `controller.abort()` with no argument, not `AbortSignal.timeout()`. If this is wrong, every deadline expiry returns `{ kind: "aborted" }` instead of `{ kind: "timeout" }` — permanently misclassifying the most important transport error. The fix is a single line; the consequence of getting it wrong is silent and production-visible. Write and pass a targeted test (`deadlineMs: 50`, no caller signal, verify `result.error.kind === "timeout"`) before any other Phase 3 work is considered done.

### Risk 2: Three Independent Retry Bugs (Phase 6)

Three bugs that must each be prevented, independently, in the same retry loop:

| Bug | Wrong Code | Correct Code |
|-----|------------|--------------|
| Off-by-one | `attempt <= maxAttempts` | `attempt < maxAttempts` |
| Abort-unaware sleep | `await sleep(ms)` | `await sleepWithAbort(ms, signal)` |
| Jitter overflow | `Math.random() * base * 2^attempt` | `Math.random() * Math.min(cap, base * 2^attempt)` |

All three exist independently in typical retry implementations. All three have been confirmed by live test on Node.js 24. Write explicit tests for each before writing the retry loop (test-first for Phase 6). A request-counting mock server is the ground truth for the off-by-one.

### Risk 3: Body Stream Resource Leaks (Phase 4)

Two leak paths, both requiring `finally` blocks:
- `BodyPreview`: `reader.cancel()` in `finally` — abandoning a reader leaves the TCP socket open until GC; confirmed to exhaust connection pools under load.
- `Decode.discard()`: `response.body?.cancel()` — the null guard is required for 204/304/205 responses.

Verify by checking `response.bodyUsed === true` after every body operation in tests.

---

*Source of truth for all behavior: `docs/SPEC.md` (491 lines). No behavior should be implemented that contradicts or extends it without updating the spec first.*
