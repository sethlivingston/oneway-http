# Technology Stack

**Analysis Date:** 2026-04-27

## Languages

**Primary:**
- TypeScript 6.x - all library code and most tooling live in `src/*.ts`, `tests/parity/*.ts`, `tsup.config.ts`, and `vitest.config.ts`; `package.json` pins `typescript` to `^6.0.3`.

**Secondary:**
- JavaScript ESM - ESLint configuration is authored in `eslint.config.mjs`.
- YAML - automation and dependency update policy live in `.github/workflows/package-foundation.yml`, `.github/workflows/release-package.yml`, and `.github/dependabot.yml`.
- Markdown - package and security documentation live in `README.md`, `SECURITY.md`, and `docs/SPEC.md`.

## Runtime

**Environment:**
- Node.js - repository scripts in `package.json` run through Node; CI uses Node 22 in `.github/workflows/package-foundation.yml` and release validation/publish uses Node 24 in `.github/workflows/release-package.yml`.
- Browser runtimes - browser parity projects run in Chromium, Firefox, and WebKit through `vitest.config.ts`.

**Package Manager:**
- npm - all scripts are npm scripts in `package.json`.
- Lockfile: present in `package-lock.json` (lockfileVersion 3).

## Frameworks

**Core:**
- No application framework detected - the repository is an ESM library scaffold with conditional package exports in `package.json` and thin runtime entrypoints in `src/index.ts`, `src/browser.ts`, and `src/node.ts`.

**Testing:**
- Vitest 4.1.5 - test runner configured in `vitest.config.ts` and invoked by `package.json` scripts.
- Playwright 1.59.1 via `@vitest/browser-playwright` 4.1.5 - browser execution provider used by the Chromium, Firefox, and WebKit projects in `vitest.config.ts`.

**Build/Dev:**
- tsup 8.5.1 - bundler for the three published ESM outputs configured in `tsup.config.ts`.
- TypeScript 6.0.3 - typechecking and declaration generation basis configured in `tsconfig.json`.
- ESLint 10.2.1 - lint runner configured in `eslint.config.mjs`.
- `@sethlivingston/eslint-plugin-typescript-narrows` 1.1.2 - repository-specific strict/test/tooling lint presets consumed in `eslint.config.mjs`.
- Vite 8.0.10 - pulled in for browser test infrastructure through Vitest; no separate app bundling config is present outside `vitest.config.ts`.

## Key Dependencies

**Critical:**
- `typescript` `^6.0.3` - enforces strict `NodeNext` ESM compilation rules from `tsconfig.json`.
- `tsup` `^8.5.1` - emits `dist/index.js`, `dist/browser/index.js`, and `dist/node/index.js` from `tsup.config.ts`.
- `vitest` `^4.1.5` - runs the parity-first test suite in `tests/parity/`.
- `playwright` `^1.59.1` and `@vitest/browser-playwright` `^4.1.5` - provide real browser projects for runtime export verification in `vitest.config.ts`.

**Infrastructure:**
- `eslint` `^10.2.1`, `eslint-plugin-import-x` `^4.16.2`, `eslint-import-resolver-typescript` `^4.4.4`, and `@typescript-eslint/parser` `^8.59.0` - type-aware linting stack for `src/`, `tests/`, and tooling configs via `eslint.config.mjs`.
- `@types/node` `^25.6.0` - Node type support for tooling and Node-targeted entrypoint work.

## Configuration

**Environment:**
- No runtime `.env`-driven configuration is detected; an env file was not found at repo root during this scan.
- Runtime target selection is package-export based, not env-var based: `package.json` maps the root export to browser and node conditionals, while explicit subpaths point to `./dist/browser/index.js` and `./dist/node/index.js`.
- Test runtime expectations are injected with compile-time defines in `vitest.config.ts` (`__ONEWAY_HTTP_EXPECTED_ROOT_TARGET__` and `__ONEWAY_HTTP_TEST_PROJECT__`).

**Build:**
- `tsconfig.json` sets `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, strict checking, declaration output metadata, and path aliases for the package root plus `./browser` and `./node`.
- `tsup.config.ts` builds three bundles from `src/index.ts`, `src/browser.ts`, and `src/node.ts`; all builds are ESM-only, bundled, tree-shaken, non-splitting, and target ES2022.
- `package.json` marks the package `type: "module"`, `sideEffects: false`, and publishes only `dist/` plus the license files.
- `eslint.config.mjs` ignores `dist/` and `node_modules/`, configures a TypeScript resolver, and applies the shared narrows lint presets.
- `vitest.config.ts` defines four projects: `node`, `chromium`, `firefox`, and `webkit`.
- `.github/workflows/package-foundation.yml` is the main CI verifier; `.github/workflows/release-package.yml` validates tags, publishes to npm, and creates a GitHub release.

## Platform Requirements

**Development:**
- Use npm with the lockfile in `package-lock.json`.
- Use a modern Node.js version compatible with the repo toolchain; CI proves Node 22 for normal verification in `.github/workflows/package-foundation.yml`.
- Install Playwright browser binaries with `npm run test:browser:install` before running browser parity tests from `package.json`.

**Production:**
- Deployment target is npm package distribution, not a hosted service; release automation publishes `@sethlivingston/oneway-http` to the public npm registry from `.github/workflows/release-package.yml`.
- Consumer targets are Node.js and browser ESM environments; published entrypoints are the generated files under `dist/`, `dist/browser/`, and `dist/node/`.

---

*Stack analysis: 2026-04-27*
