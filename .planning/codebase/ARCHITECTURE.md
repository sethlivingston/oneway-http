<!-- refreshed: 2026-05-04 -->
# Architecture

**Analysis Date:** 2026-05-04

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                     Package Consumers                            │
│  import "@sethlivingston/oneway-http"                            │
│  import "@sethlivingston/oneway-http/browser"                    │
│  import "@sethlivingston/oneway-http/node"                       │
└──────────────┬────────────────┬─────────────────┬───────────────┘
               │                │                 │
               ▼                ▼                 ▼
┌──────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
│  Root Entrypoint │ │ Browser Entrypoint│ │  Node Entrypoint    │
│  `src/index.ts`  │ │ `src/browser.ts`  │ │  `src/node.ts`      │
│  (neutral build) │ │ (browser build)   │ │  (node build)       │
└──────────────────┘ └───────────────────┘ └─────────────────────┘
               │                │                 │
               └────────────────┴─────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Shared Core                                   │
│                    `src/shared.ts`                               │
│  OnewayHttpSurface · RuntimeTarget · createPlaceholderSurface()  │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Build Artifacts (`dist/`)                                       │
│  dist/index.js (neutral)                                         │
│  dist/browser/index.js (browser)                                 │
│  dist/node/index.js (node)                                       │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Shared core | Shared types and factory for the surface interface | `src/shared.ts` |
| Root entrypoint | Neutral-platform surface; resolved by bundlers as browser or node via package exports | `src/index.ts` |
| Browser entrypoint | Explicit browser-targeted surface | `src/browser.ts` |
| Node entrypoint | Explicit Node.js-targeted surface | `src/node.ts` |
| Build config | Three-target tsup build (neutral, browser, node) | `tsup.config.ts` |
| Parity test suite | Cross-runtime entrypoint resolution and surface validation | `tests/parity/` |

## Pattern Overview

**Overall:** Multi-entrypoint ESM library with conditional exports and platform-split builds.

**Key Characteristics:**
- Three compiled artifacts from three TypeScript entry files — one per platform target (`neutral`, `browser`, `node`)
- Package `exports` field uses `browser` and `node` conditions so bundlers/runtimes automatically resolve the correct artifact when importing `"@sethlivingston/oneway-http"`
- Explicit sub-path exports (`/browser`, `/node`) allow consumers to force a specific build regardless of environment
- All three entrypoints delegate to `src/shared.ts`; the only runtime differentiation today is the `RuntimeTarget` value (`"browser"` or `"node"`)
- Currently a **placeholder/scaffold** — the HTTP client logic specified in `docs/SPEC.md` is not yet implemented

## Layers

**Shared Core:**
- Purpose: Defines the canonical `OnewayHttpSurface` interface, `RuntimeTarget` union type, `PlaceholderDescription`, and the `createPlaceholderSurface()` factory
- Location: `src/shared.ts`
- Contains: Types, interfaces, factory function
- Depends on: Nothing (no imports)
- Used by: All three entrypoints (`src/index.ts`, `src/browser.ts`, `src/node.ts`)

**Platform Entrypoints:**
- Purpose: Instantiate the surface for a specific runtime and re-export `runtimeTarget` and `describe`
- Location: `src/index.ts` (neutral), `src/browser.ts` (browser), `src/node.ts` (node)
- Contains: Surface instantiation and named exports
- Depends on: `src/shared.ts`
- Used by: Package consumers; test suite via package alias paths

**Build Config:**
- Purpose: Produces three independent ESM bundles with TypeScript declarations, treeshaking enabled, targeting ES2022
- Location: `tsup.config.ts`
- Contains: Three `tsup` config objects sharing `sharedOptions` (ESM-only, no code splitting, DTS output)

**Test Suite (Parity):**
- Purpose: Verifies that each runtime (Node.js, Chromium, Firefox, WebKit) resolves the correct entrypoint and exposes the expected surface
- Location: `tests/parity/`
- Contains: Suite definition, test cases, runtime context, assertions
- Depends on: `src/shared.ts` types; built `dist/` artifacts via package path aliases

## Data Flow

### Entrypoint Resolution (Consumer)

1. Consumer imports `"@sethlivingston/oneway-http"` — bundler/runtime evaluates `package.json` `exports` conditions
2. In a browser bundler → resolves to `dist/browser/index.js`; in Node.js → resolves to `dist/node/index.js`; neutral fallback → `dist/index.js`
3. Imported module exposes `runtimeTarget: RuntimeTarget` and `describe(): PlaceholderDescription`

### Explicit Entrypoint (Consumer)

1. Consumer imports `"@sethlivingston/oneway-http/browser"` or `"@sethlivingston/oneway-http/node"`
2. Resolves unconditionally to `dist/browser/index.js` or `dist/node/index.js`

### Build Flow

1. `npm run build` → `tsup --config tsup.config.ts`
2. tsup runs three parallel build targets: `src/index.ts → dist/`, `src/browser.ts → dist/browser/`, `src/node.ts → dist/node/`
3. Each target emits: `index.js` (ESM bundle) + `index.d.ts` (declaration file)

### Test Flow

