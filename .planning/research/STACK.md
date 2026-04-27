# Technology Stack

**Project:** @sethlivingston/oneway-http — HTTP client implementation milestone
**Researched:** 2026-04-27
**Overall confidence:** HIGH — all version claims verified against npm registry; MSW integration pattern confirmed against Context7 docs

---

## Context

The repository is a brownfield ESM scaffold with a working three-target build (root/browser/node), runtime
parity tests across Node + Chromium/Firefox/WebKit, and a release pipeline. The `src/` files are
placeholder-only. The task is to replace those placeholders with the HTTP client described in
`docs/SPEC.md` without disturbing the existing package shape, export contract, or tooling.

---

## Recommended Stack

### Transport layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `globalThis.fetch` | built-in | HTTP requests | Native in Node 22 (stable since Node 21) and all modern browsers. No wrapper needed. Identical API surface across all four runtime targets in `vitest.config.ts`. |
| `AbortController` | built-in | Deadline + caller abort | `AbortSignal.any([callerSignal, AbortSignal.timeout(deadlineMs)])` is the idiomatic composition for whole-send deadline + caller abort. Available in Node 20.3+ and browsers since Chrome 116 / Firefox 116 / Safari 17.4 — all within Playwright 1.59's browser targets. |
| `URL` + `URLSearchParams` | built-in | URL construction | Path-segment encoding + query string serialization. No library. Handles the spec's segment-based path, repeated keys, and number/boolean stringification natively. |

Nothing else is needed for transport. `undici` is not imported directly — Node 22's `fetch` already uses it internally.

### Schema validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Duck-typed `SchemaLike<T>` interface | n/a | Contract for `Decode.json(schema)` | Define `interface SchemaLike<T> { parse(data: unknown): T }` in `src/types.ts`. Zod v4 schemas satisfy this structurally. The library imports nothing from Zod. The spec explicitly states the decode contract should remain thin enough that switching to Valibot later stays possible — this design achieves that without any dependency addition. |
| Zod v4 (consumer-installed) | 4.3.6 current | Consumer schema validation | Document as the recommended/tested schema library in README. Consumers add `zod` to their own `dependencies`. The library never imports it. |

**Zod is NOT a library dependency (not `dependencies`, not `peerDependencies`).** The structural
interface approach is strictly better than a peer dependency here: it keeps the bundle lean, avoids
peer resolution warnings for Valibot users, and the spec itself asks for this flexibility.

### Retry

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Pure implementation | n/a | Bounded exponential jittered backoff | The spec's retry semantics are specific: per-method allow-list, transport-only by default, deadline-aware, non-retryable for `decodeError`/`unhandledStatus`/`aborted`. A general retry library would need to be wrapped so heavily that the wrapping is larger than the implementation. ~30 lines in `src/retry.ts`. |

### Test infrastructure additions

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `msw` | 2.13.6 | HTTP mock interception | Intercepts `fetch` at the network layer. `msw/node` → `setupServer` for the Vitest Node project. `msw/browser` → `setupWorker` for the Chromium/Firefox/WebKit projects. Request handler definitions (`http.get(...)`, `http.post(...)`) are shared across all projects — perfectly aligned with the existing parity harness philosophy. Add as `devDependency`. |
| `@arethetypeswrong/cli` | 0.18.2 | Export map type validation | Validates that the three `package.json` export conditions resolve to the right `.d.ts` files for every supported TypeScript `moduleResolution` mode. Catches type regressions that in-repo `tsconfig.json` path aliases hide. Run with `attw --pack` in the `verify` script. Add as `devDependency`. |

### Source module additions (runtime-neutral)

All new implementation files belong in `src/` alongside `shared.ts`. They are runtime-neutral
(no environment branching) and re-exported from the three thin entrypoints.

| File | Contents |
|------|----------|
| `src/types.ts` | All public TypeScript types: `RequestSpec`, `ClientSpec`, `SendResult<R>`, `TransportError`, `DecodeError`, `DecodeIssue`, `BodyPreview`, `StatusMatcher`, `ResponseMap`, `RetryPolicy`, `SchemaLike<T>` |
| `src/request.ts` | `Request.create()` factory, affine-consumption tracking |
| `src/body.ts` | `Body.none()`, `Body.json()`, `Body.text()`, `Body.formUrlEncoded()`, `Body.bytes()` |
| `src/decode.ts` | `Decode.none()`, `Decode.discard()`, `Decode.text()`, `Decode.json()`, `Decode.bytes()`, `Decode.optional()` |
| `src/merge.ts` | Header case-insensitive merge, query merge, response map layering, scalar override logic |
| `src/url.ts` | Path-segment URL construction, query serialization from spec rules |
| `src/retry.ts` | `RetryPolicy` defaults, retry-eligibility predicate, backoff calculator |
| `src/send.ts` | `send()` implementation, deadline/abort wiring, response matching, `Send.match()` |
| `src/shared.ts` | Evolves from placeholder factory to the re-export hub or is replaced by `types.ts`; keep `RuntimeTarget` here |

The three entrypoints (`src/index.ts`, `src/browser.ts`, `src/node.ts`) become thin re-export
façades from the above modules. No runtime branching logic enters them.

---

## What NOT to Adopt

