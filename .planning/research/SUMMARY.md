# Project Research Summary

**Project:** oneway-http (`@sethlivingston/oneway-http`)
**Domain:** TypeScript ESM HTTP client library (browser + Node.js)
**Researched:** 2026-05-04
**Confidence:** HIGH — all four research areas verified against official sources and live Node.js 24 execution

---

## Executive Summary

`oneway-http` is a brownfield TypeScript ESM HTTP client library with a complete build scaffold, CI, and parity test harness — but zero HTTP implementation. The sole behavioral source of truth is `docs/SPEC.md` (491 lines). The implementation work is entirely greenfield inside an already-wired shell. All four research areas (stack, features, architecture, pitfalls) converge on a single strong recommendation: **implement exactly what the spec says, in dependency order, against the native `fetch` API, with no cross-runtime transport layer.**

The library's core value proposition is provably unique in the ecosystem: no competitor combines result-union error handling (no throws), per-status typed decoding, whole-operation deadlines, and an exhaustive compile-time matcher. Every competing library (ky, axios, wretch, got, ofetch) throws for non-2xx responses and treats response body as a single untyped thing. This is a real differentiator, not marketing copy. The implementation risk is not novelty — the patterns are well-understood — it is **precision**: 14 verified pitfalls spread across retry logic, signal handling, body stream management, type system strict-mode constraints, and the Zod adapter seam. Every one of these pitfalls has a prevention recipe (see PITFALLS.md) and most reduce to a single-line fix. None require architectural redesign if caught early.

The recommended approach is an 8-phase implementation that builds in strict dependency order: infrastructure fixes first (tsconfig, Vitest aliases), then the type foundation, then the request model, then transport, then body decoding, then response matching, then retry/deadline, then the typed matcher, and finally documentation polish. The biggest risk mitigation is **fixing the tsconfig and Vitest source aliases in Phase 1** — every subsequent phase benefits from a correct type-checking environment and fast iteration loop. The second-biggest risk is **the three independent retry bugs** (off-by-one, abort during backoff, jitter overflow) which must all be prevented simultaneously in Phase 6; they are individually subtle but collectively well-documented.

---

## Key Findings

### Recommended Stack

The existing scaffold is architecturally correct and requires only one set of fixes: the `tsconfig.json`. Everything else (tsup three-platform build, Vitest + Playwright parity tests, ESLint with `import-x`, ESM conditional exports) is right. Do not change the build system.

**Core technologies:**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | `^6.0.3` | Type-checking only (`noEmit: true`) | Already in use; must migrate tsconfig to `module: Preserve` + `moduleResolution: Bundler` |
| tsup | `^8.5.1` | Build (actual emit), three platforms | Three-entry config (neutral/browser/node) is the canonical conditional-export pattern |
| Node.js native `fetch` | Built-in (undici 6.24.x) | HTTP transport | Non-experimental since Node 21; spec-identical to browser fetch; no wrapper needed |
| Zod | `^3.25.0` (peer, optional) | Schema validation via `Decode.json(schema)` | Peer dep keeps consumers in control; library normalises to `DecodeIssue[]`; Zod types never leak |
| Vitest + `@vitest/browser-playwright` | `^4.1.5` | Cross-runtime parity tests | Already in use; fix source aliases to remove dist dependency |

**Critical tsconfig correction:**

`module: NodeNext` is **not deprecated** in TypeScript 6. The current tsconfig uses `ignoreDeprecations: "6.0"` solely because `baseUrl: "."` is deprecated. The correct migration:

```jsonc
// Remove: baseUrl, ignoreDeprecations
// Change: module → "Preserve", moduleResolution → "Bundler"
// Keep: paths (all values are already relative ./src/... — no baseUrl needed)
```

`module: Preserve` + `moduleResolution: Bundler` is the canonical pairing for tsup/esbuild projects. It tells TypeScript to check modules the way esbuild actually resolves them, not the way Node.js ESM requires them. `verbatimModuleSyntax: true` is fully compatible with this migration.

**See:** `STACK.md` §Q1, §Q2, §Q3, §Q4, §Q5

---

### Expected Features

