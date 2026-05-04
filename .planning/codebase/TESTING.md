# Testing Patterns

**Analysis Date:** 2026-05-04

## Test Framework

**Runner:**
- Vitest ^4.1.5
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`) — no separate assertion library

**Browser Provider:**
- `@vitest/browser-playwright` ^4.1.5 with Playwright ^1.59.1
- Runs tests in real browser engines (Chromium, Firefox, WebKit)

**Run Commands:**
```bash
npm run test                 # Run all projects (node + chromium + firefox + webkit)
npm run test:node            # Node.js project only
npm run test:browser         # All three browser projects
npm run test:chromium        # Chromium only
npm run test:firefox         # Firefox only
npm run test:webkit          # WebKit only
npm run verify               # typecheck + lint + full test suite (used in CI and release)
```

> **Note:** Every `test` and `test:*` script has a matching `pretest` / `pretest:*` script that runs `npm run build` first. Tests always execute against the built `dist/` artifacts, not raw source files.

## Test File Organization

**Location:**
- All tests live under `tests/parity/` — separate from `src/`, never co-located
- Test runner entry: `tests/parity/entrypoints.test.ts` (the only `*.test.ts` file)
- Test helpers: `tests/parity/entrypoint-cases.ts`, `tests/parity/placeholder-assertions.ts`, `tests/parity/runtime-context.ts`, `tests/parity/suite.ts`

**Naming:**
- Test file: `<subject>.test.ts`
- Case factory: `create<Subject>Cases.ts` → `entrypoint-cases.ts`
- Assertion helpers: `<subject>-assertions.ts` → `placeholder-assertions.ts`
- Suite definition: `suite.ts`
- Runtime config: `runtime-context.ts`

**Structure:**
```
tests/
└── parity/
    ├── entrypoints.test.ts        # Vitest entry — calls defineEntrypointParitySuite()
    ├── suite.ts                   # Suite factory — wraps cases in describe/it blocks
    ├── entrypoint-cases.ts        # Case definitions as a readonly array of ParityCase objects
    ├── placeholder-assertions.ts  # Reusable expect-prefixed assertion helpers
    └── runtime-context.ts         # Compile-time defines → runtime ParityRuntimeContext object
```

## Test Structure

**Suite Organization:**

The test file is a single line that delegates entirely to the suite factory:

```typescript
// tests/parity/entrypoints.test.ts
import { defineEntrypointParitySuite } from "./suite.js";

defineEntrypointParitySuite();
```

The suite factory reads the runtime context and iterates case objects:

```typescript
// tests/parity/suite.ts
import { describe, it } from "vitest";
import { createEntrypointParityCases } from "./entrypoint-cases.js";
import { parityRuntimeContext } from "./runtime-context.js";

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

**Case Objects Pattern:**

Cases are plain objects in a `readonly` array returned by a factory function:

```typescript
// tests/parity/entrypoint-cases.ts
interface ParityCase {
  readonly enabled?: boolean;   // omit or true = enabled; false = skipped
  readonly name: string;
  readonly run: () => void | Promise<void>;
}

export function createEntrypointParityCases(): readonly ParityCase[] {
  return [
    {
      name: "loads the root package entrypoint for <runtime>",
      run: async () => {
        const module = await import("@sethlivingston/oneway-http");
        expectPlaceholderSurface(module, parityRuntimeContext.expectedRootTarget);
      },
    },
    {
      enabled: parityRuntimeContext.supportsExplicitNodeEntrypoint,
      name: "loads the explicit node entrypoint when the runtime supports it",
      run: async () => {
        const module = await import("@sethlivingston/oneway-http/node");
        expectPlaceholderSurface(module, "node");
      },
    },
  ];
}
```

**Patterns:**
- No `beforeEach` / `afterEach` / `beforeAll` / `afterAll` hooks — tests are self-contained
- Async tests use `async () => { ... }` with `await import()`
- Sync tests use `(): void => { ... }` with explicit return type annotation
- Conditionally skipped cases use `enabled: false` on the case object — the suite factory calls `it.skip`

## Multi-Project (Parity) Architecture

Vitest is configured with four **projects** in `vitest.config.ts`. The same `tests/parity/` test files execute in all four:

| Project | Environment | `expectedRootTarget` |
|---------|-------------|----------------------|
| `node` | Node.js | `"node"` |
| `chromium` | Playwright Chromium (headless) | `"browser"` |
| `firefox` | Playwright Firefox (headless) | `"browser"` |
| `webkit` | Playwright WebKit (headless) | `"browser"` |

Runtime expectations are injected as compile-time defines:

