<!-- GSD:project-start source:PROJECT.md -->
## Project

**oneway-http**

`oneway-http` is a runtime-aware TypeScript HTTP client for Seth's own apps that aims to provide the same declarative, structured experience in both Node.js and browser environments. Instead of exposing a fetch-style interface that leaves status handling, body consumption, and transport semantics up to each caller, it is meant to let callers define meaningful request/response contracts and receive truthful structured results.

The current repository already provides the package, build, and runtime-parity scaffold for that library, but the HTTP client behavior itself still needs to be implemented from `docs/SPEC.md`.

**Core Value:** Provide a strict, explicit HTTP client that keeps consumers from having to manually manage transport semantics, status handling, and body decoding while staying consistent across Node and browsers.

### Constraints

- **Tech stack**: TypeScript ESM package targeting both Node.js and browser runtimes — the existing package/export/build structure is already in place and should be preserved
- **Product scope**: Implement the library substantially as specified rather than optimizing for a reduced MVP — the goal is the spec-backed client, not a partial convenience wrapper
- **API semantics**: Transport failures must be structured values, HTTP statuses must not be treated as transport exceptions, and response decoding must remain status-specific — these are core design constraints from `docs/SPEC.md`
- **Repository shape**: Shared runtime-agnostic logic should stay centralized while runtime-specific entrypoints remain thin wrappers — consistent with the current source layout and codebase conventions
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 6.x - all library code and most tooling live in `src/*.ts`, `tests/parity/*.ts`, `tsup.config.ts`, and `vitest.config.ts`; `package.json` pins `typescript` to `^6.0.3`.
- JavaScript ESM - ESLint configuration is authored in `eslint.config.mjs`.
- YAML - automation and dependency update policy live in `.github/workflows/package-foundation.yml`, `.github/workflows/release-package.yml`, and `.github/dependabot.yml`.
- Markdown - package and security documentation live in `README.md`, `SECURITY.md`, and `docs/SPEC.md`.
## Runtime
- Node.js - repository scripts in `package.json` run through Node; CI uses Node 22 in `.github/workflows/package-foundation.yml` and release validation/publish uses Node 24 in `.github/workflows/release-package.yml`.
- Browser runtimes - browser parity projects run in Chromium, Firefox, and WebKit through `vitest.config.ts`.
- npm - all scripts are npm scripts in `package.json`.
- Lockfile: present in `package-lock.json` (lockfileVersion 3).
## Frameworks
- No application framework detected - the repository is an ESM library scaffold with conditional package exports in `package.json` and thin runtime entrypoints in `src/index.ts`, `src/browser.ts`, and `src/node.ts`.
- Vitest 4.1.5 - test runner configured in `vitest.config.ts` and invoked by `package.json` scripts.
- Playwright 1.59.1 via `@vitest/browser-playwright` 4.1.5 - browser execution provider used by the Chromium, Firefox, and WebKit projects in `vitest.config.ts`.
- tsup 8.5.1 - bundler for the three published ESM outputs configured in `tsup.config.ts`.
- TypeScript 6.0.3 - typechecking and declaration generation basis configured in `tsconfig.json`.
- ESLint 10.2.1 - lint runner configured in `eslint.config.mjs`.
- `@sethlivingston/eslint-plugin-typescript-narrows` 1.1.2 - repository-specific strict/test/tooling lint presets consumed in `eslint.config.mjs`.
- Vite 8.0.10 - pulled in for browser test infrastructure through Vitest; no separate app bundling config is present outside `vitest.config.ts`.
## Key Dependencies
- `typescript` `^6.0.3` - enforces strict `NodeNext` ESM compilation rules from `tsconfig.json`.
- `tsup` `^8.5.1` - emits `dist/index.js`, `dist/browser/index.js`, and `dist/node/index.js` from `tsup.config.ts`.
- `vitest` `^4.1.5` - runs the parity-first test suite in `tests/parity/`.
- `playwright` `^1.59.1` and `@vitest/browser-playwright` `^4.1.5` - provide real browser projects for runtime export verification in `vitest.config.ts`.
- `eslint` `^10.2.1`, `eslint-plugin-import-x` `^4.16.2`, `eslint-import-resolver-typescript` `^4.4.4`, and `@typescript-eslint/parser` `^8.59.0` - type-aware linting stack for `src/`, `tests/`, and tooling configs via `eslint.config.mjs`.
- `@types/node` `^25.6.0` - Node type support for tooling and Node-targeted entrypoint work.
## Configuration
- No runtime `.env`-driven configuration is detected; an env file was not found at repo root during this scan.
- Runtime target selection is package-export based, not env-var based: `package.json` maps the root export to browser and node conditionals, while explicit subpaths point to `./dist/browser/index.js` and `./dist/node/index.js`.
- Test runtime expectations are injected with compile-time defines in `vitest.config.ts` (`__ONEWAY_HTTP_EXPECTED_ROOT_TARGET__` and `__ONEWAY_HTTP_TEST_PROJECT__`).
- `tsconfig.json` sets `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, strict checking, declaration output metadata, and path aliases for the package root plus `./browser` and `./node`.
- `tsup.config.ts` builds three bundles from `src/index.ts`, `src/browser.ts`, and `src/node.ts`; all builds are ESM-only, bundled, tree-shaken, non-splitting, and target ES2022.
- `package.json` marks the package `type: "module"`, `sideEffects: false`, and publishes only `dist/` plus the license files.
- `eslint.config.mjs` ignores `dist/` and `node_modules/`, configures a TypeScript resolver, and applies the shared narrows lint presets.
- `vitest.config.ts` defines four projects: `node`, `chromium`, `firefox`, and `webkit`.
- `.github/workflows/package-foundation.yml` is the main CI verifier; `.github/workflows/release-package.yml` validates tags, publishes to npm, and creates a GitHub release.
## Platform Requirements
- Use npm with the lockfile in `package-lock.json`.
- Use a modern Node.js version compatible with the repo toolchain; CI proves Node 22 for normal verification in `.github/workflows/package-foundation.yml`.
- Install Playwright browser binaries with `npm run test:browser:install` before running browser parity tests from `package.json`.
- Deployment target is npm package distribution, not a hosted service; release automation publishes `@sethlivingston/oneway-http` to the public npm registry from `.github/workflows/release-package.yml`.
- Consumer targets are Node.js and browser ESM environments; published entrypoints are the generated files under `dist/`, `dist/browser/`, and `dist/node/`.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Use lowercase kebab-case for test helpers and suites in `tests/parity/entrypoint-cases.ts`, `tests/parity/placeholder-assertions.ts`, and `tests/parity/runtime-context.ts`.
- Use short runtime-oriented entrypoint names in `src/index.ts`, `src/browser.ts`, and `src/node.ts`.
- Reserve broad shared names for cross-runtime modules such as `src/shared.ts`.
- Use `camelCase` for functions, including exported helpers such as `createPlaceholderSurface` in `src/shared.ts`, `createEntrypointParityCases` in `tests/parity/entrypoint-cases.ts`, and `defineEntrypointParitySuite` in `tests/parity/suite.ts`.
- Prefix factory-style helpers with `create` or `define` in `src/shared.ts` and `tests/parity/suite.ts`.
- Prefix assertion helpers with `expect` in `tests/parity/placeholder-assertions.ts`.
- Use `camelCase` for locals and exported constants, as seen in `rootSurface` in `src/index.ts`, `browserSurface` in `src/browser.ts`, `nodeSurface` in `src/node.ts`, and `parityRuntimeContext` in `tests/parity/runtime-context.ts`.
- Reserve ALL_CAPS names for compile-time defines declared in `tests/parity/runtime-context.ts`.
- Use `PascalCase` for interfaces and type aliases, including `RuntimeTarget`, `PlaceholderDescription`, `OnewayHttpSurface`, `ParityCase`, `ParityProjectName`, and `ParityRuntimeContext` in `src/shared.ts` and `tests/parity/*.ts`.
- Prefer `readonly` members on exported interfaces in `src/shared.ts`, `tests/parity/runtime-context.ts`, and `tests/parity/placeholder-assertions.ts`.
## Code Style
- No standalone formatter config is detected in `.prettierrc*`, `prettier.config.*`, or `biome.json`.
- Match the existing file style in `src/*.ts`, `tests/parity/*.ts`, `vitest.config.ts`, and `tsup.config.ts`: 2-space indentation, double quotes, semicolons, trailing commas in multiline structures, and wrapped parameter lists when signatures span multiple lines.
- Keep object literals and arrays vertically expanded when they carry multiple fields, following `src/shared.ts` and `vitest.config.ts`.
- Use the repository ESLint flat config in `eslint.config.mjs`.
- Linting is type-aware: `eslint.config.mjs` enables `parserOptions.projectService` and `tsconfigRootDir`, so code is expected to satisfy rules with full TypeScript context from `tsconfig.json`.
- Import resolution is expected to work through the TypeScript resolver configured in `eslint.config.mjs`.
- Repository lint scope is `src`, `tests`, `tsup.config.ts`, and `vitest.config.ts` via the `lint` script in `package.json`.
- The lint baseline is strict enough that `npm run lint` passes cleanly without inline suppressions in `src/` or `tests/`.
## Import Organization
- Package-level aliases are declared in `tsconfig.json` for `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, and `@sethlivingston/oneway-http/node`.
- Tests intentionally exercise those aliases through dynamic `import()` calls in `tests/parity/entrypoint-cases.ts`.
- Local TypeScript ESM imports use explicit `.js` extensions, consistent across `src/*.ts` and `tests/parity/*.ts` and explicitly required by `.github/copilot-instructions.md`.
## Error Handling
- Current implementation code in `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `src/shared.ts` does not throw or catch errors; it returns plain structured values.
- Tests rely on Vitest assertions in `tests/parity/entrypoint-cases.ts` and `tests/parity/placeholder-assertions.ts` instead of custom error wrappers.
- Future runtime code should stay aligned with the explicit structured-result direction documented in `docs/SPEC.md`, not ad hoc thrown exceptions.
## Logging
- Do not add incidental `console` logging to normal library code; existing files in `src/` and `tests/parity/` are log-free.
- Keep diagnostics in documentation and assertions instead of runtime logs, matching `README.md`, `.github/copilot-instructions.md`, and `tests/parity/placeholder-assertions.ts`.
## Comments
- Prefer self-describing names and tiny modules over inline comments; `src/*.ts` and `tests/parity/*.ts` are almost entirely comment-free.
- Put behavioral guidance in durable docs such as `README.md`, `.github/copilot-instructions.md`, and `docs/SPEC.md` rather than scattered source comments.
- JSDoc/TSDoc is not used in `src/` or `tests/`.
- Public intent is currently expressed through exported TypeScript types in `src/shared.ts` and repo docs in `README.md` and `docs/SPEC.md`.
## Function Design
## Module Design
- Use named exports in library and test modules, as in `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `tests/parity/*.ts`.
- Reserve `export default` for tool configuration modules like `eslint.config.mjs`, `vitest.config.ts`, and `tsup.config.ts`.
## Repo-Specific Guidance
- Keep shared runtime-agnostic logic in `src/shared.ts`; keep `src/browser.ts` and `src/node.ts` as thin runtime wrappers, matching `README.md` and `.github/copilot-instructions.md`.
- Treat `src/index.ts` as the neutral/root entry module that must stay coordinated with `package.json` exports, `tsup.config.ts`, and `tests/parity/entrypoint-cases.ts`.
- When behavior should exist across runtimes, add or extend parity helpers in `tests/parity/` instead of writing divergent runtime-only assertions, per `.github/copilot-instructions.md`.
- Keep repository docs aligned with code: `README.md` and `.github/copilot-instructions.md` currently match the scripts in `package.json`, the build targets in `tsup.config.ts`, and the test matrix in `vitest.config.ts`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Keep source modules in a flat `src/` layout and make each public entrypoint a tiny adapter over `src/shared.ts`.
- Express the browser/node split at package-export and build-config level in `package.json` and `tsup.config.ts`, not through runtime detection logic.
- Verify the public package surface through a parity matrix in `vitest.config.ts` and `tests/parity/` instead of testing private internals only.
## Layers
- Purpose: Define what consumers can import and which artifact each runtime receives.
- Location: `package.json`, `tsup.config.ts`, `tsconfig.json`
- Contains: package `exports`, npm scripts, tsup entry definitions, TypeScript path aliases
- Depends on: `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Used by: npm consumers, Vitest module resolution, the build pipeline
- Purpose: Expose the library surface for each package entrypoint.
- Location: `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Contains: module-level surface construction and named re-exports
- Depends on: `src/shared.ts`
- Used by: `tsup.config.ts` during build and consumers via `package.json`
- Purpose: Hold the only reusable domain abstraction currently implemented.
- Location: `src/shared.ts`
- Contains: runtime target types, placeholder description types, and `createPlaceholderSurface()`
- Depends on: no local modules
- Used by: all three files in `src/`
- Purpose: Assert that published entrypoints resolve to the expected runtime surface in Node and real browsers.
- Location: `vitest.config.ts`, `tests/parity/`
- Contains: per-project defines, runtime context helpers, reusable test cases, assertion helpers
- Depends on: built package exports and `src/shared.ts` types
- Used by: `npm run test`, CI in `.github/workflows/package-foundation.yml`, release validation in `.github/workflows/release-package.yml`
- Purpose: Provide the actual publishable artifacts selected by package exports.
- Location: `dist/`, `dist/browser/`, `dist/node/`
- Contains: bundled `.js` and `.d.ts` files for each entrypoint
- Depends on: `tsup.config.ts` and `src/`
- Used by: package consumers and parity tests that import `@sethlivingston/oneway-http*`
## Data Flow
### Primary Request Path
### Parity Verification Flow
- State is module-scoped and immutable after module initialization: `rootSurface` in `src/index.ts`, `browserSurface` in `src/browser.ts`, `nodeSurface` in `src/node.ts`, and `parityRuntimeContext` in `tests/parity/runtime-context.ts`.
## Key Abstractions
- Purpose: Represent the only supported runtime split, `"browser"` or `"node"`.
- Examples: `src/shared.ts`, `tests/parity/runtime-context.ts`
- Pattern: shared discriminant union reused by source and tests
- Purpose: Describe the current public API contract exposed by every entrypoint.
- Examples: `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`
- Pattern: tiny interface exported indirectly through entrypoint-specific constants
- Purpose: Centralize creation of the current scaffold implementation so all entrypoints share one shape.
- Examples: `src/shared.ts`
- Pattern: pure factory function with no side effects
- Purpose: Carry per-project expectations into the shared parity suite.
- Examples: `tests/parity/runtime-context.ts`, `tests/parity/entrypoint-cases.ts`
- Pattern: compile-time defines converted into a small immutable runtime object
## Entry Points
- Location: `src/index.ts`
- Triggers: imported via `@sethlivingston/oneway-http` and built to `dist/index.js`
- Responsibilities: expose `runtimeTarget` and `describe`, and provide the neutral fallback source entrypoint
- Location: `src/browser.ts`
- Triggers: imported via `@sethlivingston/oneway-http/browser` or selected by the `"browser"` export condition
- Responsibilities: expose the browser-targeted placeholder surface
- Location: `src/node.ts`
- Triggers: imported via `@sethlivingston/oneway-http/node` or selected by the `"node"` export condition
- Responsibilities: expose the node-targeted placeholder surface
- Location: `tsup.config.ts`
- Triggers: `npm run build`, `npm run test*`, CI, and release validation
- Responsibilities: emit the three publishable ESM bundles and declaration files
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
### One-off tests outside the parity harness
## Error Handling
- `src/shared.ts` returns plain objects and does not throw or catch.
- Parity failures surface as `expect()` assertions in `tests/parity/placeholder-assertions.ts` and `tests/parity/entrypoint-cases.ts`.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
