# Feature Research

**Domain:** TypeScript/JavaScript HTTP client library
**Researched:** 2026-05-04
**Confidence:** HIGH (ecosystem well-documented; ky, axios, wretch, got, ofetch all verified via Context7)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features every HTTP client must have. Missing these = library feels broken or unusable.

| Feature | Why Expected | Spec Coverage | Notes |
|---------|--------------|---------------|-------|
| All HTTP methods (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) | Every API needs them | ✅ `method` field on `RequestSpec` | — |
| Custom request headers | Auth tokens, content negotiation | ✅ `headers` on `RequestSpec` and `ClientSpec` | Case-insensitive merge |
| Query parameters | URL construction for GETs | ✅ `query` on `RequestSpec` | Arrays → repeated keys; `undefined` omits |
| JSON request body | Dominant API payload type | ✅ `Body.json(value)` | Sets `content-type: application/json` automatically |
| Form URL-encoded body | HTML forms, legacy APIs | ✅ `Body.formUrlEncoded(entries)` | Supports repeated keys |
| Text body | Webhooks, plain-text endpoints | ✅ `Body.text(value, contentType?)` | — |
| Raw binary body | File upload escape hatch | ✅ `Body.bytes(bytes, contentType?)` | — |
| JSON response decoding | Dominant API response type | ✅ `Decode.json()` / `Decode.json(schema)` | Unknown or schema-validated |
| Text response decoding | Plain/HTML responses | ✅ `Decode.text()` | Empty body → `""` |
| Binary response | File downloads | ✅ `Decode.bytes()` | Returns `Uint8Array` |
| Base URL / client defaults | DRY for multi-request clients | ✅ `createClient({ baseUrl, headers, ... })` | — |
| Per-request timeout / deadline | Prevent hung requests | ✅ `deadlineMs` (whole-operation, all attempts) | Surfaces as `transportError.timeout` |
| Abort / cancellation | User-initiated cancel, navigation | ✅ `{ signal }` on `send()` invocation | Surfaces as `transportError.aborted` |
| Retry on transient failures | Network blips, 502/503/504 | ✅ `RetryPolicy` with exponential jittered backoff | Default: GET/HEAD only; never retries abort/decode/unhandled |
| Differentiate transport failure from HTTP error | Critical for correct error handling | ✅ `SendResult` union: `transportError` vs `response`/`unhandledStatus`/`decodeError` | **Unique — see Differentiators** |
| TypeScript support | Industry standard expectation | ✅ Strict mode, `exactOptionalPropertyTypes`, full inference | — |
| Cross-platform (browser + Node) | Modern library requirement | ✅ Three-target build: browser/node/neutral | — |

**Notable gap vs. table stakes:**

| Feature | Why Expected | Spec Coverage | Assessment |
|---------|--------------|---------------|------------|
| Multipart/form-data (file upload) | File uploads, mixed payloads | ❌ No `Body.formData()` | **Potential v1 gap** — `Body.bytes()` is an escape hatch but requires callers to manually serialize `FormData`, which is error-prone. Most HTTP clients include this. |
| Redirect handling control | Authentication flows, API edge cases | ❌ Not exposed | **Acceptable gap** — Fetch default (`redirect: "follow"`) is correct for 95% of use cases. Document that callers needing `redirect: "manual"` can use `absoluteUrl` + platform fetch directly. |
| Credentials / cookie control | Cross-origin requests, session auth | ❌ Not exposed | **Acceptable gap** — Browsers default to `same-origin`, which is usually correct. Worth a future `credentials` option on `ClientSpec`. |

---

### Differentiators (Competitive Advantage)

What sets oneway-http apart from every library in the ecosystem. These align directly with its Core Value.

