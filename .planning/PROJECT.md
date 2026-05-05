# oneway-http

## What This Is

A declarative TypeScript HTTP client for Node.js and browsers. The caller builds a meaningful request specification, passes it to `send()`, and receives a structured result union — no exceptions for HTTP status codes, no manual body consumption, no guessing about encoding.

Designed to be explicit, truthful, and ergonomic: every transport failure, decode failure, and unmatched status surfaces as a typed value the caller can pattern-match against.

## Core Value

Give callers a complete, structured result for every HTTP interaction — including transport failures, decode failures, and unmatched statuses — with no thrown exceptions and no runtime surprises across browsers and Node.

## Requirements

### Validated

<!-- Existing infrastructure shipped and relied upon. -->

- ✓ Three-target ESM build system (browser/node/neutral) via tsup — existing
- ✓ Conditional package exports with sub-path exports (`/browser`, `/node`) — existing
- ✓ Cross-runtime parity test harness (Vitest + Playwright, Node/Chromium/Firefox/WebKit) — existing
- ✓ Zero-dependency library structure — existing
- ✓ Full CI/CD pipeline with npm provenance publishing — existing

### Active

<!-- Full implementation of docs/SPEC.md. All are hypotheses until shipped and validated. -->

**Transport & Core Send**
- [ ] `send()` function — executes a request against a client, returns `SendResult<R>`
- [ ] `createClient()` — constructs a client with shared defaults (`baseUrl`, `headers`, `responses`, `retry`, `deadlineMs`, `diagnostics`)
- [ ] Merge rules — `headers`/`query` merge case-insensitively, `responses` layer with request-over-client precedence, scalar policies override

**Request Model**
- [ ] `Request.create()` — builds a `RequestSpec` value from `method`, `path`/`absoluteUrl`, `query`, `headers`, `body`, `responses`, `retry`, `deadlineMs`
- [ ] Path resolution — segment-based, each segment encoded separately, joined with `/`, resolved against `baseUrl`
- [ ] Query construction — plain object, `undefined` omits key, arrays become repeated keys, numbers/booleans stringified
- [ ] Affine enforcement — `Request` consumed once `send()` begins; consumed request must not be sent again

**Response Matching**
- [ ] `ResponseMap` — maps `StatusMatcher` (`number | "1xx"|"2xx"|"3xx"|"4xx"|"5xx"`) to decode+tag pairs
- [ ] Matching precedence — request exact → request class → client exact → client class → `unhandledStatus`
- [ ] No `default` matcher — unmatched statuses always surface as `unhandledStatus`

**SendResult Union**
- [ ] `{ kind: "response"; response: R }` — matched and decoded successfully
- [ ] `{ kind: "transportError"; error: TransportError }` — `aborted | timeout | network`
- [ ] `{ kind: "decodeError"; status; headers; error: DecodeError; preview: BodyPreview }` — matched but decode failed
- [ ] `{ kind: "unhandledStatus"; status; headers; preview: BodyPreview }` — no match found

**Body Producers**
- [ ] `Body.none()` — no request body
- [ ] `Body.json(value)` — `JSON.stringify`, UTF-8, sets `content-type: application/json`
- [ ] `Body.text(value, contentType?)` — UTF-8, defaults to `text/plain; charset=utf-8`
- [ ] `Body.formUrlEncoded(entries)` — `application/x-www-form-urlencoded`, supports repeated keys
- [ ] `Body.bytes(bytes, contentType?)` — raw binary

**Body Decoders**
- [ ] `Decode.none()` — strict emptiness; any bytes → `decodeError.unexpectedBody`
- [ ] `Decode.discard()` — safely disposes body without exposing value
- [ ] `Decode.text()` — returns `string`; empty body → `""`
- [ ] `Decode.json()` — parses JSON; returns `unknown`; empty body → `decodeError.emptyBody`
- [ ] `Decode.json(schema)` — parses JSON + validates via Zod schema adapter; normalized `DecodeIssue[]`
- [ ] `Decode.bytes()` — returns `Uint8Array`
- [ ] `Decode.optional(inner)` — zero bytes → `undefined`, otherwise runs `inner`

