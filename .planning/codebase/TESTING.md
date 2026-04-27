# Testing Patterns

**Analysis Date:** 2026-04-27

## Test Framework

**Runner:**
- `vitest` `^4.1.5`
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest `expect` from `tests/parity/entrypoint-cases.ts` and `tests/parity/placeholder-assertions.ts`

**Run Commands:**
```bash
npm run test                 # Run all configured Vitest projects after the pretest build in `package.json`
npm run test:browser         # Run the Chromium, Firefox, and WebKit projects after the pretest build in `package.json`
npm run verify               # Run `typecheck`, `lint`, and the full test suite as documented in `README.md`
```

## Test File Organization

**Location:**
- Tests live under the dedicated parity tree in `tests/parity/`.
- The configured include glob is `tests/parity/**/*.test.ts` in `vitest.config.ts`.
- The only current test entry file is `tests/parity/entrypoints.test.ts`; helper modules stay alongside it in `tests/parity/`.

**Naming:**
- Test files use the `*.test.ts` suffix, as in `tests/parity/entrypoints.test.ts`.
- Helper files use descriptive kebab-case names, as in `tests/parity/entrypoint-cases.ts` and `tests/parity/placeholder-assertions.ts`.

**Structure:**
```text
tests/
└── parity/
    ├── entrypoints.test.ts
    ├── entrypoint-cases.ts
    ├── placeholder-assertions.ts
    ├── runtime-context.ts
    └── suite.ts
```

## Test Structure

**Suite Organization:**
```typescript
// `tests/parity/suite.ts`
export function defineEntrypointParitySuite(): void {
  describe(`entrypoint parity (${parityRuntimeContext.projectName})`, () => {
    for (const parityCase of createEntrypointParityCases()) {
      if (parityCase.enabled === false) {
        it.skip(parityCase.name, parityCase.run);
        continue;
      }

      it(parityCase.name, parityCase.run);
    }
  });
}
```

**Patterns:**
- Test entry files are tiny and only wire up shared suites, as in `tests/parity/entrypoints.test.ts`.
- Case definitions are centralized in factory helpers, as in `createEntrypointParityCases()` in `tests/parity/entrypoint-cases.ts`.
- Runtime-specific expectations come from injected compile-time defines surfaced through `parityRuntimeContext` in `tests/parity/runtime-context.ts`.
- Assertions are extracted into reusable helpers, as in `expectPlaceholderSurface()` in `tests/parity/placeholder-assertions.ts`.
- No custom setup or teardown hooks are present in `tests/parity/` or `vitest.config.ts`.

## Mocking

**Framework:** No mocking framework or stubbing helper is used in `tests/parity/`.

**Patterns:**
```typescript
// `tests/parity/entrypoint-cases.ts`
const module = await import("@sethlivingston/oneway-http");
expectPlaceholderSurface(module, parityRuntimeContext.expectedRootTarget);
```

**What to Mock:**
- No repository pattern currently mocks dependencies. Add mocks only if a future test cannot run against the real built package surface from `dist/`.

**What NOT to Mock:**
- Do not mock package entrypoint resolution tested in `tests/parity/entrypoint-cases.ts`; the suite is intentionally verifying real conditional exports from `package.json`.
- Do not mock runtime context wiring from `vitest.config.ts`; browser and node differences are supposed to come from real Vitest project configuration.

## Fixtures and Factories

**Test Data:**
```typescript
// `tests/parity/runtime-context.ts`
export const parityRuntimeContext: ParityRuntimeContext = {
  expectedRootTarget: __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__,
  isBrowserProject: __ONEWAY_HTTP_TEST_PROJECT__ !== "node",
  projectName: __ONEWAY_HTTP_TEST_PROJECT__,
  supportsExplicitNodeEntrypoint: __ONEWAY_HTTP_TEST_PROJECT__ === "node",
};
```

**Location:**
- Shared runtime fixture state lives in `tests/parity/runtime-context.ts`.
- Reusable assertion helpers live in `tests/parity/placeholder-assertions.ts`.
- The test-case factory lives in `tests/parity/entrypoint-cases.ts`.

## Coverage

**Requirements:** No coverage script, threshold, or coverage reporter is configured in `package.json` or `vitest.config.ts`.

**View Coverage:**
```bash
Not configured in `package.json` or `vitest.config.ts`
```

## Runtime Matrix

- `vitest.config.ts` defines four projects: `node`, `chromium`, `firefox`, and `webkit`.
- The node project uses `environment: "node"` in `vitest.config.ts`.
- The browser projects use `@vitest/browser-playwright` with Playwright browsers enabled headlessly in `vitest.config.ts`.
- Browser test prerequisites are explicit: install local browser binaries with `npm run test:browser:install` from `package.json`.
- CI mirrors the same split in `.github/workflows/package-foundation.yml`: one quality job, one Node parity job, and a browser matrix for Chromium, Firefox, and WebKit.

## Test Types

**Unit Tests:**
- Traditional unit tests are minimal to nonexistent. The current suite in `tests/parity/` is not testing isolated functions with mocks; it is testing published entrypoint behavior end-to-end within each runtime project.

**Integration Tests:**
- The current testing strategy is parity-first integration testing. `tests/parity/entrypoint-cases.ts` dynamically imports the package root and explicit subpath exports, then validates the real exported surface.
- Current coverage is narrow but strict for the area it targets: one `*.test.ts` file fans out into four parity cases across four Vitest projects, producing 16 runtime executions when the full matrix runs.
- The explicit node entrypoint case is conditionally skipped outside the node project via `enabled: parityRuntimeContext.supportsExplicitNodeEntrypoint` in `tests/parity/entrypoint-cases.ts`.

**E2E Tests:**
- Standalone E2E tests are not used.
- `playwright` in `package.json` is used as the browser engine provider for Vitest projects in `vitest.config.ts`, not as a separate browser automation suite.

## Common Patterns

**Async Testing:**
```typescript
// `tests/parity/entrypoint-cases.ts`
{
  name: "loads the explicit browser entrypoint",
  run: async () => {
    const module = await import("@sethlivingston/oneway-http/browser");
    expectPlaceholderSurface(module, "browser");
  },
}
```

**Error Testing:**
```typescript
No explicit error-path tests are present in `tests/parity/entrypoint-cases.ts` or elsewhere under `tests/`
```

## Verification Maturity

- The verification workflow is disciplined for a small scaffold: `npm run typecheck`, `npm run lint`, and `npm run test` all pass, and `npm run test:node` currently executes 4 passing parity tests after a build.
- The strategy is mature in matrix shape because local scripts in `package.json`, developer guidance in `README.md` and `.github/copilot-instructions.md`, and CI in `.github/workflows/package-foundation.yml` all agree on the same Node-plus-three-browser runtime split.
- The strategy is still early in breadth because tests only cover package entrypoint resolution and the placeholder surface from `src/shared.ts`; no HTTP behavior from `docs/SPEC.md` is implemented or tested yet.

---

*Testing analysis: 2026-04-27*