| Feature | Value Proposition | Competitors | Notes |
|---------|-------------------|-------------|-------|
| **Result union — no exceptions** | `send()` never throws; every outcome (success, transport failure, decode failure, unmatched status) is a typed return value. Callers use `switch` or `Send.match()`. | ky, axios, wretch, ofetch, got all **throw** for non-2xx responses and transport failures | This is the primary differentiator. Eliminates the "did I forget a try/catch?" problem category entirely. |
| **Status-specific typed decoding** | `ResponseMap` maps individual status codes or classes (`"2xx"`) to distinct decoder+tag pairs. 200 returns `UserList`, 304 returns `void`, 404 returns `NotFoundBody` — all in one call. | No competitor has per-status decode dispatch. All treat "response body" as a single uniform thing. | Eliminates the "parse the body, then switch on the shape" boilerplate that every real API integration writes. |
| **Affine request enforcement** | A `Request` is consumed once `send()` begins. Sending the same request twice is a runtime error. Forces callers toward factory functions and makes request lifecycle explicit. | No competitor enforces single-use semantics. | Prevents subtle bugs around request body re-use and retry semantics. |
| **Explicit body producers** | `Body.*` always requires the caller to declare encoding. The library never guesses body type from the value's shape. | ofetch auto-parses based on Content-Type; axios auto-serializes objects as JSON | Eliminates "why is my object being sent as `[object Object]`?" debugging sessions. |
| **Normalized decode error taxonomy** | `DecodeError` is a library-defined union (`unexpectedBody | emptyBody | invalidJson | schemaMismatch | bodyReadFailed | custom`). Zod types never leak into the public API. | No competitor normalizes decode failures at all. Zod errors surface raw if you use Zod yourself. | Enables swapping schema validators (Zod → Valibot) without changing consumer error-handling code. |
| **Three-tier failure separation** | `transportError` (pre-response), `decodeError` (decode failure after match), `unhandledStatus` (no handler registered) are three distinct `SendResult` variants, not one `catch`. | All competitors conflate at least two of these into a single thrown error type. | Callers can handle "the network died" very differently from "the API returned a 422 with a structured error body". |
| **Schema validation integrated into the decode pipeline** | `Decode.json(zodSchema)` produces a fully typed, validated response. The parse+validate is a single step in the send lifecycle, not caller boilerplate. | wretch has a Zod recipe (manual, via callback). ky/axios/ofetch have no Zod integration. | The type of `result.response` is inferred directly from the schema — no `as` casts. |
| **Exhaustive typed matcher** | `Send.match(result, handlers)` enforces exhaustiveness at compile time. Missing a handler is a type error, not a runtime surprise. | No competitor has an exhaustive dispatch helper. | Wraps TypeScript's `satisfies` pattern into an ergonomic API. |
| **Whole-operation deadline (not per-request timeout)** | `deadlineMs` covers all retry attempts, backoff delays, body reading, and decoding — not just the first HTTP connect. | Most competitors implement per-attempt timeouts that reset on each retry, allowing a 3-retry operation to take `3 × timeout` ms. | Gives callers a reliable SLA guarantee for the entire operation. |
| **No interceptors / no global state** | The library has no hook registration, no instance mutation, no `axios.defaults`. All configuration is immutable values. | Axios has `axios.defaults` (global mutable); ky/ofetch/got have lifecycle hooks with mutation semantics. | Interceptors are a dependency injection mechanism in disguise — they create action-at-a-distance and ordering bugs. Explicit composition (factory functions, `createClient`) is more testable. |

---

### Anti-Features (Deliberately Excluded — Good Calls)

Features that seem useful but cause real harm. The spec is correct to exclude these.

