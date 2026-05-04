# Codebase Structure

**Analysis Date:** 2026-05-04

## Directory Layout

```
oneway-http/
├── src/                      # Library source — all TypeScript, ESM
│   ├── shared.ts             # Shared types, interfaces, factory function
│   ├── index.ts              # Root/neutral entrypoint
│   ├── browser.ts            # Browser-explicit entrypoint
│   └── node.ts               # Node.js-explicit entrypoint
├── tests/                    # All test code
│   └── parity/               # Cross-runtime entrypoint parity suite
│       ├── entrypoints.test.ts       # Suite registration (vitest entry)
│       ├── suite.ts                  # Suite definition using vitest describe/it
│       ├── entrypoint-cases.ts       # Individual test case definitions
│       ├── runtime-context.ts        # Runtime-injected context (project name, expected target)
│       └── placeholder-assertions.ts # Reusable surface shape assertions
├── docs/                     # Design documentation
│   └── SPEC.md               # Full HTTP client specification (not yet implemented)
├── dist/                     # Build output — generated, not committed
│   ├── index.js              # Neutral bundle
│   ├── index.d.ts            # Neutral declarations
│   ├── browser/
│   │   ├── index.js          # Browser bundle
│   │   └── index.d.ts        # Browser declarations
│   └── node/
│       ├── index.js          # Node bundle
│       └── index.d.ts        # Node declarations
├── .github/
│   ├── workflows/
│   │   ├── package-foundation.yml    # CI: typecheck, lint, build, parity tests
│   │   └── release-package.yml       # Release: validate + npm publish via OIDC
│   └── dependabot.yml
├── package.json              # Package manifest, exports map, scripts
├── tsconfig.json             # TypeScript config (NodeNext, strict++, noEmit)
├── tsup.config.ts            # Three-target build config (neutral/browser/node)
├── vitest.config.ts          # Four-project test config (node/chromium/firefox/webkit)
├── eslint.config.mjs         # ESLint config using @sethlivingston/eslint-plugin-typescript-narrows
├── README.md                 # Development, CI, and release documentation
├── SECURITY.md               # Security policy
├── CODEOWNERS                # Repository ownership
├── copilot-instructions.md   # AI coding assistant instructions
├── LICENSE-APACHE            # Apache 2.0 license
└── LICENSE-MIT               # MIT license
```

## Directory Purposes

**`src/`:**
- Purpose: All library source code; the only code that ends up in the published package
- Contains: TypeScript source files — one shared module and three platform entrypoints
- Key files: `src/shared.ts` (core types and factory), `src/index.ts` (neutral), `src/browser.ts` (browser), `src/node.ts` (node)

**`tests/parity/`:**
- Purpose: Runtime parity test suite that runs identically across Node.js, Chromium, Firefox, and WebKit
- Contains: Suite definition, runtime context, test cases, assertions
- Key files: `tests/parity/entrypoints.test.ts` (vitest entry), `tests/parity/runtime-context.ts` (inject-time constants), `tests/parity/entrypoint-cases.ts` (all test case logic)

**`docs/`:**
- Purpose: Design and specification documents
- Contains: `SPEC.md` — the full HTTP client specification that will guide future implementation
- Generated: No
- Committed: Yes

**`dist/`:**
- Purpose: Compiled output produced by `npm run build`
- Contains: Three bundles (neutral, browser, node) with ESM JS and TypeScript declarations
- Generated: Yes
- Committed: No (excluded in `.gitignore`, included in npm `files` array)

**`.github/workflows/`:**
- Purpose: CI/CD pipelines
- Contains: `package-foundation.yml` (quality checks + parity tests on push/PR), `release-package.yml` (validates + publishes to npm on `vX.Y.Z` tag)

## Key File Locations

**Entry Points:**
- `src/index.ts`: Root/neutral package entrypoint — imported as `"@sethlivingston/oneway-http"`
- `src/browser.ts`: Browser-explicit entrypoint — imported as `"@sethlivingston/oneway-http/browser"`
- `src/node.ts`: Node-explicit entrypoint — imported as `"@sethlivingston/oneway-http/node"`

