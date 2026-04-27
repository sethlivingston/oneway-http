# Research Summary

**Project:** oneway-http — HTTP client implementation milestone
**Date:** 2026-04-27
**Status:** Ready for requirements and roadmap generation

---

## Executive Summary

`oneway-http` is a brownfield TypeScript ESM library with a working three-target build
(root/browser/node), a Playwright parity matrix across Node + Chromium/Firefox/WebKit, and a
release pipeline — but with placeholder-only source files. The task is to replace those
placeholders with the declarative HTTP client defined in `docs/SPEC.md` without touching the
package shape, export contract, or tooling. The spec is the binding source of truth and
defines a complete, non-negotiable API surface: no intentional MVP deferral is planned.

The recommended approach is fully zero-runtime-dependency: native `fetch`, `AbortController`,
and `URL`/`URLSearchParams` cover all transport needs in Node 22 and all target browsers. Zod
is kept strictly consumer-side via a structural `SchemaLike<T>` duck-type interface. Retry is a
~30-line pure implementation. The only new `devDependencies` are `msw` (fetch-layer mocking,
parity-compatible) and `@arethetypeswrong/cli` (export-map validation). Nine new
runtime-neutral shared modules in `src/` do all the work; the three public entrypoints remain
thin re-export wrappers as they are today.

The highest risks are in the operational-semantics phase: deadline-as-whole-send-budget (not
per-attempt), correct retry exclusions, and response body single-consumption. These pitfalls
are spec-specific, easy to implement incorrectly, and produce silent behavioral violations
rather than compiler errors. They must be addressed with targeted unit tests during the phase
that wires `send()`, not as an afterthought.

---

## Key Findings

### From STACK.md

| Technology | Decision |
|------------|----------|
| `globalThis.fetch` | Only transport layer needed; stable in Node 22 and all Playwright targets |
| `AbortController` / `AbortSignal.any()` | Signal composition for deadline + caller abort; available Node 20.3+ |
| `URL` + `URLSearchParams` | Path-segment encoding and query serialization; no library |
| `SchemaLike<T>` duck type | Structural interface for Zod compatibility; Zod is NOT a lib dependency |
| Retry: pure implementation | Spec semantics (method allow-list, deadline-aware, exclusions) are smaller than any wrapper |
| `msw@2.13.6` (devDep) | Intercepts `fetch` at network layer; `msw/node` and `msw/browser` both supported; parity-harness-compatible |
| `@arethetypeswrong/cli@0.18.2` (devDep) | `attw --pack` validates export map for all three entrypoints before publish |

**Critical version note:** `AbortSignal.any()` requires Node 20.3+ / Chrome 116 / Safari 17.4.
A `combineSignals()` polyfill in `src/shared.ts` is needed if minimum supported versions are
not yet locked.

**Zero new runtime dependencies.** All additions are `devDependencies`.

---

### From FEATURES.md

**Table stakes (must all ship; they form the callable API):**
- `Request.create()` factory with mutual-exclusion validation (`path` xor `absoluteUrl`)
- `Client` factory with `baseUrl`, `headers`, `responses`, `retry`, `deadlineMs`
- Merge rules: case-insensitive header merge, query merge, layered response map, scalar overrides
- `send()` returning `SendResult<R>` union (four variants, never thrown)
- `Body.*` surface: `none`, `json`, `text`, `formUrlEncoded`, `bytes`
- `Decode.*` surface: `none`, `discard`, `text`, `json`, `json(schema)`, `bytes`, `optional`
- Response matching with 5-level precedence (request-exact → request-class → client-exact → client-class → unhandledStatus)
- `TransportError` taxonomy: `aborted`, `timeout`, `network`
- `DecodeError` taxonomy: 6 variants, normalized (no Zod internals in public surface)
- `BodyPreview` on `decodeError` and `unhandledStatus` error paths
- Abort via caller `AbortSignal`; whole-send `deadlineMs` deadline (covers retries + backoff + body read)
- Retry policy: GET/HEAD default, transport + 502/503/504, jittered exponential backoff
- Affine request enforcement at runtime (`_consumed` flag on `HttpRequest`)
- Runtime parity: Node + browser outputs preserved throughout

**Differentiators (also mandatory per spec, but worth calling out):**
- `Send.match()` exhaustive typed matcher with `satisfies Send.Matcher<R, T>` pattern
- No `default` status matcher — unmatched statuses surface explicitly, never swallowed
- `Decode.none()` vs `Decode.discard()` semantic distinction enforced at runtime
- `Decode.optional(inner)` gated on raw byte count, not semantic null/falsy
- `deadlineMs` as whole-operation budget (not per-attempt)
- Layered response-map precedence (request layer always beats client layer)

