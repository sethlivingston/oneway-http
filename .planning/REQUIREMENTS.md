# Requirements: oneway-http

**Defined:** 2026-05-04
**Core Value:** Give callers a complete, structured result for every HTTP interaction — including transport failures, decode failures, and unmatched statuses — with no thrown exceptions and no runtime surprises across browsers and Node.

## v1 Requirements

### Infrastructure Fixes

- [x] **INFRA-01**: `tsconfig.json` migrated from `module: NodeNext` + `baseUrl` + `ignoreDeprecations` to `module: Preserve` + `moduleResolution: Bundler` with `baseUrl` and `ignoreDeprecations` removed
- [x] **INFRA-02**: Neutral entrypoint (`src/index.ts`) detects runtime correctly — no hardcoded `runtimeTarget: "browser"`
- [x] **INFRA-03**: Vitest source aliases configured so parity tests resolve from `src/` directly, eliminating the dist-before-test requirement

### Core Types

- [x] **TYPES-01**: All shared type definitions exported from `src/types.ts` with zero logic and zero internal imports
- [x] **TYPES-02**: `SendResult<R>` discriminated union defined — five variants: `response | transportError | decodeError | unhandledStatus | requestError`
- [x] **TYPES-03**: `TransportError` union defined — `aborted | timeout | network`
- [x] **TYPES-04**: `DecodeError` union defined — `unexpectedBody | emptyBody | invalidJson | schemaMismatch | bodyReadFailed | custom`
- [x] **TYPES-05**: `DecodeIssue` type defined — `{ path, message, code? }` — normalized, not Zod-specific
- [x] **TYPES-06**: `BodyPreview` type defined — `{ text, bytesRead, truncated }`
- [x] **TYPES-07**: `ResponseMap` type defined — maps `StatusMatcher` (`number | "2xx" | "4xx" | "5xx"`) to decode+tag pairs
- [x] **TYPES-08**: `Schema<T>` duck-type interface defined structurally (matches Zod `safeParse` shape, no Zod import)

### Request Model

- [x] **REQ-01**: `Request.create()` builds a `RequestSpec` value from `method`, `path`/`absoluteUrl`, `query`, `headers`, `body`, `responses`, `retry`, `deadlineMs`
- [x] **REQ-02**: Path resolution — segment-based, each segment encoded separately, joined with `/`, resolved against `baseUrl`
- [x] **REQ-03**: Query construction — plain object, `undefined` omits key, arrays become repeated keys, numbers/booleans stringified
- [x] **REQ-04**: Affine enforcement — `Request` consumed once `send()` begins; consumed request rejected at runtime if re-sent

### Transport & Send

- [x] **SEND-01**: `createClient()` constructs a client with shared defaults: `baseUrl`, `headers`, `responses`, `retry`, `deadlineMs`, `diagnostics`
- [x] **SEND-02**: `send()` executes a request against a client and returns `SendResult<R>` — never throws
- [x] **SEND-03**: Header merge is case-insensitive; request headers override client headers; `undefined` values are filtered (not spread as `undefined` keys)
- [x] **SEND-04**: `responses` layers with request-exact → request-class → client-exact → client-class precedence; maps are never pre-merged
- [x] **SEND-05**: Scalar policies (`retry`, `deadlineMs`) are request-over-client override (last write wins)
- [x] **SEND-06**: `AbortSignal.any()` composes caller signal and deadline controller internally; deadline uses `DOMException("...", "TimeoutError")` to distinguish from caller abort

### Body Producers

- [x] **BODY-01**: `Body.none()` — no request body
- [x] **BODY-02**: `Body.json(value)` — `JSON.stringify`, UTF-8, sets `content-type: application/json`
- [x] **BODY-03**: `Body.text(value, contentType?)` — UTF-8, defaults to `text/plain; charset=utf-8`
- [x] **BODY-04**: `Body.formUrlEncoded(entries)` — `application/x-www-form-urlencoded`, supports repeated keys
- [x] **BODY-05**: `Body.bytes(bytes, contentType?)` — raw binary with caller-supplied content-type

