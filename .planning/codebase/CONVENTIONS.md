# Coding Conventions

**Analysis Date:** 2026-04-27

## Naming Patterns

**Files:**
- Use lowercase kebab-case for test helpers and suites in `tests/parity/entrypoint-cases.ts`, `tests/parity/placeholder-assertions.ts`, and `tests/parity/runtime-context.ts`.
- Use short runtime-oriented entrypoint names in `src/index.ts`, `src/browser.ts`, and `src/node.ts`.
- Reserve broad shared names for cross-runtime modules such as `src/shared.ts`.

**Functions:**
- Use `camelCase` for functions, including exported helpers such as `createPlaceholderSurface` in `src/shared.ts`, `createEntrypointParityCases` in `tests/parity/entrypoint-cases.ts`, and `defineEntrypointParitySuite` in `tests/parity/suite.ts`.
- Prefix factory-style helpers with `create` or `define` in `src/shared.ts` and `tests/parity/suite.ts`.
- Prefix assertion helpers with `expect` in `tests/parity/placeholder-assertions.ts`.

**Variables:**
- Use `camelCase` for locals and exported constants, as seen in `rootSurface` in `src/index.ts`, `browserSurface` in `src/browser.ts`, `nodeSurface` in `src/node.ts`, and `parityRuntimeContext` in `tests/parity/runtime-context.ts`.
- Reserve ALL_CAPS names for compile-time defines declared in `tests/parity/runtime-context.ts`.

**Types:**
- Use `PascalCase` for interfaces and type aliases, including `RuntimeTarget`, `PlaceholderDescription`, `OnewayHttpSurface`, `ParityCase`, `ParityProjectName`, and `ParityRuntimeContext` in `src/shared.ts` and `tests/parity/*.ts`.
- Prefer `readonly` members on exported interfaces in `src/shared.ts`, `tests/parity/runtime-context.ts`, and `tests/parity/placeholder-assertions.ts`.

## Code Style

**Formatting:**
- No standalone formatter config is detected in `.prettierrc*`, `prettier.config.*`, or `biome.json`.
- Match the existing file style in `src/*.ts`, `tests/parity/*.ts`, `vitest.config.ts`, and `tsup.config.ts`: 2-space indentation, double quotes, semicolons, trailing commas in multiline structures, and wrapped parameter lists when signatures span multiple lines.
- Keep object literals and arrays vertically expanded when they carry multiple fields, following `src/shared.ts` and `vitest.config.ts`.

**Linting:**
- Use the repository ESLint flat config in `eslint.config.mjs`.
- Linting is type-aware: `eslint.config.mjs` enables `parserOptions.projectService` and `tsconfigRootDir`, so code is expected to satisfy rules with full TypeScript context from `tsconfig.json`.
- Import resolution is expected to work through the TypeScript resolver configured in `eslint.config.mjs`.
- Repository lint scope is `src`, `tests`, `tsup.config.ts`, and `vitest.config.ts` via the `lint` script in `package.json`.
- The lint baseline is strict enough that `npm run lint` passes cleanly without inline suppressions in `src/` or `tests/`.

## Import Organization

**Order:**
1. External packages first, as in `import { describe, it } from "vitest";` in `tests/parity/suite.ts`.
2. Blank line.
3. Relative local imports second, as in `tests/parity/suite.ts` and `src/index.ts`.

**Path Aliases:**
- Package-level aliases are declared in `tsconfig.json` for `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, and `@sethlivingston/oneway-http/node`.
- Tests intentionally exercise those aliases through dynamic `import()` calls in `tests/parity/entrypoint-cases.ts`.
- Local TypeScript ESM imports use explicit `.js` extensions, consistent across `src/*.ts` and `tests/parity/*.ts` and explicitly required by `.github/copilot-instructions.md`.

## Error Handling

**Patterns:**
- Current implementation code in `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `src/shared.ts` does not throw or catch errors; it returns plain structured values.
- Tests rely on Vitest assertions in `tests/parity/entrypoint-cases.ts` and `tests/parity/placeholder-assertions.ts` instead of custom error wrappers.
- Future runtime code should stay aligned with the explicit structured-result direction documented in `docs/SPEC.md`, not ad hoc thrown exceptions.

## Logging

**Framework:** None detected in `src/`, `tests/`, `package.json`, or `vitest.config.ts`.

**Patterns:**
- Do not add incidental `console` logging to normal library code; existing files in `src/` and `tests/parity/` are log-free.
- Keep diagnostics in documentation and assertions instead of runtime logs, matching `README.md`, `.github/copilot-instructions.md`, and `tests/parity/placeholder-assertions.ts`.

## Comments

**When to Comment:**
- Prefer self-describing names and tiny modules over inline comments; `src/*.ts` and `tests/parity/*.ts` are almost entirely comment-free.
- Put behavioral guidance in durable docs such as `README.md`, `.github/copilot-instructions.md`, and `docs/SPEC.md` rather than scattered source comments.

**JSDoc/TSDoc:**
- JSDoc/TSDoc is not used in `src/` or `tests/`.
- Public intent is currently expressed through exported TypeScript types in `src/shared.ts` and repo docs in `README.md` and `docs/SPEC.md`.

## Function Design

**Size:** Keep functions small and single-purpose, following `createPlaceholderSurface` in `src/shared.ts` and `defineEntrypointParitySuite` in `tests/parity/suite.ts`.

**Parameters:** Use explicit typed parameters, often wrapped across lines for readability, as in `createBrowserProject` in `vitest.config.ts` and `expectPlaceholderSurface` in `tests/parity/placeholder-assertions.ts`.

**Return Values:** Prefer explicit return types on exported helpers, such as `OnewayHttpSurface` in `src/shared.ts`, `readonly ParityCase[]` in `tests/parity/entrypoint-cases.ts`, and `void` in `tests/parity/suite.ts`.

## Module Design

**Exports:**
- Use named exports in library and test modules, as in `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `tests/parity/*.ts`.
- Reserve `export default` for tool configuration modules like `eslint.config.mjs`, `vitest.config.ts`, and `tsup.config.ts`.

**Barrel Files:** Traditional barrel files are not used. `src/index.ts`, `src/browser.ts`, and `src/node.ts` are runtime entry modules, not aggregation barrels.

## Repo-Specific Guidance

- Keep shared runtime-agnostic logic in `src/shared.ts`; keep `src/browser.ts` and `src/node.ts` as thin runtime wrappers, matching `README.md` and `.github/copilot-instructions.md`.
- Treat `src/index.ts` as the neutral/root entry module that must stay coordinated with `package.json` exports, `tsup.config.ts`, and `tests/parity/entrypoint-cases.ts`.
- When behavior should exist across runtimes, add or extend parity helpers in `tests/parity/` instead of writing divergent runtime-only assertions, per `.github/copilot-instructions.md`.
- Keep repository docs aligned with code: `README.md` and `.github/copilot-instructions.md` currently match the scripts in `package.json`, the build targets in `tsup.config.ts`, and the test matrix in `vitest.config.ts`.

---

*Convention analysis: 2026-04-27*
