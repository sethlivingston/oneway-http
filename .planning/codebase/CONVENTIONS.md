# Coding Conventions

**Analysis Date:** 2026-05-04

## Naming Patterns

**Files:**
- Source entrypoints: lowercase, runtime-oriented (`index.ts`, `browser.ts`, `node.ts`)
- Shared modules: lowercase, descriptive (`shared.ts`)
- Test helpers: lowercase kebab-case (`entrypoint-cases.ts`, `placeholder-assertions.ts`, `runtime-context.ts`)

**Functions:**
- `camelCase` throughout — `createPlaceholderSurface` in `src/shared.ts`, `createEntrypointParityCases` in `tests/parity/entrypoint-cases.ts`, `defineEntrypointParitySuite` in `tests/parity/suite.ts`, `expectPlaceholderSurface` in `tests/parity/placeholder-assertions.ts`
- Factory helpers prefixed with `create` — `createPlaceholderSurface`, `createEntrypointParityCases`
- Suite-definition helpers prefixed with `define` — `defineEntrypointParitySuite`
- Assertion helpers prefixed with `expect` — `expectPlaceholderSurface`

**Variables / Constants:**
- `camelCase` for module-level constants — `rootSurface` in `src/index.ts`, `browserSurface` in `src/browser.ts`, `nodeSurface` in `src/node.ts`, `parityRuntimeContext` in `tests/parity/runtime-context.ts`
- `ALL_CAPS` reserved exclusively for compile-time defines — `__ONEWAY_HTTP_EXPECTED_ROOT_TARGET__`, `__ONEWAY_HTTP_TEST_PROJECT__` in `tests/parity/runtime-context.ts`

**Types / Interfaces:**
- `PascalCase` — `RuntimeTarget`, `PlaceholderDescription`, `OnewayHttpSurface` in `src/shared.ts`; `ParityCase`, `ParityProjectName`, `ParityRuntimeContext` in `tests/parity/*.ts`; `PlaceholderSurface` in `tests/parity/placeholder-assertions.ts`
- Prefer `interface` for object shapes (`OnewayHttpSurface`, `PlaceholderDescription`, `ParityRuntimeContext`) and `type` for union/alias shapes (`RuntimeTarget`, `ParityProjectName`)
- Mark all interface members `readonly` unless mutation is required — consistent in `src/shared.ts`, `tests/parity/runtime-context.ts`, and `tests/parity/placeholder-assertions.ts`

## Code Style

**Formatting:**
- No standalone formatter config detected (no `.prettierrc*`, `biome.json`)
- Match existing file style across `src/*.ts`, `tests/parity/*.ts`, `vitest.config.ts`, and `tsup.config.ts`:
  - 2-space indentation
  - Double quotes for strings
  - Semicolons required
  - Trailing commas in multiline structures
  - Wrapped parameter lists when signatures span multiple lines

**Linting:**
- Tool: ESLint 10.x — configured in `eslint.config.mjs`
- Plugin: `@sethlivingston/eslint-plugin-typescript-narrows` ^1.1.2 — applies `strict`, `test`, and `tooling` preset configs
- Parser: `@typescript-eslint/parser` ^8.59.0
- Import resolver: `eslint-import-resolver-typescript` configured via `eslint-import-resolver-typescript` with `alwaysTryTypes: true`
- Type-aware linting: `parserOptions.projectService: true` and `tsconfigRootDir: import.meta.dirname` — rules have full TypeScript context
- Scope: `src`, `tests`, `tsup.config.ts`, `vitest.config.ts` (see `lint` script in `package.json`)
- Ignores: `**/dist/**`, `**/node_modules/**`
- Baseline: all files pass cleanly with zero inline suppressions

## TypeScript Strictness

Enforced via `tsconfig.json`:
- `"strict": true` — all strict mode checks enabled
- `"noUncheckedIndexedAccess": true` — array/object index access returns `T | undefined`
- `"exactOptionalPropertyTypes": true` — optional props cannot be set to `undefined` unless explicitly typed as `T | undefined`
- `"verbatimModuleSyntax": true` — `import type` must be used for type-only imports
- `"isolatedModules": true` — each file must be independently compilable
- `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`

## Import Organization

**Order (observed pattern):**
1. External packages — `import { describe, it } from "vitest";`
2. Internal local modules — `import { ... } from "./entrypoint-cases.js";`

**Rules:**
- Local TypeScript ESM imports use explicit `.js` extensions — `./shared.js`, `./entrypoint-cases.js`, `../../src/shared.js` — required by `NodeNext` module resolution and enforced throughout `src/` and `tests/`
- Type-only imports use `import type { ... }` syntax — e.g., `import type { RuntimeTarget } from "../../src/shared.js";` in `tests/parity/runtime-context.ts`; enforced by `verbatimModuleSyntax`
- Package aliases declared in `tsconfig.json` paths for `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, `@sethlivingston/oneway-http/node` — used in tests via dynamic `import()` calls

## Module Design

**Exports:**
- Use **named exports** in all library and test modules — `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, `tests/parity/*.ts`
- Reserve `export default` for tool configuration modules — `eslint.config.mjs`, `vitest.config.ts`, `tsup.config.ts`
- No barrel files (`index.ts` re-exporting submodules); each entrypoint is a distinct thin module

**Object literals:**
- Expand vertically when carrying multiple fields — see `createPlaceholderSurface` return in `src/shared.ts` and project definitions in `vitest.config.ts`

## Error Handling

**Strategy:** Structured return values — never thrown exceptions.

**Patterns:**
- Library code returns plain objects and never calls `throw` or `try/catch` — consistent in `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Transport failures (per `docs/SPEC.md`) must be returned as structured values, not thrown
- HTTP status responses are valid results, not errors
- Tests use Vitest `expect()` assertions to surface parity failures — `tests/parity/placeholder-assertions.ts`

## Logging

- Do **not** add `console` logging to library or test code — existing files in `src/` and `tests/parity/` are log-free
- Diagnostics belong in documentation and assertions, not runtime logs

## Comments

**When to Comment:**
- Prefer self-describing names and tiny modules over inline comments
- Source files are almost entirely comment-free — `src/*.ts` and `tests/parity/*.ts`
- No JSDoc/TSDoc in `src/` or tests
- Behavioral guidance belongs in durable docs: `README.md`, `copilot-instructions.md`, `docs/SPEC.md`

## Function Design

- Keep functions small and focused on a single concern — see `createPlaceholderSurface` (6 lines) and `expectPlaceholderSurface` (5 lines)
- Prefer pure functions with no side effects — `createPlaceholderSurface` in `src/shared.ts`
- Annotate return types on exported functions — `createPlaceholderSurface(): OnewayHttpSurface`, `defineEntrypointParitySuite(): void`, `expectPlaceholderSurface(...): void`

## Repo-Specific Guidance

- **Shared logic goes in `src/shared.ts`** — runtime-agnostic code only; `src/browser.ts` and `src/node.ts` are thin adapters
- **`src/index.ts` is the neutral root entrypoint** — must stay coordinated with `package.json` exports, `tsup.config.ts`, and `tests/parity/entrypoint-cases.ts`
- **Tests exercise the public package surface**, not private internals — use `import("@sethlivingston/oneway-http")` not `import("../../src/index.js")`
- **New cross-runtime behavior → extend parity helpers** in `tests/parity/` rather than writing runtime-only assertions
- **Runtime selection is build-time** — express browser/node split in `package.json` exports and `tsup.config.ts`; never use runtime `typeof window` detection

---

*Convention analysis: 2026-05-04*