**Permanently deferred (per spec):**
- Streaming request bodies
- Multipart form bodies (`multipart/form-data`)
- Per-attempt timeouts (distinct from `deadlineMs`)
- Response streaming / incremental body reads
- Cookie jar, session management, HTTP/2 push
- Any feature not in `docs/SPEC.md`

---

### From ARCHITECTURE.md

**Module dependency layers (build order, no circular imports):**

```
Layer 0  src/types.ts              — pure type declarations; no local deps
Layer 1  src/body.ts               — Body.* namespace; eager Uint8Array serialization
         src/decode.ts             — Decode.* namespace; Decoder<T> + .as(tag) pattern
         src/merge.ts              — mergeSpecs() pure function
         src/retry.ts              — defaultRetryPolicy, shouldRetry(), computeBackoffMs()
         src/send-match.ts         — Send.match() exhaustive helper
Layer 2  src/request.ts            — Request.create(); affine _consumed flag; URL build
         src/transport.ts          — attemptFetch(); TransportError mapping; returns raw Response
Layer 3  src/send.ts               — createClient(); send() orchestrator; integrates all above
Layer 4  src/zod-adapter.ts        — optional; Zod → DecodeError.schemaMismatch bridge
Layer 5  src/index.ts / browser.ts / node.ts — thin re-export wrappers; no logic
```

**Key patterns:**
- **Merge before act:** `mergeSpecs()` runs once at `send()` entry; nothing downstream reads raw specs
- **Decoder as value:** Each `Decode.*` factory returns a `Decoder<T>` with `.as(tag)` method; tag drives `Send.match()` handlers
- **Eager body materialization:** `Body.*` serializes to `Uint8Array` at `Request.create()` time, not at send time; enables retry replay without stream rewind
- **Compose signals, don't branch:** `AbortSignal.any([callerSignal, deadlineSignal])` produces a single signal; listeners attached before `fetch()` identify which signal fired
- **Mutually exclusive body consumers:** Preview path and decode path are strict `if/else` branches — never sequential reads on the same `ReadableStream`
- **No runtime detection in shared modules:** No `typeof window`, no `process.*` in any `src/` file except the three entrypoints

**Existing artifacts that do NOT change:**
`package.json` exports, `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts` project matrix

**Existing artifacts that DO change:**
`src/shared.ts` (retire placeholder exports; keep `RuntimeTarget`), entrypoints (widen re-exports), `tests/parity/placeholder-assertions.ts` (replace with real API surface assertions)

---

### From PITFALLS.md

**Top 5 pitfalls — address before or during the phase they appear in:**

| # | Pitfall | Risk | Phase |
|---|---------|------|-------|
| 1 | `deadlineMs` implemented as per-attempt timeout | **Silent wrong behavior** — allows 3× deadline wall time with retries | `send()` + retry wiring |
| 2 | Retrying non-idempotent methods or non-retryable result kinds (`decodeError`, `unhandledStatus`, `aborted`) | **Data mutation / infinite loop** | Retry policy implementation |
| 3 | Premature response body consumption blocks preview or decode | **Runtime crash** (`TypeError: body already used`) | `Decode.*` + `send()` |
| 4 | Header merge is case-sensitive | **Duplicate headers sent to server** | Merge rules implementation |
| 5 | `Decode.none()` and `Decode.discard()` implemented identically | **Contract violation** — server misbehavior silently passes | `Decode.*` implementation |

**Additional critical pitfalls:**
- **Pitfall 6:** `Decode.optional()` gates on semantic null, not raw byte count → test `"null"` (4 bytes) must decode to `null`, not `undefined`
- **Pitfall 7:** Response matching precedence implemented client-first → request layer must always win over client layer, including class vs exact cross-layer
- **Pitfall 8:** `AbortSignal.any()` unavailable in supported runtimes → `combineSignals()` polyfill needed; verify against declared minimum Node/browser versions
- **Pitfall 9:** URL path segment encoding: `encodeURIComponent` per segment is correct; joining first then encoding corrupts slashes
- **Pitfall 10:** `Body.json()` throws on circular refs / BigInt → wrap `JSON.stringify` in try/catch; library must never throw from `send()`

**Moderate pitfalls (plan for these in release / CI phases):**
- Pack-and-install smoke test to catch `dist/` vs source alias divergence (Pitfall 11)
- Neutral root entrypoint can silently load wrong build in non-condition-aware toolchains (Pitfall 12)
- Backoff delay does not check remaining deadline budget before sleeping (Pitfall 13)
- `Send.match()` exhaustiveness not compiler-enforced without deliberate generic typing (Pitfall 14)
- Zod `ZodError.issues` leaking through `DecodeIssue[]` without normalization (Pitfall 15)
- `BodyPreview` reader hanging on slow/stalled streams without abort signal propagation (Pitfall 16)