```typescript
// vitest.config.ts
{
  define: {
    __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: JSON.stringify("node"),
    __ONEWAY_HTTP_TEST_PROJECT__: JSON.stringify("node"),
  },
  test: { environment: "node", name: "node" },
}
```

These defines are consumed in `tests/parity/runtime-context.ts`:

```typescript
declare const __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: RuntimeTarget;
declare const __ONEWAY_HTTP_TEST_PROJECT__: ParityProjectName;

export const parityRuntimeContext: ParityRuntimeContext = {
  expectedRootTarget: __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__,
  isBrowserProject: __ONEWAY_HTTP_TEST_PROJECT__ !== "node",
  projectName: __ONEWAY_HTTP_TEST_PROJECT__,
  supportsExplicitNodeEntrypoint: __ONEWAY_HTTP_TEST_PROJECT__ === "node",
};
```

**This means:** a single parity case body is runtime-neutral. Use `parityRuntimeContext` to gate runtime-specific behavior.

## Mocking

**Framework:** None detected — no `vi.mock`, `vi.fn`, or spy utilities in the codebase.

**What to Mock:**
- Not applicable at current scaffolding stage; tests exercise real module imports from built `dist/` artifacts

**What NOT to Mock:**
- Never mock the package imports themselves (`@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, `@sethlivingston/oneway-http/node`) — the entire point of the parity suite is verifying real export resolution

## Assertion Helpers

Assertion helpers are separate functions prefixed with `expect` and live in `tests/parity/placeholder-assertions.ts`:

```typescript
// tests/parity/placeholder-assertions.ts
export function expectPlaceholderSurface(
  surface: PlaceholderSurface,
  expectedRuntime: RuntimeTarget,
): void {
  expect(surface.runtimeTarget).toBe(expectedRuntime);
  expect(surface.describe()).toEqual({
    implementation: "placeholder",
    runtime: expectedRuntime,
  });
}
```

**Rules:**
- Assertion helpers are named `expect*` and return `void`
- They accept the subject as the first argument and expectations as subsequent arguments
- They are reused across multiple cases rather than inlining `expect()` chains

## Fixtures and Factories

**Test Data:**
- No fixture files — test inputs are inline literals or derived from `parityRuntimeContext`
- The `parityRuntimeContext` object in `tests/parity/runtime-context.ts` acts as the per-project "fixture" for runtime expectations

## Coverage

**Requirements:** Not enforced — no coverage threshold configuration detected in `vitest.config.ts`

**View Coverage:**
```bash
# Not configured; run manually if needed:
vitest run --coverage
```

## Test Types

**Parity Tests (primary):**
- Verify that each published package entrypoint resolves to the expected surface in every supported runtime
- Scope: `tests/parity/` — all tests are parity tests
- Pattern: dynamic `import()` of package alias → assertion helper

**Unit Tests:**
- Not present — no unit-level tests for internal `src/` functions

**Integration Tests:**
- The parity tests function as integration tests: they import from built `dist/` artifacts (not `src/`) and check end-to-end export resolution

**E2E Tests:**
- Not applicable

## CI Integration

Tests run in three separate CI jobs in `.github/workflows/package-foundation.yml`:

| Job | Command | Notes |
|-----|---------|-------|
| `quality` | `npm run typecheck && npm run lint && npm run build` | No tests — type and lint gate only |
| `node` | `npm run test:node` | Node.js parity suite |
| `browsers` (matrix: chromium/firefox/webkit) | `npm run test:<browser>` | Browser parity suite per engine; `fail-fast: false` |

Release workflow (`.github/workflows/release-package.yml`) runs `npm run verify` which includes the full cross-runtime suite before publishing.

## Common Patterns

**Async module import testing:**
```typescript
run: async () => {
  const module = await import("@sethlivingston/oneway-http");
  expectPlaceholderSurface(module, parityRuntimeContext.expectedRootTarget);
},
```

**Conditionally skipped case:**
```typescript
{
  enabled: parityRuntimeContext.supportsExplicitNodeEntrypoint,
  name: "loads the explicit node entrypoint when the runtime supports it",
  run: async () => {
    const module = await import("@sethlivingston/oneway-http/node");
    expectPlaceholderSurface(module, "node");
  },
},
```

**Adding a new parity case:**
1. Add a `ParityCase` object to the array returned by `createEntrypointParityCases` in `tests/parity/entrypoint-cases.ts`
2. Use `parityRuntimeContext` to gate runtime-specific behavior with `enabled`
3. Extract repeated assertion logic into a new `expect*` helper in `tests/parity/placeholder-assertions.ts`
4. No changes needed to `suite.ts` or `entrypoints.test.ts`

---

*Testing analysis: 2026-05-04*
