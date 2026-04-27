<!-- refreshed: 2026-04-27 -->
# Architecture

**Analysis Date:** 2026-04-27

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│               Consumer-facing package surface               │
├──────────────────┬──────────────────┬───────────────────────┤
│ Root import      │ Browser import   │ Node import           │
│ `package.json`   │ `src/browser.ts` │ `src/node.ts`         │
│ + `src/index.ts` │                  │                       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│             Shared runtime-neutral surface factory          │
│                    `src/shared.ts`                          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│   Build + verification outputs                             │
│   `dist/`, `tsup.config.ts`, `vitest.config.ts`,           │
│   `tests/parity/`                                          │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Package export contract | Routes `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, and `@sethlivingston/oneway-http/node` to the correct built artifacts. | `package.json` |
| Build matrix | Compiles three separate ESM outputs from the three source entrypoints. | `tsup.config.ts` |
| Root entrypoint | Exposes the package root surface and acts as the neutral fallback source entrypoint. | `src/index.ts` |
| Runtime-specific entrypoints | Provide explicit browser and node surfaces without runtime branching inside one file. | `src/browser.ts`, `src/node.ts` |
| Shared surface factory | Defines `RuntimeTarget`, `PlaceholderDescription`, `OnewayHttpSurface`, and the shared placeholder constructor. | `src/shared.ts` |
| Parity suite | Verifies that root, browser, and node package exports expose the expected runtime-specific placeholder surface in each Vitest project. | `vitest.config.ts`, `tests/parity/entrypoints.test.ts`, `tests/parity/entrypoint-cases.ts` |

## Pattern Overview

**Overall:** Thin runtime entrypoints around a shared placeholder factory, with runtime selection owned by conditional package exports and multi-target builds.

**Key Characteristics:**
- Keep source modules in a flat `src/` layout and make each public entrypoint a tiny adapter over `src/shared.ts`.
- Express the browser/node split at package-export and build-config level in `package.json` and `tsup.config.ts`, not through runtime detection logic.
- Verify the public package surface through a parity matrix in `vitest.config.ts` and `tests/parity/` instead of testing private internals only.

## Layers

**Export and build contract:**
- Purpose: Define what consumers can import and which artifact each runtime receives.
- Location: `package.json`, `tsup.config.ts`, `tsconfig.json`
- Contains: package `exports`, npm scripts, tsup entry definitions, TypeScript path aliases
- Depends on: `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Used by: npm consumers, Vitest module resolution, the build pipeline

**Public source entrypoints:**
- Purpose: Expose the library surface for each package entrypoint.
- Location: `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Contains: module-level surface construction and named re-exports
- Depends on: `src/shared.ts`
- Used by: `tsup.config.ts` during build and consumers via `package.json`

**Shared abstraction layer:**
- Purpose: Hold the only reusable domain abstraction currently implemented.
- Location: `src/shared.ts`
- Contains: runtime target types, placeholder description types, and `createPlaceholderSurface()`
- Depends on: no local modules
- Used by: all three files in `src/`

**Parity verification layer:**
- Purpose: Assert that published entrypoints resolve to the expected runtime surface in Node and real browsers.
- Location: `vitest.config.ts`, `tests/parity/`
- Contains: per-project defines, runtime context helpers, reusable test cases, assertion helpers
- Depends on: built package exports and `src/shared.ts` types
- Used by: `npm run test`, CI in `.github/workflows/package-foundation.yml`, release validation in `.github/workflows/release-package.yml`

**Generated distribution layer:**
- Purpose: Provide the actual publishable artifacts selected by package exports.
- Location: `dist/`, `dist/browser/`, `dist/node/`
- Contains: bundled `.js` and `.d.ts` files for each entrypoint
- Depends on: `tsup.config.ts` and `src/`
- Used by: package consumers and parity tests that import `@sethlivingston/oneway-http*`

## Data Flow

### Primary Request Path

1. A consumer imports the root package or a subpath, and `package.json` selects the matching artifact through conditional exports (`package.json:34-54`).
2. `tsup.config.ts` maps each source entrypoint to its own output directory, producing `dist/index.js`, `dist/browser/index.js`, and `dist/node/index.js` (`tsup.config.ts:16-43`).
3. The selected entrypoint constructs a module-scoped surface for its runtime target in `src/index.ts`, `src/browser.ts`, or `src/node.ts` (`src/index.ts:7-10`, `src/browser.ts:6-9`, `src/node.ts:6-9`).
4. `createPlaceholderSurface()` in `src/shared.ts` returns the stable exported object shape used everywhere today (`src/shared.ts:13-23`).

### Parity Verification Flow

1. `vitest.config.ts` defines one Node project and three Playwright-backed browser projects, injecting expected runtime metadata into each run (`vitest.config.ts:27-46`).
2. `tests/parity/entrypoints.test.ts` delegates to `defineEntrypointParitySuite()`, which iterates the shared cases for the active project (`tests/parity/entrypoints.test.ts:1-3`, `tests/parity/suite.ts:6-17`).
3. Each case dynamically imports `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, and, when allowed, `@sethlivingston/oneway-http/node`, then validates the surface through `expectPlaceholderSurface()` (`tests/parity/entrypoint-cases.ts:12-51`, `tests/parity/placeholder-assertions.ts:13-22`).