All v1 features are fully specified in `docs/SPEC.md`. Research confirms the spec is complete and coherent. No trimming is needed.

**Must have — table stakes (all covered by spec):**
- All HTTP methods, custom headers, query parameters
- JSON / text / form-URL-encoded / binary request bodies
- JSON / text / binary / discard / none / optional response decoding
- Base URL + client defaults, per-request timeout (deadline), abort/cancellation
- Retry with exponential jittered backoff
- Full TypeScript support (strict mode, `exactOptionalPropertyTypes`)
- Cross-platform browser + Node.js

**Should have — differentiators (all covered by spec, none by any competitor):**
- `SendResult<R>` union — `send()` never throws; all outcomes are typed return values
- Per-status typed decoding via `ResponseMap` — 200 returns `UserList`, 304 returns `void`, etc.
- Affine request enforcement — runtime error if a consumed request is re-sent
- `Decode.json(schema)` with Zod peer dep — type inferred from schema, errors normalized to `DecodeIssue[]`
- `Send.match()` exhaustive matcher — missing a handler is a compile-time error
- Whole-operation deadline (covers all retries + backoff + body read + decode)
- No interceptors, no global mutable state — explicit composition only

**One notable table-stakes gap:**
- `Body.formData()` (multipart/form-data) — not in spec. `Body.bytes()` is the escape hatch. Add post-v1 when consumer need is demonstrated.

**Defer to v1.x:**
- `credentials` option on `ClientSpec`
- `redirect` option on `RequestSpec`
- Valibot schema adapter (seam is clean; swap only `decode.ts` internals)

**Defer to v2+:**
- Streaming request/response bodies (retry semantics for non-replayable streams requires spec work)
- `Retry-After` header awareness

**See:** `FEATURES.md` §Table Stakes, §Differentiators, §Anti-Features, §MVP Definition

---

### Architecture Approach

The architecture is a flat 9-file `src/` directory with strict dependency ordering: `types.ts` imports nothing; all other modules import from `types.ts` but not from each other in cycles; `send.ts` is the only orchestrator. No platform-specific transport code is needed — Node 24 native `fetch` is spec-identical to browser `fetch`. The three entrypoints (`index.ts`, `browser.ts`, `node.ts`) are pure re-export files that differ only in `runtimeTarget`.

**Major components:**

| Component | File | Responsibility |
|-----------|------|----------------|
| Types | `src/types.ts` | All shared type definitions — zero logic, zero imports |
| Body | `src/body.ts` | `Body.*` producer namespace + opaque `Body` type |
| Decode | `src/decode.ts` | `Decode.*` builder namespace + `Schema<T>` duck-type interface + Zod normalization |
| Request | `src/request.ts` | `Request` class with `#consumed` private field; `Request.create()` |
| Response Matching | `src/response-matching.ts` | Pure `matchResponse(status, reqMap, clientMap)` — 4-step precedence algorithm |
| Send | `src/send.ts` | Execution engine: retry loop, deadline controller, `AbortSignal.any()`, transport call |
| Client | `src/client.ts` | `createClient()` + layer merge rules |
| Matcher | `src/matcher.ts` | `Send.match()` + `Send.Matcher<R,T>` mapped type |
| Entrypoints | `src/index.ts`, `src/browser.ts`, `src/node.ts` | Re-exports + `runtimeTarget`; no logic |

**Key architectural patterns:**
1. **`Request` uses JS private fields (`#consumed`, `#spec`)** — true runtime inaccessibility; `Symbol.for()` would defeat affine protection
2. **`ResponsesOf<M>` generic threading** — `R` flows `Request<R>` → `SendResult<R>` → `Send.Matcher<R,T>` without user annotations
3. **`Schema<T>` structural duck-typing** — Zod satisfies it structurally; no Zod import in library runtime code
4. **Match then decode in two phases** — status matching is pure lookup; body is a stream read once; preview captured only on decode failure
5. **Both `ResponseMap` layers passed separately** — never pre-merged; 4-step lookup preserves layer precedence

**Known bug to fix in Phase 1:** `src/index.ts` hardcodes `runtimeTarget: "browser"`. Must use runtime detection (`typeof process !== "undefined" && ...`).