| Feature | Why Requested | Why Problematic | oneway-http's Alternative |
|---------|---------------|-----------------|---------------------------|
| **Exception-based HTTP errors** | "I don't want to think about 4xx, just let it throw" | Encourages ignoring specific error shapes. Conflates 401 (auth), 429 (rate limit), 422 (validation), 500 (server bug) into one catch clause. Forces try/catch around every call. | `SendResult` union — callers pattern-match on exactly the variants they care about. Unmatched statuses surface as `unhandledStatus` with a body preview for debugging. |
| **`default` / catch-all response matcher** | "I want a fallback for anything I didn't handle" | Silent swallowing of unexpected response shapes. A missing 429 handler becomes invisible noise instead of a visible `unhandledStatus`. | No default matcher. Every unregistered status becomes `{ kind: "unhandledStatus", status, preview }`. Callers that want a catch-all can match `unhandledStatus` explicitly. |
| **Interceptors (request/response hooks)** | "I need to inject auth headers / log all requests" | Action-at-a-distance. Interceptors execute in registration order (non-obvious). Request interceptors can mutate in ways that break tests. Response interceptors can suppress errors silently. Auth header injection is better handled by a factory function over `createClient`. | Explicit composition: `createClient({ headers: { authorization: () => token } })` or factory functions that wrap request creation. |
| **Global mutable defaults** (`axios.defaults`) | "Set auth once, use everywhere" | Any module can mutate global state. Order-dependent initialization. Test isolation requires teardown. | `createClient()` returns an immutable client value. Share the client, don't mutate defaults. |
| **Implicit JSON body detection** | "If I pass an object, encode it as JSON" | Silent encoding surprises. Passing `new FormData()` still looks like an object. Content-type guessing from runtime shape is fragile. | `Body.json(value)` is always explicit. No guessing. |
| **TypeScript generics as type casts** (`ky<User>('/api').json()`) | "TypeScript completion on the response" | The generic is a lie — it's a cast, not validation. The actual response shape isn't verified at runtime. Type safety is theater. | `Decode.json(zodSchema)` — the type is inferred from the schema and validated at runtime. The TypeScript type and the runtime behavior agree. |
| **Fluent/chained builder API** | "Chainable calls feel ergonomic" | Chain types are harder to infer correctly. Partial chains are invalid values that TypeScript may not catch. Hard to compose reusable fragments. | Plain objects. `Request.create({ ... })` is a value. `responses` is a plain object. Handler fragments are plain objects spread with `{ ...commonHandlers, ...requestHandlers }`. |
| **Streaming request bodies** (v1) | "I need to upload a large file" | Streaming lifecycle interacts badly with retry (can't replay a stream). Body affinity becomes complex to enforce. Body preview is meaningless for streams. | `Body.bytes()` handles binary. Streaming deferred to v2 when retry+stream interaction is specified. |
| **Explicit header deletion across merge layers** (v1) | "I inherited a header from the client and need to suppress it for one request" | Rarely needed. Complexity cost outweighs benefit. Deletion semantics for `undefined` vs "delete" require a sentinel value or a separate API. | Use `absoluteUrl` to bypass client defaults entirely for requests that need fully custom headers. |

---

## Feature Dependencies

```
createClient({ baseUrl, headers, responses, retry, deadlineMs })
    └──provides defaults to──> send()

Request.create({ method, path, query, headers, body, responses, retry, deadlineMs })
    └──consumed by──> send()
                          └──produces──> SendResult<R>
                                             ├── { kind: "response"; response: R }
                                             ├── { kind: "transportError"; error: TransportError }
                                             ├── { kind: "decodeError"; status; error: DecodeError; preview }
                                             └── { kind: "unhandledStatus"; status; preview }

ResponseMap (status matchers → decode+tag pairs)
    └──required by──> Request.create()
    └──evaluated by──> send() response matching
    └──determines shape of──> SendResult<R>

Decode.json(schema)
    └──requires──> Zod peer dependency
    └──produces typed body in──> SendResult<R>.response

Send.match(result, handlers)
    └──consumes──> SendResult<R>
    └──requires exhaustive coverage of──> all SendResult<R> variants

RetryPolicy
    └──interacts with──> deadlineMs (deadline wins)
    └──requires──> { signal } to be combined via AbortSignal.any()

Body.* (affine)
    └──enforced by──> Request affine flag set at send() time
    └──cannot be reused after──> send() begins
```

### Dependency Notes

- **`SendResult<R>` shape depends on `ResponseMap`:** The response union `R` is inferred from the decoder+tag pairs in the request's `responses` map. This is the key TypeScript inference challenge: the type system must infer a discriminated union from a record of status→decoder entries.
- **`Decode.json(schema)` requires Zod:** Zod is a peer dependency. `Decode.json()` (no schema) works without it. The schema adapter seam should be thin enough that Valibot can be plugged in later.
- **Retry interacts with Deadline, not the other way around:** Deadline is terminal — it stops retries. Retries never extend the deadline.
- **Affine enforcement requires request-scoped state:** The "consumed" flag is per `Request` instance. Factory functions that produce new instances on each call are the standard pattern for reusable requests.

---

## MVP Definition

The spec already defines a coherent, complete v1. No trimming is needed or desired.

### Launch With (v1)

All items from `docs/SPEC.md` are in scope. Key clusters:

- [x] `createClient()` + `send()` core transport loop
- [x] `Request.create()` with affine enforcement
- [x] `Body.*` producers (none, json, text, formUrlEncoded, bytes)
- [x] `Decode.*` decoders (none, discard, text, json, json(schema), bytes, optional)
- [x] `ResponseMap` with status matchers (exact + class)
- [x] `SendResult<R>` discriminated union (4 variants)
- [x] `TransportError` taxonomy (aborted, timeout, network)
- [x] `DecodeError` union (6 variants), `DecodeIssue[]` normalized
- [x] Retry with exponential jittered backoff, whole-operation deadline
- [x] `BodyPreview` for decodeError + unhandledStatus
- [x] `Send.match()` exhaustive matcher
- [x] Zod schema adapter (peer dependency, Zod errors normalized to `DecodeIssue[]`)

### Add After Validation (v1.x)

- [ ] `Body.formData()` — multipart/form-data for file uploads. The `Body.bytes()` escape hatch exists but is ergonomically poor for mixed payloads. Add when a consumer demonstrates the use case.
- [ ] `credentials` option on `ClientSpec` — needed for cross-origin browser requests. Add when a consumer hits CORS cookie issues.
- [ ] `redirect` option on `RequestSpec` — needed for auth flows that inspect 3xx. Add when demonstrated need arises.
- [ ] Valibot schema adapter — seam maintained in v1; ship adapter when a consumer uses Valibot.

### Future Consideration (v2+)

- [ ] Streaming request bodies — requires specifying retry semantics for non-replayable streams. Significant design work.
- [ ] Explicit header/query deletion across merge layers — add a sentinel or `{ delete: true }` marker if consumer pain is demonstrated.
- [ ] Response streaming (generator/async iterator `Decode.stream()`) — large file downloads. Requires affine decode lifecycle.
- [ ] `Retry-After` header awareness — retry policy could parse the header and honor server-requested delay.
- [ ] Rate limiting / throttling adapter — useful for GitHub/Stripe APIs; not core to the library design.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `send()` + `SendResult<R>` core loop | HIGH | HIGH | P1 |
| `Request.create()` + affine enforcement | HIGH | MEDIUM | P1 |
| `Body.*` producers (json, text, form, bytes) | HIGH | LOW | P1 |
| `Decode.*` decoders (json, text, bytes, discard, none, optional) | HIGH | MEDIUM | P1 |
| `ResponseMap` matching + precedence rules | HIGH | MEDIUM | P1 |
| `SendResult` discriminated union types | HIGH | MEDIUM | P1 |
| `Decode.json(schema)` + Zod adapter | HIGH | MEDIUM | P1 |
| `RetryPolicy` + exponential jittered backoff | HIGH | HIGH | P1 |
| Deadline (`deadlineMs`) + `AbortSignal.any()` | HIGH | MEDIUM | P1 |
| `BodyPreview` for error variants | MEDIUM | LOW | P1 |
| `Send.match()` exhaustive matcher | MEDIUM | LOW | P1 |
| TSDoc on all public API | MEDIUM | LOW | P1 |
| README with real usage examples | MEDIUM | LOW | P1 |
| `Body.formData()` multipart | MEDIUM | LOW | P2 |
| `credentials` option | LOW | LOW | P2 |
| `redirect` option | LOW | LOW | P2 |
| Valibot adapter | LOW | LOW | P2 |
| Streaming request/response bodies | MEDIUM | HIGH | P3 |
| `Retry-After` header awareness | LOW | MEDIUM | P3 |

---

## Competitor Feature Analysis

| Feature | ky | axios | wretch | got | ofetch | oneway-http |
|---------|-----|-------|--------|-----|--------|-------------|
| **Error model** | Throws `HTTPError` on non-2xx | Throws `AxiosError` on non-2xx (configurable with `validateStatus`) | Throws, caught via `.catcher()` chains | Throws `HTTPError` on non-2xx | Throws `FetchError` on non-2xx | Returns `SendResult` union — never throws |
| **Status-specific typed decoding** | ❌ Manual | ❌ Manual | ❌ Manual (status-specific catchers exist but no typed decode) | ❌ Manual | ❌ Manual | ✅ `ResponseMap` dispatches decode by status |
| **Schema validation** | ❌ | ❌ | Via recipe (manual Zod callback) | ❌ | ❌ | ✅ `Decode.json(schema)` built-in, normalized errors |
| **Transport vs HTTP error separation** | ✅ `HTTPError` vs `TimeoutError` | Partial (`ECONNABORTED` vs `AxiosError`) | Partial | ✅ `RequestError` vs `HTTPError` | Partial | ✅ 4-way: response / transportError / decodeError / unhandledStatus |
| **Retry** | ✅ `retry.limit`, custom `shouldRetry` | ❌ (manual or plugin) | ❌ (plugin exists) | ✅ Highly configurable | ✅ Basic | ✅ Conservative defaults, whole-op deadline aware |
| **Whole-operation deadline** | ❌ Per-attempt timeout only | ❌ Per-attempt timeout only | ❌ | ❌ Per-attempt | ❌ | ✅ Covers all attempts + backoff + decode |
| **Interceptors / hooks** | ✅ `beforeRequest`, `afterResponse`, `beforeRetry` | ✅ Request/response interceptors | ✅ Middleware chain | ✅ Lifecycle hooks | ✅ `onRequest`, `onResponse`, `onResponseError` | ❌ Deliberate — use factory functions instead |
| **Global mutable state** | ❌ `ky.extend()` creates new instance | ⚠️ `axios.defaults` is mutable global | ❌ Immutable chain | ❌ `got.extend()` | ❌ `$fetch.create()` | ✅ None — `createClient()` returns immutable value |
| **Affine request enforcement** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Runtime error if consumed request re-sent |
| **Explicit body encoding** | Partial (JSON auto-detected for objects) | ❌ Auto-serializes objects to JSON | ❌ Implicit JSON | Partial | ❌ Auto-parses by Content-Type | ✅ `Body.*` always explicit |
| **TypeScript: validated types** | ❌ Cast only (`json<User>()`) | ❌ Cast only (`get<User>()`) | ❌ Cast only | ❌ Cast only | ❌ Cast only | ✅ `Decode.json(schema)` infers type from schema |
| **Exhaustive matcher** | ❌ | ❌ | Partial (`.error(code, cb)` chains, not exhaustive) | ❌ | ❌ | ✅ `Send.match()` enforced at type level |
| **ESM-only, zero runtime deps** | ✅ ESM, zero deps | ❌ CJS+ESM, has deps | ✅ ESM, zero deps | Partial (ESM available) | ✅ ESM | ✅ ESM-only, zero runtime deps (Zod is peer) |
| **Cross-platform (browser+Node)** | ✅ | ✅ (different internals) | ✅ | ❌ Node-only | ✅ | ✅ Verified browser+Node with parity tests |

---

## Spec Boundary Assessments

### Are the three deliberate exclusions the right calls for v1?

**1. Streaming request bodies — YES, good boundary.**

Streaming request bodies interacts with retry in non-obvious ways: a stream can be consumed only once, so a retried request requires either buffering (defeating the purpose) or a stream factory (a new API concept). Got handles this complexity via `cache` and explicit stream creation. For a v1 that wants clean retry semantics, deferring streaming is correct. `Body.bytes()` covers nearly all real-world binary payloads without streaming.

**2. No `default` matcher — YES, excellent boundary.**

Every competitor with a catch-all (`else`, `*`, a default error handler) produces the same bug: unexpected responses from APIs are silently swallowed or treated identically to expected ones. `unhandledStatus` with `BodyPreview` is strictly better — callers see exactly what the API returned, complete with status code, headers, and a body preview. A library that forces explicit handling of every status trains callers to think about API contracts rather than hoping the happy path is the only path.

**3. No explicit header deletion — YES, acceptable for v1.**

The `undefined` = "not specified at this layer" semantics are clean and cover 99% of use cases. The 1% case (suppress an inherited `authorization` header for a public endpoint) can use `absoluteUrl` to bypass the client entirely. The complexity cost of deletion semantics (sentinel values, layered-delete tracking) isn't worth v1 implementation time. Document the escape hatch clearly.

---

## TypeScript Ergonomics Assessment (2026)

**What the ecosystem currently uses:**
- Discriminated unions for result types: now idiomatic, driven by `Result<T, E>` patterns from Rust influence
- `satisfies` operator (TS 4.9+): enables exhaustive object checking without losing inference
- `exactOptionalPropertyTypes`: strict mode standard; prevents `{ key: undefined }` ≠ `{}`  bugs
- Schema libraries as the primary validation/type-inference mechanism (Zod, Valibot, ArkType)
- Conditional types to infer response union from a `ResponseMap` record — this is the hard part

**How oneway-http aligns:**
- ✅ `SendResult<R>` discriminated union on `kind` is exactly the right pattern
- ✅ `Decode.json(zodSchema)` infers `R` from the schema — not a cast
- ✅ `Send.Matcher<R, T>` + `satisfies` for exhaustive handler objects
- ✅ `exactOptionalPropertyTypes` in `tsconfig` means `headers: { auth: undefined }` correctly means "not specified", not "present as undefined"
- ✅ `verbatimModuleSyntax` enforces correct import/export discipline
- ⚠️ Inferring the `R` union from `ResponseMap` at the type level is the primary implementation challenge — requires conditional types mapping from `{ [matcher: StatusMatcher]: DecoderTagPair }` to a discriminated union. This is achievable but requires care.

**The key type inference goal:**
```ts
// Given:
const request = Request.create({
  responses: {
    200: Decode.json(UserListSchema).as("users"),
    304: Decode.none().as("notModified"),
    404: Decode.json(NotFoundSchema).as("notFound"),
  }
})

// The type of result should be inferred as:
// SendResult<
//   | { kind: "users"; body: UserList }
//   | { kind: "notModified" }
//   | { kind: "notFound"; body: NotFoundBody }
// >
```

This is achievable with TypeScript's mapped + conditional types but is the most type-system-intensive part of the implementation.

---

## Sources

- **ky** — Context7 `/sindresorhus/ky` (hooks, TypeScript generics, retry, error model) — HIGH confidence
- **wretch** — Context7 `/elbywan/wretch` (middleware, catchers, TypeScript, Zod recipe) — HIGH confidence
- **axios** — Context7 `/axios/axios-docs` (interceptors, global defaults, TypeScript) — HIGH confidence
- **got** — Context7 `/sindresorhus/got` (retry config, Node-only, streams) — HIGH confidence
- **ofetch** — Context7 `/unjs/ofetch` (auto-parsing, hooks, cross-platform) — HIGH confidence
- **oneway-http spec** — `docs/SPEC.md` and `.planning/PROJECT.md` — authoritative

---
*Feature research for: TypeScript HTTP client library (oneway-http)*
*Researched: 2026-05-04*