**State Management:**
- State is module-scoped and immutable after module initialization: `rootSurface` in `src/index.ts`, `browserSurface` in `src/browser.ts`, `nodeSurface` in `src/node.ts`, and `parityRuntimeContext` in `tests/parity/runtime-context.ts`.

## Key Abstractions

**`RuntimeTarget`:**
- Purpose: Represent the only supported runtime split, `"browser"` or `"node"`.
- Examples: `src/shared.ts`, `tests/parity/runtime-context.ts`
- Pattern: shared discriminant union reused by source and tests

**`OnewayHttpSurface`:**
- Purpose: Describe the current public API contract exposed by every entrypoint.
- Examples: `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Pattern: tiny interface exported indirectly through entrypoint-specific constants

**`createPlaceholderSurface()`:**
- Purpose: Centralize creation of the current scaffold implementation so all entrypoints share one shape.
- Examples: `src/shared.ts`
- Pattern: pure factory function with no side effects

**`ParityRuntimeContext`:**
- Purpose: Carry per-project expectations into the shared parity suite.
- Examples: `tests/parity/runtime-context.ts`, `tests/parity/entrypoint-cases.ts`
- Pattern: compile-time defines converted into a small immutable runtime object

## Entry Points

**Root package entrypoint:**
- Location: `src/index.ts`
- Triggers: imported via `@sethlivingston/oneway-http` and built to `dist/index.js`
- Responsibilities: expose `runtimeTarget` and `describe`, and provide the neutral fallback source entrypoint

**Explicit browser entrypoint:**
- Location: `src/browser.ts`
- Triggers: imported via `@sethlivingston/oneway-http/browser` or selected by the `"browser"` export condition
- Responsibilities: expose the browser-targeted placeholder surface

**Explicit node entrypoint:**
- Location: `src/node.ts`
- Triggers: imported via `@sethlivingston/oneway-http/node` or selected by the `"node"` export condition
- Responsibilities: expose the node-targeted placeholder surface

**Build entrypoints:**
- Location: `tsup.config.ts`
- Triggers: `npm run build`, `npm run test*`, CI, and release validation
- Responsibilities: emit the three publishable ESM bundles and declaration files

**Parity suite entrypoint:**
- Location: `tests/parity/entrypoints.test.ts`
- Triggers: `vitest run` through the projects defined in `vitest.config.ts`
- Responsibilities: run the same export-level checks in Node and each supported browser engine

## Architectural Constraints

- **Threading:** The package runs on the single-threaded JavaScript event loop in Node and browsers; no worker threads, child processes, or background services are part of the library surface.
- **Global state:** Module-level singleton-like constants exist in `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `tests/parity/runtime-context.ts`; there is no mutable shared store.
- **Circular imports:** None detected. Imports are one-way from `src/*.ts` into `src/shared.ts` and from `tests/parity/*.ts` into helper modules.
- **Runtime split:** Keep runtime selection in `package.json` exports and `tsup.config.ts`; `src/shared.ts` is runtime-neutral and should not become the place that branches on environment APIs.
- **Implementation scope:** The repository currently exposes only placeholder surfaces from `src/`; the behavioral HTTP client described in `docs/SPEC.md` is not implemented in the source tree yet.

## Anti-Patterns

### Runtime detection inside one shared entrypoint

**What happens:** New code tries to inspect `globalThis`, `window`, or `process` inside `src/index.ts` to decide which implementation to export.
**Why it's wrong:** The package already models runtime choice through conditional exports in `package.json` and separate build targets in `tsup.config.ts`; adding runtime checks would duplicate routing logic and make builds less predictable.
**Do this instead:** Keep `src/index.ts`, `src/browser.ts`, and `src/node.ts` as explicit thin entrypoints, and let `package.json` + `tsup.config.ts` select the correct artifact.

### One-off tests outside the parity harness

**What happens:** Export-surface assertions are added to a single environment-specific test instead of the shared parity suite.
**Why it's wrong:** The core architectural promise in this scaffold is runtime parity across Node and browsers; a single-project test can miss regressions in conditional exports or project defines.
**Do this instead:** Add reusable cases in `tests/parity/entrypoint-cases.ts` so `tests/parity/entrypoints.test.ts` runs them in every Vitest project from `vitest.config.ts`.

## Error Handling

**Strategy:** Keep source modules pure and let validation failures surface through TypeScript, ESLint, tsup, and Vitest rather than in-library recovery logic.

**Patterns:**
- `src/shared.ts` returns plain objects and does not throw or catch.
- Parity failures surface as `expect()` assertions in `tests/parity/placeholder-assertions.ts` and `tests/parity/entrypoint-cases.ts`.

## Cross-Cutting Concerns

**Logging:** Not detected in `src/` or `tests/parity/`.
**Validation:** Strict TypeScript settings in `tsconfig.json`, lint rules in `eslint.config.mjs`, and parity assertions in `tests/parity/`.
**Authentication:** Not applicable; the library surface is a local placeholder scaffold and does not authenticate to external services.

---

*Architecture analysis: 2026-04-27*