| Rejected | Category | Reason |
|----------|----------|--------|
| `axios` | HTTP client | Brings its own XHR adapter, interceptor system, and config model. Contradicts the spec's explicit transport design. Adds ~50 KB to every bundle. |
| `ky` | HTTP client wrapper | Wraps fetch but exposes a fluent builder API that directly conflicts with the spec's declarative `Request` + `send()` model. |
| `got` | HTTP client | Node-only; browser support is a secondary concern. Conflicts with the single-package contract. |
| `node-fetch` | Fetch polyfill | Node 22 has native `fetch`. A polyfill adds a dependency for zero gain. |
| `undici` (direct) | HTTP client | Node 22's `fetch` already uses undici internally. Direct `undici` usage would fragment the shared transport layer and break browser entrypoints. |
| `p-retry` / `cockatiel` / `retry` | Retry libraries | Spec retry semantics (deadline awareness, method allow-list, non-retryable result kinds) would require deep wrapping. The pure implementation is smaller than any wrapper would be. |
| `zod` as `dependency` or `peerDependency` | Schema library | Structural duck-typing (`SchemaLike<T>`) is cleaner, keeps the bundle lean, and satisfies the spec's explicit flexibility note. Consumers bring their own Zod. |
| `cross-fetch` / `whatwg-fetch` | Fetch polyfills | All target runtimes (Node 22, Chrome, Firefox, WebKit via Playwright 1.59) have native `fetch`. |
| `luxon` / `date-fns` | Date/time | Deadline arithmetic is `Date.now()` and `performance.now()`. No library needed. |
| OpenAPI codegen (`orval`, `openapi-ts`) | Code generation | Not in scope for v1. The library ships a general client, not typed API bindings. |
| `@tanstack/query` | Cache/state | Out of scope. Caching is a consumer concern. |
| `typebox` / `valibot` as direct dep | Schema library | Same structural-interface argument as Zod. Defer; let consumers choose. |

---

## Installation

```bash
# Runtime behavior tests
npm install -D msw

# Export map validation
npm install -D @arethetypeswrong/cli
```

No new `dependencies` (runtime) additions. The package stays zero-dependency at runtime.

### Script additions to `package.json`

```json
"attw": "attw --pack",
"verify": "npm run typecheck && npm run lint && npm run attw && npm run test"
```

---

## MSW integration pattern for parity harness

The existing parity harness runs the same test file across all four Vitest projects via shared case
definitions. Behavior tests should follow the same pattern:

```
tests/
  behavior/
    send.test.ts           ← delegates to defineXxx() like parity does
    send-cases.ts          ← shared handler definitions + assertions
    msw-setup.ts           ← chooses setupServer (node) or setupWorker (browser)
                              based on the injected __ONEWAY_HTTP_TEST_PROJECT__ define
```

`msw-setup.ts` is the only place that branches on runtime:

```ts
// msw-setup.ts
import { handlers } from "./handlers.js";

// Vitest injects __ONEWAY_HTTP_TEST_PROJECT__ via vitest.config.ts defines
const isNode = globalThis.__ONEWAY_HTTP_TEST_PROJECT__ === "node";

export const server = isNode
  ? (await import("msw/node")).setupServer(...handlers)
  : (await import("msw/browser")).setupWorker(...handlers);
```

This keeps the same parity-first philosophy: one test body, four runtime executions.

---

## Constraints preserved

- **One runtime-aware ESM package** — no new entrypoints, no new `package.json` export conditions needed
- **Zero runtime dependencies** — no additions to `dependencies`; all new libraries are `devDependencies`
- **Three build targets unchanged** — `tsup.config.ts` entries and `platform` settings stay as-is; new source modules are all platform-neutral
- **TypeScript 6 / NodeNext module resolution** — all new imports use `.js` extensions per `tsconfig.json` convention
- **ES2022 target** — `AbortSignal.any()` is ES2023 in lib, but available in Node 22 and target browsers at runtime; `tsconfig.json` target `ES2022` means you cast or use `@ts-expect-error` if the lib typing lags, or check `ts-lib` state at implementation time

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Transport (native fetch) | HIGH | Node 22 stable fetch confirmed; `AbortSignal.any` in Node 20.3+ verified |
| Schema duck-typing | HIGH | Zod v4 `.parse()` signature confirmed to satisfy `SchemaLike<T>`; pattern is well-established |
| MSW v2 + Vitest | HIGH | Confirmed via Context7 docs; `msw/node` setupServer and `msw/browser` setupWorker both documented for Vitest |
| `@arethetypeswrong/cli` | HIGH | `attw --pack` is the standard pre-publish export map validator; 0.18.2 current |
| Retry pure implementation | HIGH | Spec semantics are fully defined; no ambiguity about what the library does |
| Source module layout | MEDIUM | Layout is inferred from spec sections; exact file boundaries are an implementation detail that may shift slightly |

---

## Sources

- npm registry: `msw@2.13.6`, `@arethetypeswrong/cli@0.18.2`, `zod@4.3.6` — verified 2026-04-27
- Context7 (`/mswjs/msw`): `setupServer` (Node) and `setupWorker` (browser) patterns — HIGH confidence
- Node.js docs: `AbortSignal.any()` available since Node 20.3.0; `fetch` stable since Node 21 — HIGH confidence
- `docs/SPEC.md` in this repo: schema adapter note, `SchemaLike` design implication — HIGH confidence
- `.planning/codebase/STACK.md`, `ARCHITECTURE.md`, `CONCERNS.md` in this repo — HIGH confidence (primary source)
