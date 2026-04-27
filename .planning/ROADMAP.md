# Roadmap: oneway-http

## Overview

Replace the placeholder `src/` with the full declarative HTTP client defined in `docs/SPEC.md`.
Phase 1 builds the complete synchronous request/response pipeline — every `Body.*`, `Decode.*`,
client factory, merge rule, and all four `SendResult` variants — verified across Node and browser
targets via MSW-backed parity tests. Phase 2 adds the production operational layer: abort,
whole-send deadline, retry with jittered backoff, and affine request enforcement. Phase 3 closes
the surface with `Send.match()`, `Decode.optional()`, and the release hardening gates that ensure
nothing placeholder can be published.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Request/Response Pipeline** - Callable `createClient().send()` returning all four `SendResult` variants; complete `Body.*`, `Decode.*`, merge rules, and MSW parity coverage
- [ ] **Phase 2: Operational Semantics** - Production `send()` with caller abort, whole-send deadline, conservative retry with jittered backoff, and affine request enforcement
- [ ] **Phase 3: Ergonomics & Release** - `Send.match()`, `Decode.optional()`, `attw --pack` export-map validation, and release hardening gate

## Phase Details

### Phase 1: Core Request/Response Pipeline
**Goal**: Callers can issue requests and receive all four structured result variants from a working `send()` pipeline, with complete `Body.*` and `Decode.*` surfaces, client defaults and merge rules, and cross-runtime parity verification
**Depends on**: Nothing (first phase)
**Requirements**: RQST-01, RQST-02, RQST-03, RQST-04, RQST-05, CLNT-01, CLNT-02, CLNT-03, CLNT-04, BODY-01, BODY-02, BODY-03, BODY-04, BODY-05, DECD-01, DECD-02, DECD-03, DECD-04, DECD-05, DECD-06, SEND-01, SEND-02, SEND-03, SEND-04, SEND-05, SEND-06
**Success Criteria** (what must be TRUE):
  1. Caller can create a request with `path` (per-segment encoded, resolved against `baseUrl`) or `absoluteUrl`, with query params (`undefined` omits, arrays repeat), and headers that merge case-insensitively over client defaults — and receives explicit validation errors for invalid specs
  2. Caller can create a client with shared defaults, send a request using any `Body.*` variant, declare response cases using any `Decode.*` variant (none, discard, text, json, json+schema, bytes), and receive `{ kind: "response" }` with the decoded value
  3. Caller receives `{ kind: "unhandledStatus" }` with `status`, `headers`, and `preview` when no request-local or client-level response case matches, following the 5-level precedence order (request-exact → request-class → client-exact → client-class → unhandledStatus)
  4. Caller receives `{ kind: "decodeError" }` with `status`, `headers`, normalized error, and preview when a matched status fails decoding — and `{ kind: "transportError" }` for network failures — neither variant throws
  5. All four `SendResult` variants and all `Body.*`/`Decode.*` factories produce correct, consistent behavior in Node, Chromium, Firefox, and WebKit via the MSW-backed parity harness
**Plans**: TBD

### Phase 2: Operational Semantics
**Goal**: `send()` is production-ready with caller abort, a whole-send deadline that spans all retry attempts and backoff, conservative retry policy, and affine request enforcement that prevents double-sends
**Depends on**: Phase 1
**Requirements**: OPER-01, OPER-02, OPER-03, OPER-04
**Success Criteria** (what must be TRUE):
  1. Caller can pass an `AbortSignal` to `send()` and receive `{ kind: "transportError", subkind: "aborted" }` promptly without a thrown exception
  2. Caller can set `deadlineMs` and have the entire operation — all retry attempts, backoff sleeps, response wait, body read, and decoding — complete within that budget; exceeding the budget produces `{ kind: "transportError", subkind: "timeout" }` rather than hanging
  3. GET and HEAD requests automatically retry transport failures and `502`/`503`/`504` responses with jittered exponential backoff, capped by the remaining deadline budget; non-idempotent methods and `decodeError`/`unhandledStatus`/`aborted` results are never retried
  4. Calling `send()` on a request that has already begun executing throws synchronously, regardless of whether the body is replayable
**Plans**: TBD

### Phase 3: Ergonomics & Release
**Goal**: The library is ergonomic to consume via `Send.match()`, supports `Decode.optional()` with correct byte-count semantics, and is safe to publish with export-map validation and a behavior-level release gate
**Depends on**: Phase 2
**Requirements**: DECD-07, MTCH-01, MTCH-02, RELS-01, RELS-02
**Success Criteria** (what must be TRUE):
  1. Caller can use `Send.match(result, handlers)` to exhaustively handle all tagged success cases (via `.as(tag)`) plus `transportError`, `decodeError`, and `unhandledStatus`; TypeScript enforces exhaustiveness at compile time and handler fragments can be composed via object spread
  2. Caller can use `Decode.optional(inner)` and receive `undefined` for exactly zero-byte bodies while non-empty bodies (including `"null"`) run the inner decoder and return its result
  3. Maintainer can run `attw --pack` against the built package and have it validate all three export-map entrypoints (root, `browser`, `node`) before publish
  4. Maintainer can run the full cross-runtime parity suite (Node, Chromium, Firefox, WebKit) in CI with placeholder assertions replaced by real API surface behavior tests, providing a behavior-level gate that prevents publishing an incomplete artifact
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Request/Response Pipeline | 0/TBD | Not started | - |
| 2. Operational Semantics | 0/TBD | Not started | - |
| 3. Ergonomics & Release | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-27*
*Granularity: standard (3 phases — derived from module dependency layers)*
*Coverage: 35/35 v1 requirements mapped*