**Abort, Deadline, Retry**
- [ ] Abort — invocation-scoped `{ signal }` passed to `client.send(request, { signal })`
- [ ] Deadline — whole-operation `deadlineMs` covering all attempts, backoff, body reading, and decoding; expiry is terminal
- [ ] `AbortSignal.any()` — combines caller signal + deadline controller internally
- [ ] Retry — default policy for `GET`/`HEAD`, transport failures, retryable upstream statuses (502/503/504); exponential jittered backoff; never retries abort/decodeError/unhandledStatus

**Body Preview**
- [ ] `BodyPreview` — `{ text, bytesRead, truncated }` — first N bytes of response body
- [ ] `bodyPreviewBytes` configurable via `client.diagnostics`; defaults to `8192`

**Decode Errors**
- [ ] `DecodeError` union — `unexpectedBody | emptyBody | invalidJson | schemaMismatch | bodyReadFailed | custom`
- [ ] `DecodeIssue[]` — `{ path, message, code? }` — normalized, not Zod-specific

**Schema Adapter (Zod)**
- [ ] Zod as peer dependency; `zod` added as devDependency in the package
- [ ] Schema adapter interface — thin enough that Valibot swap remains possible
- [ ] Zod errors normalized to `DecodeIssue[]`

**Typed Matcher**
- [ ] `Send.match(result, handlers)` — exhaustive match over `SendResult`
- [ ] `Send.Matcher<R, T>` — TypeScript type for handler objects; exhaustiveness enforced at type level
- [ ] Reusable handler fragments composable with object spread

**Infrastructure Fixes**
- [ ] Neutral entrypoint fixed — `src/index.ts` must not hardcode `runtimeTarget: "browser"`; correct runtime detection by v1
- [ ] `tsconfig.json` `ignoreDeprecations` resolved — migrate `module`/`moduleResolution` away from deprecated `NodeNext` to TypeScript 6 recommended replacement

**Documentation**
- [ ] TSDoc on all public types, functions, and interfaces
- [ ] README with real usage examples (mirrors SPEC example + common patterns)

### Out of Scope

- Streaming request bodies — explicitly excluded in v1 per spec
- Explicit header/query deletion across merge layers — not in this version per spec
- Valibot adapter — thin seam maintained but adapter not shipped until consumer need is established
- Context7 or machine-readable API publishing — not needed

## Context

- `docs/SPEC.md` is the sole behavioral source of truth. No behavior should be implemented that contradicts or extends it without updating the spec first.
- The parity test harness (`tests/parity/`) verifies entrypoint routing and surface shape. Behavioral tests for the HTTP client will live in `tests/` alongside it.
- Zod is used for `Decode.json(schema)` but error shapes must be normalized — Zod types must not leak into the public API.
- The published package is ESM-only; consumers must use an ESM-capable environment.
- Fully documented and accurate enough for AI agents to use the library correctly from types and README alone.

## Constraints

- **Dependencies**: Zero runtime dependencies — Zod is a peer dependency
- **Module format**: ESM-only output; no CJS
- **TypeScript**: Strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
- **Runtimes**: Must work correctly in browsers (Chromium/Firefox/WebKit) and Node.js 24+
- **Compatibility**: `AbortSignal.any()` requires Node 20.3+ (currently pinned at 24 in CI/engines)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `docs/SPEC.md` is sole behavioral source of truth | Prevents spec drift; single place to resolve ambiguity | — Pending |
| Zero runtime dependencies | Library should not impose transitive deps on consumers | — Pending |
| Zod as peer dependency | Consumers control their Zod version; avoids version conflicts | — Pending |
| Existing build/test infrastructure preserved as-is | Parity harness and conditional exports are correct; implementation builds on top | — Pending |
| No MVP trimming — full spec is v1 | Library is for personal use; better to do it right once | — Pending |
| Documentation targets AI agent usability | TSDoc + README examples sufficient; no Context7 publishing needed | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-04 after initialization*
