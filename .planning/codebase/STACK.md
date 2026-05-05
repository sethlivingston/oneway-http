# Technology Stack

**Analysis Date:** 2026-05-04

## Languages

**Primary:**
- TypeScript 6.x (`^6.0.3`) — all source code in `src/` and `tests/`

**Secondary:**
- JavaScript (ESM) — output format only; no hand-authored `.js` source files

## Runtime

**Environment:**
- Node.js 24 (pinned in CI via `actions/setup-node`; local dev runs whatever is available)
- Browser targets: Chromium, Firefox, WebKit (via Playwright)

**Package Manager:**
- npm 11.13.0 (pinned in CI via `npm install --global npm@11.13.0`)
- Lockfile: `package-lock.json` present (lockfileVersion: 3)

## Frameworks

**Testing:**
- Vitest `^4.1.5` — test runner for all suites
  - Config: `vitest.config.ts`
  - Projects: `node`, `chromium`, `firefox`, `webkit` (multi-project parity strategy)
- `@vitest/browser-playwright` `^4.1.5` — bridges Vitest with Playwright for real-browser test execution

**Build:**
- tsup `^8.5.1` — bundles the library into `dist/`
  - Config: `tsup.config.ts`
  - Produces three separate bundles:
    - `dist/` — platform-neutral entry (`src/index.ts`)
    - `dist/browser/` — browser-specific entry (`src/browser.ts`)
    - `dist/node/` — Node.js-specific entry (`src/node.ts`)
  - Format: ESM only (`format: ["esm"]`)
  - Target: `es2022`
  - Tree-shaking enabled; declaration files + maps emitted; no sourcemaps in output
- Vite `^8.0.10` — underlying dev/build engine (peer dependency of Vitest/tsup)

**Linting:**
- ESLint `^10.2.1` — config: `eslint.config.mjs` (flat config format)
- `@typescript-eslint/parser` `^8.59.0` — TypeScript AST parser for ESLint
- `eslint-plugin-import-x` `^4.16.2` — import ordering and resolution rules
- `eslint-import-resolver-typescript` `^4.4.4` — TypeScript-aware import resolution
- `@sethlivingston/eslint-plugin-typescript-narrows` `^1.1.2` — custom strict/test/tooling configs applied via `tsnarrows.configs.strict`, `.test`, `.tooling`

## Key Dependencies

**Runtime (zero production dependencies):**
- No `dependencies` in `package.json` — this is a zero-dependency library

**Development / Build toolchain:**
- `typescript` `^6.0.3` — compiler; `noEmit: true` in `tsconfig.json` (tsup handles emit)
- `@types/node` `^25.6.0` — Node.js type definitions
- `playwright` `^1.59.1` — real browser automation for cross-browser parity tests

## Configuration

**TypeScript (`tsconfig.json`):**
- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`
- Strict mode: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- `verbatimModuleSyntax: true`, `isolatedModules: true`
- `ignoreDeprecations: "6.0"` — suppresses TypeScript 6 deprecation warnings
- Path aliases map package names to local `src/` files for in-repo type checking:
  - `@sethlivingston/oneway-http` → `./src/index.ts`
  - `@sethlivingston/oneway-http/browser` → `./src/browser.ts`
  - `@sethlivingston/oneway-http/node` → `./src/node.ts`

**Build (`tsup.config.ts`):**
- Three build targets sharing common options (see Frameworks above)
- `sideEffects: false` declared in `package.json` for aggressive tree-shaking by consumers

**Package exports (`package.json`):**
- Conditional exports: `browser` condition → `dist/browser/`, `node` condition → `dist/node/`, default → `dist/`
- Named sub-path exports: `./browser` and `./node`

**Environment:**
- No `.env` files; no runtime environment variables required
- All configuration is file-based (no secrets or external config needed to build/test)

## Platform Requirements

**Development:**
- Node.js 24
- npm 11.13.0
- Playwright browsers installed: `npm run test:browser:install` (runs `playwright install chromium firefox webkit`)

**Production / Published package:**
- ESM-only output; consumers must use an ESM-capable bundler or Node.js with `"type": "module"`
- Zero runtime dependencies
- Published to npm as `@sethlivingston/oneway-http` (public, with provenance attestation)
- Dual-licensed: Apache-2.0 OR MIT

---

*Stack analysis: 2026-05-04*