1. `npm run test` → `npm run build` then `vitest run`
2. vitest resolves four test projects: `node`, `chromium`, `firefox`, `webkit`
3. Each project injects `__ONEWAY_HTTP_EXPECTED_ROOT_TARGET__` and `__ONEWAY_HTTP_TEST_PROJECT__` constants
4. `tests/parity/entrypoints.test.ts` calls `defineEntrypointParitySuite()` → iterates `createEntrypointParityCases()` → imports built artifacts and asserts surface shape via `expectPlaceholderSurface()`

## Key Abstractions

**`OnewayHttpSurface` interface:**
- Purpose: The public contract every platform entrypoint must satisfy
- Examples: `src/shared.ts` (definition), `src/browser.ts`, `src/node.ts`, `src/index.ts` (implementations)
- Pattern: Factory function (`createPlaceholderSurface`) returns the interface; each entrypoint re-exports individual named members rather than the object itself

**`RuntimeTarget` union:**
- Purpose: Distinguishes `"browser"` from `"node"` at the type and value level
- Examples: `src/shared.ts` (definition), used in tests via `tests/parity/runtime-context.ts`
- Pattern: Literal union type; injected as compile-time constant in tests via vitest `define`

**`ParityRuntimeContext` interface:**
- Purpose: Provides test cases with runtime-specific metadata (which project is running, expected root target, browser vs node flag)
- Examples: `tests/parity/runtime-context.ts`
- Pattern: Module-level singleton `parityRuntimeContext` built from injected `define` constants

## Entry Points

**Root (neutral) entrypoint:**
- Location: `src/index.ts`
- Triggers: Import of `"@sethlivingston/oneway-http"` in environments without browser/node condition resolution
- Responsibilities: Exports `runtimeTarget` ("browser") and `describe()` via placeholder surface

**Browser entrypoint:**
- Location: `src/browser.ts`
- Triggers: Import of `"@sethlivingston/oneway-http"` in browser bundler contexts, or explicit `"@sethlivingston/oneway-http/browser"` import
- Responsibilities: Exports browser-tagged surface

**Node entrypoint:**
- Location: `src/node.ts`
- Triggers: Import of `"@sethlivingston/oneway-http"` in Node.js, or explicit `"@sethlivingston/oneway-http/node"` import
- Responsibilities: Exports node-tagged surface

## Architectural Constraints

- **Module format:** ESM-only (`"type": "module"` in `package.json`; `format: ["esm"]` in tsup). No CJS output.
- **Target:** ES2022 in both TypeScript (`tsconfig.json`) and tsup (`target: "es2022"`).
- **No code splitting:** `splitting: false` in tsup — each bundle is fully self-contained.
- **No side effects:** `"sideEffects": false` declared in `package.json`; safe for tree-shaking.
- **`verbatimModuleSyntax`:** Enforced in `tsconfig.json` — all type-only imports must use `import type`.
- **`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`:** Strict TypeScript settings beyond `strict: true`.
- **Global state:** None. `createPlaceholderSurface()` returns new objects; no module-level mutable state.
- **Circular imports:** None. `shared.ts` has no imports; entrypoints only import from `shared.ts`.

## Anti-Patterns

### Using `import` instead of `import type` for type-only imports

**What happens:** Importing a type as a value import (e.g., `import { SomeType } from "./shared.js"`)
**Why it's wrong:** `verbatimModuleSyntax` is enforced in `tsconfig.json` — this will fail the TypeScript compiler.
**Do this instead:** Use `import type { SomeType } from "./shared.js"` for type-only imports (see `src/browser.ts` for correct usage).

### Adding a fourth entrypoint without updating `package.json` exports and `tsup.config.ts`

**What happens:** A new `src/foo.ts` entrypoint is added but not wired into the build config or export map.
**Why it's wrong:** The artifact will not be built and the import path will not resolve for consumers.
**Do this instead:** Add the entry to `tsup.config.ts` and a corresponding `exports` condition in `package.json`.

### Importing from relative paths without `.js` extension

**What happens:** Using `import { x } from "./shared"` instead of `import { x } from "./shared.js"`
**Why it's wrong:** `moduleResolution: "NodeNext"` requires explicit `.js` extensions for relative ESM imports.
**Do this instead:** Always use `.js` extension on relative imports (see all files in `src/` for correct usage).

## Error Handling

**Strategy:** Not yet applicable — the library is a placeholder scaffold. The `docs/SPEC.md` specifies that `send()` will return a structured `SendResult` union (`response`, `transportError`, `decodeError`, `unhandledStatus`) — exceptions are never thrown for HTTP-level errors.

**Planned Patterns (per spec):**
- All HTTP results returned as discriminated union values, not exceptions
- Transport failures surfaced as `{ kind: "transportError"; error: TransportError }`
- Unmatched statuses surfaced as `{ kind: "unhandledStatus"; ... }` — never silently swallowed

## Cross-Cutting Concerns

**Logging:** None currently. No logging infrastructure in the source.
**Validation:** TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No runtime validation yet.
**Authentication:** Not applicable at this stage.

---

*Architecture analysis: 2026-05-04*
