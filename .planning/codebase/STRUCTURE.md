# Codebase Structure

**Analysis Date:** 2026-04-27

## Directory Layout

```text
oneway-http/
├── `.github/workflows/`   # CI and release automation
├── `.planning/codebase/`  # repository mapping documents
├── `dist/`                # generated build output for package publishing
├── `docs/`                # package specification and design intent
├── `src/`                 # runtime entrypoints and shared scaffold code
├── `tests/parity/`        # runtime-parity verification suite
├── `package.json`         # package metadata, exports, and npm scripts
├── `tsconfig.json`        # TypeScript compiler settings and path aliases
├── `tsup.config.ts`       # multi-entry build definition
└── `vitest.config.ts`     # multi-project parity test definition
```

## Directory Purposes

**`src/`:**
- Purpose: Hold the published source surface for the library.
- Contains: `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `src/shared.ts`
- Key files: `src/index.ts`, `src/browser.ts`, `src/node.ts`, `src/shared.ts`

**`tests/parity/`:**
- Purpose: Verify that Node and browser consumers see the same package shape with runtime-appropriate values.
- Contains: reusable suite helpers, runtime context helpers, and the single top-level parity test file
- Key files: `tests/parity/entrypoints.test.ts`, `tests/parity/entrypoint-cases.ts`, `tests/parity/runtime-context.ts`, `tests/parity/placeholder-assertions.ts`, `tests/parity/suite.ts`

**`docs/`:**
- Purpose: Store design documentation that is broader than the current scaffold implementation.
- Contains: the HTTP client specification
- Key files: `docs/SPEC.md`

**`dist/`:**
- Purpose: Store generated publish artifacts selected by `package.json` exports.
- Contains: `dist/index.js`, `dist/index.d.ts`, `dist/browser/index.js`, `dist/browser/index.d.ts`, `dist/node/index.js`, `dist/node/index.d.ts`
- Key files: `dist/index.js`, `dist/browser/index.js`, `dist/node/index.js`

**`.github/workflows/`:**
- Purpose: Define repository automation around validation and release.
- Contains: CI and package release workflows
- Key files: `.github/workflows/package-foundation.yml`, `.github/workflows/release-package.yml`

## Key File Locations

**Entry Points:**
- `src/index.ts`: root source entrypoint for `@sethlivingston/oneway-http`
- `src/browser.ts`: explicit browser source entrypoint for `@sethlivingston/oneway-http/browser`
- `src/node.ts`: explicit node source entrypoint for `@sethlivingston/oneway-http/node`
- `tests/parity/entrypoints.test.ts`: single Vitest test file that boots the parity suite

**Configuration:**
- `package.json`: package metadata, conditional exports, npm scripts, and publish settings
- `tsconfig.json`: strict compiler options and path aliases for all three package entrypoints
- `tsup.config.ts`: three-output build graph for root, browser, and node bundles
- `vitest.config.ts`: one Node project plus three Playwright browser projects
- `eslint.config.mjs`: shared lint configuration for source, tests, and tooling files

**Core Logic:**
- `src/shared.ts`: runtime target types, placeholder surface interface, and surface factory
- `src/index.ts`: root placeholder surface wiring
- `src/browser.ts`: browser placeholder surface wiring
- `src/node.ts`: node placeholder surface wiring

**Testing:**
- `tests/parity/entrypoint-cases.ts`: reusable test cases for package export behavior
- `tests/parity/runtime-context.ts`: per-project runtime expectation object
- `tests/parity/placeholder-assertions.ts`: shared assertions for the current placeholder API
- `vitest.config.ts`: project matrix that makes the same tests run in Node and browsers

## Naming Conventions

**Files:**
- Source and helper files use lowercase filenames with concise role-based names, such as `src/shared.ts`, `src/browser.ts`, and `tests/parity/entrypoint-cases.ts`.
- Test helpers use kebab-case names in `tests/parity/`, such as `placeholder-assertions.ts` and `runtime-context.ts`.
- Tooling files use the standard tool filenames, such as `tsup.config.ts`, `vitest.config.ts`, and `eslint.config.mjs`.

**Directories:**
- Top-level directories are short lowercase nouns, such as `src/`, `tests/`, `docs/`, and `dist/`.
- The only nested test directory currently in use is `tests/parity/`, which names the responsibility of the entire suite instead of mirroring `src/`.

## Where to Add New Code

**New Feature:**
- Primary code: add shared feature code under `src/` next to `src/shared.ts`, then wire public exports through `src/index.ts`, `src/browser.ts`, and/or `src/node.ts` as needed.
- Tests: add cross-runtime expectations under `tests/parity/` when the public surface must match in Node and browsers.

**New Component/Module:**
- Implementation: keep new modules in the flat `src/` layout unless a real runtime-specific subtree is introduced; runtime-specific entry wiring still belongs in `src/browser.ts` and `src/node.ts`.

**Utilities:**
- Shared helpers: place shared reusable helpers alongside `src/shared.ts` in `src/`, and keep test-only helpers inside `tests/parity/` instead of importing from `dist/`.

## Special Directories

**`dist/`:**
- Purpose: generated output consumed by package exports and tests that import the built package
- Generated: Yes
- Committed: No

**`tests/parity/`:**
- Purpose: architecture-level regression suite for package export parity
- Generated: No
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: repository map documents used by later planning and execution commands
- Generated: Yes
- Committed: Yes

---

*Structure analysis: 2026-04-27*