**Core Types and Shared Logic:**
- `src/shared.ts`: `RuntimeTarget`, `OnewayHttpSurface`, `PlaceholderDescription`, `createPlaceholderSurface()`

**Configuration:**
- `tsconfig.json`: TypeScript compiler options (strict, NodeNext, ES2022, verbatimModuleSyntax)
- `tsup.config.ts`: Build — three tsup entries producing neutral/browser/node artifacts
- `vitest.config.ts`: Tests — four projects (node/chromium/firefox/webkit) with injected `define` constants
- `eslint.config.mjs`: Linting — type-aware ESLint via `@sethlivingston/eslint-plugin-typescript-narrows`
- `package.json`: Exports map with `browser`/`node` conditions; `sideEffects: false`

**Specification:**
- `docs/SPEC.md`: Complete HTTP client design spec (request model, response matching, `send()` result contract, retry, body, transport errors)

**Testing:**
- `tests/parity/entrypoints.test.ts`: Vitest test file (suite entry)
- `tests/parity/entrypoint-cases.ts`: All test case definitions
- `tests/parity/suite.ts`: Suite scaffolding (`describe` + `it` wiring)
- `tests/parity/runtime-context.ts`: Compile-time injected constants via vitest `define`
- `tests/parity/placeholder-assertions.ts`: Reusable assertion helper `expectPlaceholderSurface()`

## Naming Conventions

**Files:**
- `kebab-case` for multi-word file names (e.g., `entrypoint-cases.ts`, `runtime-context.ts`, `placeholder-assertions.ts`)
- Single-word files use plain lowercase (e.g., `shared.ts`, `suite.ts`)
- Test files end in `.test.ts`

**Directories:**
- Lowercase, kebab-case (e.g., `tests/parity/`)

**TypeScript identifiers:**
- Types and interfaces: `PascalCase` (e.g., `OnewayHttpSurface`, `RuntimeTarget`, `ParityRuntimeContext`)
- Functions: `camelCase` (e.g., `createPlaceholderSurface`, `defineEntrypointParitySuite`, `createEntrypointParityCases`)
- Constants: `camelCase` for runtime values (e.g., `parityRuntimeContext`, `browserSurface`); `SCREAMING_SNAKE_CASE` for injected compile-time constants (e.g., `__ONEWAY_HTTP_EXPECTED_ROOT_TARGET__`)
- Exports: named only — no default exports

## Where to Add New Code

**New core HTTP client logic (spec implementation):**
- Shared/cross-platform types and abstractions: `src/shared.ts`
- Browser-specific transport implementation: new file(s) under `src/` imported by `src/browser.ts`
- Node-specific transport implementation: new file(s) under `src/` imported by `src/node.ts`
- New public exports: add named exports in `src/browser.ts` and/or `src/node.ts` (mirror in `src/index.ts` if cross-platform)

**New sub-path entrypoint (e.g., `@sethlivingston/oneway-http/diagnostics`):**
1. Create `src/diagnostics.ts`
2. Add tsup entry in `tsup.config.ts` with appropriate `outDir` and `platform`
3. Add `exports` condition in `package.json`
4. Add `paths` alias in `tsconfig.json` for test resolution

**New parity test cases:**
- Add case objects to the array returned by `createEntrypointParityCases()` in `tests/parity/entrypoint-cases.ts`
- Add helper assertions to `tests/parity/placeholder-assertions.ts` if reusable

**New test suite (non-parity):**
- Create a new directory under `tests/` (e.g., `tests/unit/`)
- Add test files with `.test.ts` suffix
- Update `vitest.config.ts` `include` patterns for any new project if needed

**Utilities shared between tests:**
- `tests/parity/` for parity-specific helpers; create `tests/helpers/` for broader shared test utilities if needed

## Special Directories

**`dist/`:**
- Purpose: Compiled ESM bundles and TypeScript declarations for all three targets
- Generated: Yes — via `npm run build` (`tsup`)
- Committed: No

**`.planning/`:**
- Purpose: Planning and codebase map documents used by GSD tooling
- Generated: Partially (by GSD commands)
- Committed: Yes

**`.github/`:**
- Purpose: GitHub Actions CI/CD workflows and Dependabot config
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-04*