**See:** `ARCHITECTURE.md` §Component Responsibilities, §Patterns 1-5, §Data Flow, §Anti-Patterns

---

### Critical Pitfalls

14 pitfalls identified, all verified live on Node.js 24. Grouped by phase impact:

**Phase 1 — Infrastructure:**
1. **Vitest tests silently exercise stale dist** — fix with `resolve.alias` in `vitest.config.ts` mapping package name to `./src/*.ts`; eliminates dist dependency for dev iteration
2. **`.js` extension omitted on relative imports** — with `moduleResolution: Bundler`, TypeScript is permissive; add `import-x/extensions` ESLint rule; missing extensions cause runtime `ERR_MODULE_NOT_FOUND`

**Phase 2 — Request model:**
3. **`exactOptionalPropertyTypes` + object spread corrupts header merge** — `{ ...clientHeaders, ...{ accept: undefined } }` produces `{ accept: undefined }`, not `{ accept: "application/json" }`; use explicit `undefined`-filtering merge function with case-insensitive key normalization

**Phase 3 — Transport:**
4. **`AbortSignal.any()` reason classification** — deadline controller must abort with `DOMException("...", "TimeoutError")`, not a plain `AbortError`; fetch throws `signal.reason` directly; classify by `error.name`: `"TimeoutError"` → timeout, `"AbortError"` → aborted, else → network
5. **Do not use `AbortSignal.timeout()` for deadline** — cannot `clearTimeout()` it; use `new AbortController()` + `setTimeout()` + `finally { clearTimeout(...) }` pattern

**Phase 4 — Body decoders:**
6. **`null` body vs empty stream are distinct fetch states** — `204/304/205` → `response.body === null`; `200 + Content-Length: 0` → non-null stream that reads 0 bytes; normalize both to `Uint8Array(0)` before any decoder runs
7. **Partial body read leaks connection** — preview reads N bytes via `getReader()`; `finally { reader.cancel() }` is non-negotiable; `bodyUsed` stays `false` until cancel; confirmed to exhaust connection pool under load
8. **`Decode.discard()` — cancel, not drain** — `response.body.cancel()` is correct; drain wastes memory on large bodies; null-guard required (`body !== null`) for 204/304
9. **`noUncheckedIndexedAccess` does not narrow after length checks** — `arr[i]` is `number | undefined` even after `if (arr.length > i)`; use `.at(i) ?? fallback` or `arr[i]!` with explicit guard; never spread `Uint8Array` to `Array<number>`
10. **`TextDecoder` with `fatal: true` crashes preview** — truncation at mid-byte-sequence throws; always use `{ fatal: false }` for best-effort preview; `\uFFFD` at boundary is expected and documented

**Phase 6 — Retry + Deadline:**
11. **Retry off-by-one** — `retry <= maxAttempts` sends `maxAttempts + 1` requests; use `attempt < maxAttempts` with 0-based indexing; test with request-counting mock server
12. **Abort during backoff sleep ignores signal** — naïve `setTimeout` doesn't respect `AbortSignal`; use `sleepWithAbort(ms, signal)` that rejects immediately when signal fires during sleep
13. **Jitter backoff without cap overflows** — `base * 2^attempt` hits `1.15e18` at attempt 60; `setTimeout(callback, 1.15e18)` effectively never fires; always `Math.min(cap, base * Math.pow(2, attempt))` before randomizing; default cap 30 s

**Phase 5 — Schema adapter:**
14. **`instanceof ZodError` fails across module boundaries** — peer dep means consumer and library may have different `ZodError` class objects; duck-type on `.issues` array presence; never use `instanceof`

**See:** `PITFALLS.md` — all 14 pitfalls with prevention code; §Technical Debt Patterns; §Pitfall-to-Phase Mapping

---

## Implications for Roadmap

Research across all four files strongly supports the following 8-phase structure. Each phase is a self-contained deliverable with clear success criteria. Dependencies between phases are strict: later phases can only be implemented correctly after earlier phases are complete.

---

