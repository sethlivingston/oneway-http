# Requirements: oneway-http

**Defined:** 2026-04-27
**Core Value:** Provide a strict, explicit HTTP client that keeps consumers from having to manually manage transport semantics, status handling, and body decoding while staying consistent across Node and browsers.

## v1 Requirements

### Request Authoring

- [ ] **RQST-01**: Caller can create a request with a segment-based `path` that is encoded per segment and resolved against the client `baseUrl`
- [ ] **RQST-02**: Caller can create a request with an `absoluteUrl` that bypasses the client `baseUrl`
- [ ] **RQST-03**: Caller gets explicit validation when request creation receives an invalid spec, including missing or conflicting `path`/`absoluteUrl` selectors and unsupported query values such as `null`
- [ ] **RQST-04**: Caller can provide query params as a plain object where `undefined` omits a key and arrays serialize as repeated keys in order
- [ ] **RQST-05**: Caller can provide headers as a plain object and have request-level values merge over client defaults case-insensitively

### Client Defaults

- [ ] **CLNT-01**: Caller can create a client with shared defaults for `baseUrl`, `headers`, `responses`, `retry`, and `deadlineMs`
- [ ] **CLNT-02**: Caller can override client scalar defaults per request while request retry policy replaces the client retry policy
- [ ] **CLNT-03**: Caller can configure client-level diagnostics `bodyPreviewBytes`, defaulting to `8192`
- [ ] **CLNT-04**: Caller can define shared client response cases that request-local response cases can override

### Request Bodies

- [ ] **BODY-01**: Caller can send requests with no body via `Body.none()`
- [ ] **BODY-02**: Caller can send JSON request bodies via `Body.json(value)` with UTF-8 encoding and default `application/json` when not already set
- [ ] **BODY-03**: Caller can send text request bodies via `Body.text(value, contentType?)` with UTF-8 encoding and default `text/plain; charset=utf-8`
- [ ] **BODY-04**: Caller can send `application/x-www-form-urlencoded` request bodies with repeated keys via `Body.formUrlEncoded(entries)`
- [ ] **BODY-05**: Caller can send raw binary request bodies via `Body.bytes(bytes, contentType?)`

### Response Decoding

- [ ] **DECD-01**: Caller can declare strict empty-body responses via `Decode.none()`, which returns a decode error if any bytes are present
- [ ] **DECD-02**: Caller can discard a response body via `Decode.discard()` without exposing a decoded value
- [ ] **DECD-03**: Caller can decode text responses via `Decode.text()`
- [ ] **DECD-04**: Caller can decode JSON responses to `unknown` via `Decode.json()`
- [ ] **DECD-05**: Caller can decode JSON responses against a schema `parse`-like validator via `Decode.json(schema)` and receive normalized schema mismatch issues rather than library-specific error objects
- [ ] **DECD-06**: Caller can decode raw response bytes via `Decode.bytes()`
- [ ] **DECD-07**: Caller can use `Decode.optional(inner)` so exactly zero-byte bodies return `undefined` and non-empty bodies run `inner`

### Sending & Results

- [ ] **SEND-01**: Caller can send a request and receive `{ kind: "response" }` when a response status matches and decodes successfully
- [ ] **SEND-02**: Caller receives `{ kind: "transportError" }` for `aborted`, `timeout`, and `network` failures instead of thrown transport exceptions
- [ ] **SEND-03**: Caller receives `{ kind: "decodeError" }` with `status`, `headers`, normalized `error`, and `preview` when matched decoding fails
- [ ] **SEND-04**: Caller receives `{ kind: "unhandledStatus" }` with `status`, `headers`, and `preview` when no response case matches
- [ ] **SEND-05**: Caller can match response cases by exact status code and status class matcher
- [ ] **SEND-06**: Caller gets response matching precedence in the order request exact → request class → client exact → client class → `unhandledStatus`

### Operational Semantics

- [ ] **OPER-01**: Caller can cancel a `send()` invocation with an invocation-scoped `AbortSignal`
- [ ] **OPER-02**: Caller can apply `deadlineMs` as a whole-send deadline covering retries, backoff, response waiting, body reading, and decoding
- [ ] **OPER-03**: Caller gets conservative default retries for `GET` and `HEAD` transport failures plus `502`, `503`, and `504` responses with bounded exponential jittered backoff
- [ ] **OPER-04**: Caller cannot send the same request twice once `send()` has begun, even when the request body is replayable

### Matching Ergonomics

- [ ] **MTCH-01**: Caller can tag successful decoded response cases with `.as(tag)` for semantic matching
- [ ] **MTCH-02**: Caller can use `Send.match(result, handlers)` to exhaustively handle tagged success cases plus `transportError`, `decodeError`, and `unhandledStatus`, with reusable handler fragments composed by object spread

### Release Hardening

- [ ] **RELS-01**: Maintainer can verify library behavior across Node, Chromium, Firefox, and WebKit before release
- [ ] **RELS-02**: Maintainer can validate publishable artifacts, export-map correctness, and release workflow hardening before publishing

## v2 Requirements

None currently. This milestone targets full coverage of the current spec, and future requirements should be added only after the spec evolves or real app usage reveals new needs.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Streaming request bodies | Explicitly excluded by `docs/SPEC.md` for v1 |
| Multipart form uploads | Not part of the current spec surface |
| Response streaming or incremental body reads | The current design materializes decoded results instead of exposing stream consumers |
| Per-attempt timeouts separate from `deadlineMs` | The spec defines `deadlineMs` as a whole-send budget instead |
| Cookie jar or session-management features | Not part of the current library goal |
| Hidden default handlers or `default` status matcher behavior | The spec requires unmatched statuses to surface explicitly |
| Fetch-style implicit body inference or exception-driven HTTP semantics | Directly opposed to the core design of the library |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RQST-01 | TBD | Pending |
| RQST-02 | TBD | Pending |
| RQST-03 | TBD | Pending |
| RQST-04 | TBD | Pending |
| RQST-05 | TBD | Pending |
| CLNT-01 | TBD | Pending |
| CLNT-02 | TBD | Pending |
| CLNT-03 | TBD | Pending |
| CLNT-04 | TBD | Pending |
| BODY-01 | TBD | Pending |
| BODY-02 | TBD | Pending |
| BODY-03 | TBD | Pending |
| BODY-04 | TBD | Pending |
| BODY-05 | TBD | Pending |
| DECD-01 | TBD | Pending |
| DECD-02 | TBD | Pending |
| DECD-03 | TBD | Pending |
| DECD-04 | TBD | Pending |
| DECD-05 | TBD | Pending |
| DECD-06 | TBD | Pending |
| DECD-07 | TBD | Pending |
| SEND-01 | TBD | Pending |
| SEND-02 | TBD | Pending |
| SEND-03 | TBD | Pending |
| SEND-04 | TBD | Pending |
| SEND-05 | TBD | Pending |
| SEND-06 | TBD | Pending |
| OPER-01 | TBD | Pending |
| OPER-02 | TBD | Pending |
| OPER-03 | TBD | Pending |
| OPER-04 | TBD | Pending |
| MTCH-01 | TBD | Pending |
| MTCH-02 | TBD | Pending |
| RELS-01 | TBD | Pending |
| RELS-02 | TBD | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 0
- Unmapped: 35 ⚠️

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 after initial definition*