### Body Decoders

- [x] **DEC-01**: `Decode.none()` — strict emptiness; any bytes → `decodeError.unexpectedBody`; null body and empty stream both normalized to zero bytes before check
- [x] **DEC-02**: `Decode.discard()` — safely drains and disposes response body; reader cancelled in `finally` to prevent connection leak
- [x] **DEC-03**: `Decode.text()` — returns `string`; empty body → `""`
- [x] **DEC-04**: `Decode.json()` — parses JSON; returns `unknown`; empty body → `decodeError.emptyBody`
- [x] **DEC-05**: `Decode.json(schema)` — parses JSON and validates via `Schema<T>` adapter; type inferred from schema; errors normalized to `DecodeIssue[]`; Zod types never leak into public API
- [x] **DEC-06**: `Decode.bytes()` — returns `Uint8Array`
- [x] **DEC-07**: `Decode.optional(inner)` — zero bytes → `undefined`, otherwise delegates to `inner`
- [x] **DEC-08**: `null` body (204/304/205) and empty-stream body (200 + `Content-Length: 0`) both normalize to zero bytes before any decoder runs

### Response Matching & Decode Dispatch

- [x] **RESP-01**: `ResponseMap` matched in 4-step precedence: request exact → request class → client exact → client class
- [x] **RESP-02**: No `default` matcher — unmatched statuses always surface as `SendResult` `unhandledStatus` variant
- [x] **RESP-03**: `unhandledStatus` result includes `{ status, headers, preview: BodyPreview }`
- [x] **RESP-04**: `decodeError` result includes `{ status, headers, error: DecodeError, preview: BodyPreview }`

### Body Preview

- [x] **PREV-01**: `BodyPreview` reads from `response.body` ReadableStream with a byte cap — NOT via `Response.clone()`; reader cancelled in `finally`
- [x] **PREV-02**: `bodyPreviewBytes` configurable via `client.diagnostics`; defaults to `8192`
- [x] **PREV-03**: `BodyPreview.text` decoded from bytes as UTF-8 with `TextDecoder` in streaming mode (no split codepoints)

### Abort, Deadline & Retry

- [ ] **ADR-01**: Abort — caller-scoped `AbortSignal` passed to `send(request, { signal })`; abort surfaces as `transportError.aborted`
- [ ] **ADR-02**: Deadline — `deadlineMs` covers entire operation: all attempts + backoff sleep + body reading + decoding; expiry is terminal (no retry after deadline)
- [ ] **ADR-03**: Retry attempt count is exactly `maxAttempts - 1` retries (off-by-one prevention: condition is `attempt < maxAttempts`)
- [ ] **ADR-04**: Backoff sleep is abort-aware — deadline or caller abort during sleep surfaces immediately; no `setTimeout` that outlives the signal
- [ ] **ADR-05**: Jitter formula uses a capped range — never produces a delay exceeding `maxBackoffMs`
- [ ] **ADR-06**: Retry never triggers on `decodeError`, `unhandledStatus`, caller `aborted`, or deadline `timeout`
- [ ] **ADR-07**: Default retry policy applies to `GET`/`HEAD` methods on transport failures and 502/503/504 responses

### Typed Matcher

- [x] **MATCH-01**: `Send.match(result, handlers)` — exhaustive match over `SendResult<R>`; missing handler is a compile-time error
- [x] **MATCH-02**: `Send.Matcher<R, T>` — mapped type over `TagsOf<R>` plus `transportError | decodeError | unhandledStatus`; requires all variants
- [x] **MATCH-03**: Handler objects composable with object spread for reuse of partial handler fragments

### Documentation

- [x] **DOC-01**: TSDoc on all public types, functions, and interfaces
- [x] **DOC-02**: README includes real usage examples — at minimum the SPEC example and the three most common patterns
- [x] **DOC-03**: Zod peer dependency declared in `package.json` as `peerDependencies: { "zod": "^3.25.0" }` with `peerDependenciesMeta: { zod: { optional: true } }`