### Phase 1: Infrastructure Fixes
**Rationale:** Two bugs in the scaffold affect every subsequent phase. The tsconfig migration eliminates false type errors and aligns TypeScript with how tsup actually resolves modules. The Vitest source aliases eliminate the stale-dist problem that would make test iteration slow and unreliable. The neutral entrypoint bug fix ensures `runtimeTarget` is correct before any behavioral tests run.

**Delivers:**
- `tsconfig.json` migrated to `module: Preserve` + `moduleResolution: Bundler`; `baseUrl` and `ignoreDeprecations` removed
- `vitest.config.ts` gains `resolve.alias` mapping package exports to `src/` source files
- `src/index.ts` neutral entrypoint hardcode bug fixed (runtime detection)

**Pitfalls addressed:** Vitest stale dist (#13), `.js` extensions (#12)

**Research flag:** Standard patterns — no phase research needed

---

### Phase 2: Core Types + Request Model
**Rationale:** `types.ts` is the dependency root — all other modules import from it. It must exist and be correct before any other module is written. The `Request` class comes next because `Body.*`, `Decode.*`, and `send()` all depend on `RequestSpec` being defined. The header merge function is implemented here where its `exactOptionalPropertyTypes` pitfall can be addressed in isolation.

**Delivers:**
- `src/types.ts` — all shared types: `RequestSpec`, `ClientSpec`, `ResponseMap`, `StatusMatcher`, `SendResult<R>`, `TransportError`, `DecodeError`, `DecodeIssue`, `BodyPreview`, `Method`, `QueryValue`, `RetryPolicy`
- `src/request.ts` — `Request<R>` class with `#consumed`/`#spec` private fields; `Request.create()`; `consume()`; path encoding; query building
- `src/client.ts` — `createClient()`; `mergeHeaders()` (explicit `undefined` filter, case-insensitive); `mergeQuery()`; merge rules for all layers

**Features addressed:** All HTTP methods, custom headers, query parameters, base URL / client defaults
**Pitfalls addressed:** `exactOptionalPropertyTypes` header merge (#9), `Symbol.for()` affine bypass (anti-pattern)

**Research flag:** Standard patterns — no phase research needed

---

### Phase 3: Transport + Send
**Rationale:** `send()` is the execution engine. With types and the request model in place, the core fetch loop can be built. AbortSignal composition and error classification must be implemented correctly from the first line — retrofitting them is error-prone. Body is read but not decoded in this phase; decoders come in Phase 4.

**Delivers:**
- `src/send.ts` — `send(request, client, options)` returning `Promise<SendResult<R>>`; single-attempt fetch loop; deadline `AbortController` with `DOMException("...", "TimeoutError")`; `AbortSignal.any([callerSignal, deadlineSignal])`; transport error classification by `error.name`
- Body consumed as raw bytes (all bytes), passed to decoder (stub decoder in this phase or real decoders from Phase 4)
- 4-way `SendResult` variants: `response`, `transportError`, `decodeError`, `unhandledStatus`

**Features addressed:** Abort/cancellation, per-request timeout (deadline partial), transport failure differentiation
**Pitfalls addressed:** AbortSignal reason classification (#4), `AbortSignal.timeout()` misuse (#5)

**Research flag:** Standard patterns — fetch + AbortSignal are well-documented

---

### Phase 4: Body Decoders
**Rationale:** Decoders are consumers of the raw byte buffer produced by Phase 3. They must be isolated from the transport layer. The null/empty normalization must happen before any decoder runs — this is the shared preprocessing step that prevents both `Decode.none()` silent failures and `Decode.optional()` misclassification. The connection leak prevention belongs here because `BodyPreview` is a body read.

**Delivers:**
- `src/body.ts` — `Body` namespace: `none()`, `json()`, `text()`, `formUrlEncoded()`, `bytes()`; `Body` opaque type
- `src/decode.ts` — `Decode` namespace: `none()`, `discard()`, `text()`, `json()`, `json(schema)`, `bytes()`, `optional()`; `Schema<T>` structural interface; `normalizeSchemaError()`; null/empty body normalization (both `response.body === null` and 0-byte stream → `Uint8Array(0)`)
- Body preview implementation (`BodyPreview`): `reader.cancel()` in `finally`, `TextDecoder({ fatal: false })`, byte cap

**Features addressed:** All `Body.*` producers, all `Decode.*` decoders, `BodyPreview`, `Decode.json(schema)` adapter seam
**Pitfalls addressed:** Null vs empty stream (#6), partial read connection leak (#7), discard cancel vs drain (#8), `noUncheckedIndexedAccess` Uint8Array (#9), TextDecoder fatal mode (#10), Zod duck-typing (#14)

**Research flag:** Standard patterns — no phase research needed; spec is precise on all decoder semantics

---

### Phase 5: Response Matching + Decode Dispatch
**Rationale:** With decoders built, the response matching algorithm can wire them to HTTP responses. This is a pure function (`matchResponse`) that is independently testable. The dispatch — calling the matched decoder with the body buffer — completes the happy path for `send()`. `createClient()` gains its `responses` map support.

**Delivers:**
- `src/response-matching.ts` — `matchResponse(status, requestMap, clientMap)` implementing the 4-step precedence algorithm; `classOf(status)` helper; returns `TaggedEntry | null`
- `send.ts` updated — dispatch loop: `matchResponse` → decoder call → `{ kind: "response" }` on success, `{ kind: "decodeError" }` on failure, `{ kind: "unhandledStatus" }` when null
- `ResponsesOf<M>` type machinery — generic inference chain from `ResponseMap` to `SendResult<R>`

**Features addressed:** `ResponseMap` with exact + class status matchers, status-specific typed decoding, `DecodeError` normalization, `BodyPreview` in error variants
**Pitfalls addressed:** Pre-merge anti-pattern (never merge response maps; pass both layers separately), eager decode anti-pattern (match then decode in two phases)

**Research flag:** Standard patterns — the precedence algorithm is specified exactly in SPEC.md; no ambiguity

---

### Phase 6: Retry + Deadline
**Rationale:** Retry is the highest-risk phase. Three independent bugs (off-by-one, abort during backoff, jitter overflow) must all be prevented simultaneously. The whole-operation deadline must cover backoff sleep — not just the fetch call. This phase builds on the `AbortSignal` foundation laid in Phase 3.

**Delivers:**
- `send.ts` retry loop — `for (let attempt = 0; attempt < maxAttempts; attempt++)` with 0-based indexing
- `sleepWithAbort(ms, signal)` — rejects immediately when combined signal fires during sleep
- `jitterDelay(attempt, base, cap)` — `Math.min(cap, base * 2^attempt)` before `Math.random()`; default cap 30 s
- `deadlineMs` enforced as whole-operation budget: covers all attempts + all backoff sleeps + body read + decode
- Retry predicate: respects `shouldRetry`, never retries `transportError.aborted`, never retries `decodeError`, never retries after deadline

**Features addressed:** `RetryPolicy` (maxAttempts, shouldRetry, backoff base/cap), whole-operation deadline
**Pitfalls addressed:** Off-by-one (#11), abort during backoff (#12), jitter overflow (#13)

**Research flag:** This phase needs the most care. Review PITFALLS.md §Pitfalls 5-7 with their prevention code before implementation. Consider writing tests for all three pitfall scenarios before writing the production code.

---

### Phase 7: Typed Matcher — `Send.match()`
**Rationale:** The exhaustive matcher is a thin layer over the complete `SendResult<R>` type. It requires the `TagsOf<R>` and `ResponsesOf<M>` machinery (built in Phase 5) to already be correct. It is the capstone of the type system design: adding a response entry in `ResponseMap` must immediately produce a type error at all `Send.match()` call sites.

**Delivers:**
- `src/matcher.ts` — `Send.Matcher<R, T>` mapped type (`{ [Tag in TagsOf<R>]: ... } & { transportError, decodeError, unhandledStatus }`); `Send.match()` runtime implementation
- Integration tests: adding/removing a response entry produces/removes type errors at `Send.match()` call sites; verify `satisfies Send.Matcher<...>` enforces exhaustiveness

**Features addressed:** `Send.match()` exhaustive matcher, `Send.Matcher<R,T>` type
**Pitfalls addressed:** Silent exhaustiveness gaps (exhaustiveness enforced at declaration, not usage)

**Research flag:** Standard patterns — `TagsOf<R>` and mapped types are well-documented TypeScript; the implementation pattern is specified in ARCHITECTURE.md §Pattern 4

---

### Phase 8: Documentation + Polish
**Rationale:** The library's public API surface needs TSDoc on every exported symbol. The README must prominently call out ESM-only semantics and show real usage examples including the result-union pattern. Zod peer dependency finalization ensures the `package.json` is correct for consumers.

**Delivers:**
- TSDoc on all public exports (`Request`, `Body.*`, `Decode.*`, `send()`, `createClient()`, `Send.match()`, all types)
- README: ESM-only declaration, install instructions, quick-start example, result-union explanation, `Send.match()` example, retry policy example, Zod integration example
- `package.json`: `peerDependencies: { "zod": "^3.25.0" }`, `peerDependenciesMeta: { "zod": { "optional": true } }`, `devDependencies: { "zod": "^3.25.0" }`
- `@internal` annotation on `Request.consume()` to suppress it from IntelliSense

**Features addressed:** TypeScript support polish, cross-platform documentation
**Pitfalls addressed:** ESM CJS `MODULE_NOT_FOUND` confusion (#11 mitigation via README), Zod peer dep range

**Research flag:** Standard patterns — no research needed

---

### Phase Ordering Rationale

```
Phase 1 (infra)
    │ tsconfig + Vitest fixes unblock every phase
    ▼
Phase 2 (types + request model)
    │ types.ts is the dependency root; header merge pitfall isolated here
    ▼
Phase 3 (transport — single attempt)
    │ AbortSignal composition correct before retry is added
    ▼
Phase 4 (body decoders)
    │ decoders consume raw bytes produced by Phase 3
    ▼
Phase 5 (response matching + dispatch)
    │ wires decoders to status codes; completes happy path
    ▼
Phase 6 (retry + deadline)
    │ retry wraps the single-attempt loop from Phase 3; 3 independent pitfalls addressed
    ▼
Phase 7 (typed matcher)
    │ requires SendResult<R> and ResponsesOf<M> from Phases 2–5
    ▼
Phase 8 (docs + polish)
```

Phases 4 and 5 could theoretically be merged, but separating them allows the decoder logic to be tested in complete isolation from HTTP response routing. This isolation is valuable given the number of decoder-specific pitfalls (pitfalls #6–#10 all live in Phase 4).

---

### Research Flags by Phase

| Phase | Needs `/gsd-research-phase`? | Reason |
|-------|------------------------------|--------|
| Phase 1 — Infrastructure | No | Specific steps fully described in STACK.md and PITFALLS.md |
| Phase 2 — Types + Request | No | Types specified in SPEC.md; merge logic specified in PITFALLS.md |
| Phase 3 — Transport | No | fetch + AbortSignal patterns fully specified; no ambiguity |
| Phase 4 — Body Decoders | No | All decoder semantics in SPEC.md; pitfall prevention in PITFALLS.md |
| Phase 5 — Response Matching | No | Precedence algorithm specified exactly in SPEC.md |
| **Phase 6 — Retry + Deadline** | **YES — review only** | Three independent bugs; code walkthroughs in PITFALLS.md §5-7 warrant careful pre-implementation review |
| Phase 7 — Typed Matcher | No | Implementation specified in ARCHITECTURE.md §Pattern 4 |
| Phase 8 — Documentation | No | Standard documentation phase |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All questions verified against TypeScript compiler source, official Node.js 24 docs, official Zod library-authors guide, and live runtime tests |
| Features | HIGH | Ecosystem well-documented; ky, axios, wretch, got, ofetch all verified via Context7; spec covers all v1 features |
| Architecture | HIGH | Based on direct SPEC.md analysis, codebase inspection, and established TypeScript patterns; no speculative decisions |
| Pitfalls | HIGH | All 14 pitfalls verified by live Node.js 24 execution; prevention code tested, not theoretical |

**Overall confidence: HIGH**

### Gaps to Address

1. **`Body.formData()` gap**: multipart/form-data is a table-stakes feature not in the spec. The `Body.bytes()` escape hatch exists but is ergonomically poor. This is documented as a post-v1 addition and should appear in the README as a known limitation.

2. **Zod v4 support deferred**: The current spec targets `^3.25.0`. v4 support requires versioned subpath imports and runtime differentiation. The `Schema<T>` duck-type interface maintains a clean seam. Upgrade path is straightforward when consumer demand appears.

3. **`Response.clone()` hazard not fully ruled out**: STACK.md warns against using `response.clone()` for preview because it buffers the full body. ARCHITECTURE.md confirms the `ReadableStream.getReader()` pattern is correct. No gap, but this should be called out explicitly in code comments in the preview implementation.

4. **Whole-operation deadline math**: The SPEC says `deadlineMs` covers "all attempts + all backoff + body read + decode". The retry loop must track elapsed time against the deadline, not just propagate the AbortSignal. Verify that the `AbortSignal` approach (which fires asynchronously) covers this correctly — or whether explicit time tracking is needed.

---

## Sources

### Primary (HIGH confidence)
- `docs/SPEC.md` — primary behavioral source of truth; 491 lines; all features and algorithms
- TypeScript compiler source (`commandLineParser.ts`, `program.ts`) — tsconfig deprecation facts
- Official Node.js 24 docs — fetch stability, undici version, AbortSignal availability
- Zod official Library Authors guide (`zod.dev/library-authors`) — peer dep pattern, duck-typing, versioned subpaths
- Live Node.js 24 execution — all abort signal, body stream, retry, jitter, TextDecoder, and header merge behaviors

### Secondary (HIGH confidence)
- Context7: `/colinhacks/zod`, `/websites/zod_dev` — Zod v3/v4 changelog, library-author patterns
- Context7: ky, axios, wretch, got, ofetch — competitor feature analysis
- TypeScript wiki FAQ — `noUncheckedIndexedAccess` length-check non-narrowing
- TypeScript compiler tests — `exactOptionalPropertyTypes` with object spread behavior
- MDN Web Docs — `AbortSignal.any()`, `Response.body`, `ReadableStream`

### Tertiary (supporting)
- `.planning/codebase/ARCHITECTURE.md` — existing scaffold structure analysis
- `CONCERNS.md` — known bugs and tech debt (Vitest dist dep, neutral entrypoint hardcode)
- AWS jitter article — exponential backoff formula (cap handling noted as missing from article)

---

## Cross-Cutting Convergences

The following findings appear independently in multiple research files and therefore carry extra weight:

| Finding | Confirmed In |
|---------|-------------|
| No transport layer needed — Node 24 fetch is spec-identical to browser fetch | STACK.md §Q4, ARCHITECTURE.md §Cross-Runtime Abstraction |
| `exactOptionalPropertyTypes` + object spread corrupts header merge | PITFALLS.md §9, ARCHITECTURE.md §Merge Rules |
| JS private fields (`#`) are the correct pattern for affine enforcement (not `Symbol.for()`) | ARCHITECTURE.md §Pattern 1, ARCHITECTURE.md §Anti-Pattern 4, PITFALLS.md (integration gotchas) |
| Zod: peer dep `^3.25.0`, duck-type on `.issues`, never `instanceof ZodError` | STACK.md §Q2, ARCHITECTURE.md §Pattern 3, PITFALLS.md §10 |
| `Send.Matcher<R,T>` exhaustiveness enforced at compile time via mapped types | ARCHITECTURE.md §Pattern 4, FEATURES.md §Differentiators |
| Deadline covers all attempts + backoff + body read (not per-attempt) | FEATURES.md (whole-operation deadline), PITFALLS.md §6 (abort during backoff), PITFALLS.md §7 (jitter cap) |
| `reader.cancel()` in `finally` is non-negotiable for body preview | PITFALLS.md §3, STACK.md §Q4 §Body Preview |
| Both maps passed separately to `matchResponse()` — never pre-merged | ARCHITECTURE.md §Anti-Pattern 2, FEATURES.md §Feature Dependencies |
| tsconfig `module: Preserve` + `moduleResolution: Bundler` is the correct migration | STACK.md §Q1, PITFALLS.md §12 (NodeNext `.js` extension behavior) |

---

*Research synthesized: 2026-05-04*
*Ready for roadmap: yes*