---

## Implications for Roadmap

The spec is explicit that this is not an MVP-reduced effort — the goal is the full spec-backed
client. The natural implementation order is dictated by the module dependency layers above.
Three phases map cleanly to the feature dependency graph.

---

### Suggested Phase Structure

#### Phase 1 — Core Request/Response Pipeline

**Rationale:** Every other feature depends on `send()` being wired. Build the pure-function
layer first (types, body, decode, merge, URL), then `transport.ts`, then integrate into
`send()` with the happy path and all four result variants. Parity tests for all new exported
symbols go in alongside implementation.

**Delivers:** A callable `createClient().send()` that returns all four `SendResult` variants for
single-attempt, no-retry, no-deadline requests. MSW-backed parity behavior tests across all
four runtime targets.

**Features from FEATURES.md:**
- `Request.create()` + `Body.*`
- `Decode.*` (all variants including `Decode.json(schema)` + Zod adapter)
- Client factory + merge rules
- `send()` happy path: fetch → match → decode → `{ kind: "response" }`
- `unhandledStatus` result path + `BodyPreview`
- `decodeError` result path + `BodyPreview`
- `TransportError` normalization (network errors → structured values)

**Pitfalls to address:**
- Pitfall 3: premature body consumption (decode vs preview are exclusive branches)
- Pitfall 4: case-insensitive header merge
- Pitfall 5: `Decode.none()` vs `Decode.discard()` discriminant tag
- Pitfall 6: `Decode.optional()` byte-count gate
- Pitfall 7: 4-layer ordered response matching (no pre-merge)
- Pitfall 9: per-segment URL encoding
- Pitfall 10: `Body.json()` circular ref guard
- Pitfall 17/18: query array order and `undefined` key filtering

**Research flag:** ✅ Standard patterns well-documented — no phase research needed.

---

#### Phase 2 — Operational Semantics (Abort, Deadline, Retry)

**Rationale:** These features have the highest pitfall density and the most inter-dependency
(deadline + abort + retry loop must be designed together). They are also the hardest to retrofit
into an existing `send()` loop. Build them as a unit after Phase 1 validates the core pipeline.

**Delivers:** Production-ready `send()` with caller abort, whole-send deadline spanning all
attempts, conservative retry with jittered backoff, and affine request enforcement. All
tested against deadline-elapsed and retry-count scenarios in the parity harness.

**Features from FEATURES.md:**
- Abort via caller `AbortSignal`
- `deadlineMs` whole-send deadline (absolute `deadlineAt` timestamp, single `AbortController`)
- Retry policy with defaults (GET/HEAD, transport + 502/503/504, jittered backoff)
- Affine request enforcement (`_consumed` flag; synchronous throw on double-send)

**Pitfalls to address:**
- Pitfall 1: deadline as whole-send budget with absolute `deadlineAt` before first attempt
- Pitfall 2: explicit `isRetryable()` guard with hard exclusions (`aborted`, `timeout`, `decodeError`, `unhandledStatus`, non-idempotent methods)
- Pitfall 8: `AbortSignal.any()` polyfill / compatibility check
- Pitfall 13: check `remainingMs` before each backoff sleep
- Pitfall 16: `BodyPreview` reader uses composed abort signal

**Research flag:** ⚠️ Flag for `/gsd-research-phase` — deadline+abort+retry integration has
significant edge-case complexity (signal race conditions, backoff budget exhaustion, abort
source discrimination). Review implementation patterns before coding.

---

#### Phase 3 — Ergonomics Surface + Release Hardening

**Rationale:** `Send.match()` and `Decode.optional()` are additive ergonomics on top of the
working pipeline. Release hardening (pack smoke test, export-map validation, behavior-level
release gate) prevents publishing a broken or incomplete artifact.

**Delivers:** Fully typed exhaustive `Send.match()` helper with compile-time enforcement,
`Decode.optional()`, `attw --pack` in CI, pack-and-install smoke test, and behavior-level
release gate so placeholder code cannot be published accidentally.

**Features from FEATURES.md:**
- `Send.match()` exhaustive typed matcher with `Send.Matcher<R, T>` generic type
- `Decode.optional(inner)`
- `@arethetypeswrong/cli` (`attw --pack`) in `verify` script
- Release workflow gate: at least one behavior-level test must pass before publish