## v2 Requirements

### Streaming

- **STREAM-01**: Streaming request bodies — deferred; retry semantics for non-replayable streams require spec extension
- **STREAM-02**: Streaming response bodies — deferred; no spec coverage yet

### Advanced Request Options

- **OPT-01**: `credentials` option on `ClientSpec` — CORS credential control
- **OPT-02**: `redirect` option on `RequestSpec` — explicit redirect behavior

### Retry Extensions

- **RETRY-01**: `Retry-After` header awareness — deferred; requires response inspection during retry loop

## Out of Scope

| Feature | Reason |
|---------|--------|
| `Body.formData()` (multipart/form-data) | Not in spec; `Body.bytes()` is the escape hatch. Add post-v1 when consumer need is demonstrated. |
| Explicit header/query deletion across merge layers | Not in spec; documented as intentional per spec boundary |
| Valibot schema adapter | `Schema<T>` seam maintained; adapter not shipped until consumer need established |
| Global mutable state / interceptors | Anti-pattern; explicit composition is the design intent |
| Streaming request/response bodies (v1) | Retry semantics for non-replayable streams require spec extension first |
| CJS output | ESM-only is intentional; no CommonJS bundle |
| Context7 / machine-readable API publishing | Not needed for this library's audience |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| TYPES-01 | Phase 2 | Complete |
| TYPES-02 | Phase 2 | Complete |
| TYPES-03 | Phase 2 | Complete |
| TYPES-04 | Phase 2 | Complete |
| TYPES-05 | Phase 2 | Complete |
| TYPES-06 | Phase 2 | Complete |
| TYPES-07 | Phase 2 | Complete |
| TYPES-08 | Phase 2 | Complete |
| REQ-01 | Phase 2 | Complete |
| REQ-02 | Phase 2 | Complete |
| REQ-03 | Phase 2 | Complete |
| REQ-04 | Phase 2 | Complete |
| SEND-01 | Phase 3 | Complete |
| SEND-02 | Phase 3 | Complete |
| SEND-03 | Phase 3 | Complete |
| SEND-04 | Phase 3 | Complete |
| SEND-05 | Phase 3 | Complete |
| SEND-06 | Phase 3 | Complete |
| BODY-01 | Phase 4 | Complete |
| BODY-02 | Phase 4 | Complete |
| BODY-03 | Phase 4 | Complete |
| BODY-04 | Phase 4 | Complete |
| BODY-05 | Phase 4 | Complete |
| DEC-01 | Phase 4 | Complete |
| DEC-02 | Phase 4 | Complete |
| DEC-03 | Phase 4 | Complete |
| DEC-04 | Phase 4 | Complete |
| DEC-05 | Phase 4 | Complete |
| DEC-06 | Phase 4 | Complete |
| DEC-07 | Phase 4 | Complete |
| DEC-08 | Phase 4 | Complete |
| RESP-01 | Phase 5 | Complete |
| RESP-02 | Phase 5 | Complete |
| RESP-03 | Phase 5 | Complete |
| RESP-04 | Phase 5 | Complete |
| PREV-01 | Phase 5 | Complete |
| PREV-02 | Phase 5 | Complete |
| PREV-03 | Phase 5 | Complete |
| ADR-01 | Phase 6 | Pending |
| ADR-02 | Phase 6 | Pending |
| ADR-03 | Phase 6 | Pending |
| ADR-04 | Phase 6 | Pending |
| ADR-05 | Phase 6 | Pending |
| ADR-06 | Phase 6 | Pending |
| ADR-07 | Phase 6 | Pending |
| MATCH-01 | Phase 7 | Complete |
| MATCH-02 | Phase 7 | Complete |
| MATCH-03 | Phase 7 | Complete |
| DOC-01 | Phase 8 | Complete |
| DOC-02 | Phase 8 | Complete |
| DOC-03 | Phase 8 | Complete |

**Coverage:**
- v1 requirements: 53 total
- Mapped to phases: 53
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-11 — Phase 9: Phases 1–4 requirements marked Complete*