**Pitfalls to address:**
- Pitfall 14: invest in `Send.Matcher<R>` generic; add `@ts-expect-error` type-level tests
- Pitfall 15: `normalizeZodIssues()` adapter; verify no Zod types in public `DecodeIssue`
- Pitfall 11: pack-and-install smoke test (`npm pack` → temp dir → node import assertions)
- Pitfall 12: neutral root entrypoint guard or loud failure for non-condition-aware resolvers
- Pitfall 20: behavior-level release gate (assert `Request.create`, `createClient` exist and are callable)

**Research flag:** ⚠️ Flag for `/gsd-research-phase` for `Send.match()` TypeScript generic design
— extracting response tag unions from a generic `ResponseMap` type is non-trivial and benefits
from pattern research before implementation.

---

### Feature/Phase Mapping Summary

| Feature Group | Phase |
|---------------|-------|
| Types, URL construction, query/header merge | Phase 1 |
| `Body.*`, `Decode.*`, Zod adapter | Phase 1 |
| `Request.create()`, `Client` factory, `send()` pipeline | Phase 1 |
| All four `SendResult` variants, `BodyPreview` | Phase 1 |
| MSW parity behavior tests | Phase 1 |
| `AbortSignal` + `deadlineMs` | Phase 2 |
| Retry policy + backoff + affine enforcement | Phase 2 |
| `Send.match()` + `Decode.optional()` | Phase 3 |
| `attw --pack`, smoke test, release gate | Phase 3 |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack (transport, schema, retry) | HIGH | All claims verified against npm registry, Node.js docs, WHATWG Fetch Standard |
| Features (table stakes, anti-features) | HIGH | Derived directly from `docs/SPEC.md` — primary source of truth |
| Architecture (module layout, patterns) | HIGH | Consistent with existing codebase structure; no speculative decisions |
| Pitfalls (critical + moderate) | HIGH | Derived from spec rules + known JS fetch/stream/signal constraints; RFC-backed where applicable |
| `AbortSignal.any()` compatibility floor | MEDIUM | Node 20.3+/Chrome 116/Safari 17.4 confirmed; minimum supported versions not yet declared in repo |
| `Send.match()` TypeScript generics | MEDIUM | Pattern is clear conceptually; exact generic formulation needs prototyping |

**Overall: HIGH** — all four research areas agree on the approach; no contradictions between files.

---

## Gaps to Address During Planning

1. **Minimum supported Node/browser versions not declared.** The `engines` field in `package.json`
   and README target section are unpopulated. Must be declared before Phase 2 (`AbortSignal.any()`
   compatibility decision depends on this).

2. **`AbortSignal.any()` polyfill decision.** If minimum Node < 20.3 or Safari < 17.4 are
   targeted, a `combineSignals()` helper is required in Phase 2. If Node 22 is the floor (repo
   uses Node 22 in CI), polyfill may be unnecessary — but must be confirmed.

3. **`Send.match()` generic shape.** The exact TypeScript formulation for extracting response
   tag unions from a generic `ResponseMap` is not yet prototyped. Flag for Phase 3 research.

4. **`Decode.json()` without schema return type.** `Decode.json()` (no schema argument) returns
   `unknown`. The spec is clear on this, but consumers will need documentation guidance to avoid
   unsafe casts. Address in README/JSDoc during Phase 3.

5. **`src/index.ts` neutral build behavior.** CONCERNS.md documents a known issue: the neutral
   root build can silently load browser behavior in Node under non-condition-aware toolchains.
   Whether to add a runtime guard or accept the documented limitation needs a decision before
   Phase 1 ships.

---

## Aggregated Sources

- `docs/SPEC.md` — primary behavioral specification (HIGH confidence)
- `.planning/PROJECT.md` — scope constraints and active requirements (HIGH confidence)
- `.planning/codebase/STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `CONCERNS.md`, `TESTING.md` — existing codebase context (HIGH confidence)
- npm registry: `msw@2.13.6`, `@arethetypeswrong/cli@0.18.2`, `zod@4.3.6` — verified 2026-04-27
- Context7 (`/mswjs/msw`): `setupServer` (Node) and `setupWorker` (browser) patterns — HIGH confidence
- Node.js docs: `AbortSignal.any()` since Node 20.3.0; `fetch` stable since Node 21 — HIGH confidence
- WHATWG Fetch Standard: `fetch`, `AbortController`, `AbortSignal.timeout()` — HIGH confidence
- RFC 7230 §3.2 (header case-insensitivity), RFC 3986 §3.3 (path segment encoding) — MEDIUM confidence

---

*Synthesized: 2026-04-27*
