# Phase 1: Infrastructure Fixes - Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 4 (tsconfig.json, vitest.config.ts, src/index.ts, package.json)
**Analogs found:** 4 / 4 — all files are being *modified*, so each file is its own analog

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tsconfig.json` | config | transform | `tsconfig.json` (self) | exact — edit-in-place |
| `vitest.config.ts` | config | request-response | `vitest.config.ts` (self) + `tsup.config.ts` (alias inspiration) | exact — edit-in-place |
| `src/index.ts` | utility/entrypoint | transform | `src/browser.ts`, `src/node.ts` (sibling entrypoints) | exact — same shape, different target |
| `package.json` | config | N/A | `package.json` (self) | exact — edit-in-place |

---

## Pattern Assignments

### `tsconfig.json` (config, transform)

**Analog:** `tsconfig.json` itself (edit-in-place)

**Current state** (full file, lines 1-30):
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "paths": {
      "@sethlivingston/oneway-http": ["./src/index.ts"],
      "@sethlivingston/oneway-http/browser": ["./src/browser.ts"],
      "@sethlivingston/oneway-http/node": ["./src/node.ts"]
    },
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "ignoreDeprecations": "6.0",
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "tests/**/*.ts",
    "tsup.config.ts",
    "vitest.config.ts"
  ]
}
```

**Target state** (per D-01 through D-05 — apply these four diffs, nothing else changes):

| Key | Remove | Replace with |
|---|---|---|
| `"baseUrl": "."` | delete line | *(gone)* |
| `"module": "NodeNext"` | delete | `"module": "Preserve"` |
| `"moduleResolution": "NodeNext"` | delete | `"moduleResolution": "Bundler"` |
| `"ignoreDeprecations": "6.0"` | delete line | *(gone)* |

**Keep as-is:** `paths` block (D-04), all other compiler options, entire `include` array.

**Result shape:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "paths": {
      "@sethlivingston/oneway-http": ["./src/index.ts"],
      "@sethlivingston/oneway-http/browser": ["./src/browser.ts"],
      "@sethlivingston/oneway-http/node": ["./src/node.ts"]
    },
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "tests/**/*.ts",
    "tsup.config.ts",
    "vitest.config.ts"
  ]
}
```

---

### `vitest.config.ts` (config, request-response)

**Analog:** `vitest.config.ts` itself (edit-in-place) + `tsconfig.json` paths block (same three package aliases)

**Current state** (full file, lines 1-46):
```typescript
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, type TestProjectConfiguration } from "vitest/config";

const parityInclude: string[] = ["tests/parity/**/*.test.ts"];

function createBrowserProject(
  browser: "chromium" | "firefox" | "webkit",
): TestProjectConfiguration {
  return {
    define: {
      __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: JSON.stringify("browser"),
      __ONEWAY_HTTP_TEST_PROJECT__: JSON.stringify(browser),
    },
    test: {
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser }],
        provider: playwright(),
      },
      include: parityInclude,
      name: browser,
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        define: { ... },
        test: { environment: "node", include: parityInclude, name: "node" },
      },
      createBrowserProject("chromium"),
      createBrowserProject("firefox"),
      createBrowserProject("webkit"),
    ],
  },
});
```

**Target state** — add top-level `resolve.alias` block (D-06, D-07). The three alias keys mirror the `paths` entries in `tsconfig.json` exactly. The alias values are paths relative to the config file root:

```typescript
export default defineConfig({
  resolve: {
    alias: {
      "@sethlivingston/oneway-http/browser": new URL("./src/browser.ts", import.meta.url).pathname,
      "@sethlivingston/oneway-http/node": new URL("./src/node.ts", import.meta.url).pathname,
      "@sethlivingston/oneway-http": new URL("./src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    projects: [ /* unchanged */ ],
  },
});
```

> **Ordering note:** The more-specific subpath aliases (`/browser`, `/node`) **must appear before** the bare package alias (`@sethlivingston/oneway-http`) in the `alias` object so Vite's resolver matches subpaths before the root catch-all.

**Alternative alias value form** (string form, also acceptable):
```typescript
resolve: {
  alias: {
    "@sethlivingston/oneway-http/browser": "./src/browser.ts",
    "@sethlivingston/oneway-http/node": "./src/node.ts",
    "@sethlivingston/oneway-http": "./src/index.ts",
  },
},
```
Prefer the `new URL(…, import.meta.url).pathname` form for absolute path safety; either form works in Vite 8 / Vitest 4.

**Nothing else in the file changes** — the `projects` array, `createBrowserProject` helper, and `parityInclude` constant are untouched.

---

### `src/index.ts` (utility/entrypoint, transform)

**Analog:** `src/browser.ts` and `src/node.ts` (sibling entrypoints — identical shape, hardcoded targets)

**Current state** (full file, lines 1-10):
```typescript
import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
  type RuntimeTarget,
} from "./shared.js";

const rootSurface = createPlaceholderSurface("browser");

export const runtimeTarget: RuntimeTarget = rootSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = rootSurface.describe;
```

**Sibling analog — `src/browser.ts`** (lines 1-9):
```typescript
import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
} from "./shared.js";

const browserSurface = createPlaceholderSurface("browser");

export const runtimeTarget = browserSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = browserSurface.describe;
```

**Sibling analog — `src/node.ts`** (lines 1-9):
```typescript
import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
} from "./shared.js";

const nodeSurface = createPlaceholderSurface("node");

export const runtimeTarget = nodeSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = nodeSurface.describe;
```

**Target state** — replace line 7 only (D-10, D-11). Import block and exports are unchanged:

```typescript
import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
  type RuntimeTarget,
} from "./shared.js";

const rootSurface = createPlaceholderSurface(
  typeof globalThis.document !== "undefined" ? "browser" : "node",
);

export const runtimeTarget: RuntimeTarget = rootSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = rootSurface.describe;
```

**Key decisions preserved in this pattern:**
- `globalThis.document` check (not `window`) — `document` is browser-only; Deno, Bun, Cloudflare Workers, and Node all lack it (D-11).
- `RuntimeTarget` explicit type annotation stays on `runtimeTarget` export — consistent with current file; omitted in sibling files but present here (keep it).
- Import of `type RuntimeTarget` stays — still needed for the explicit annotation on line 10.
- Local variable name stays `rootSurface` — consistent with existing naming convention (`rootSurface` / `browserSurface` / `nodeSurface`).

---

### `package.json` (config, N/A)

**Analog:** `package.json` itself (edit-in-place, scripts section only)

**Current scripts section** (lines 59-78):
```json
"scripts": {
  "clean": "node --eval \"import('node:fs').then((fs) => fs.rmSync('dist', { recursive: true, force: true }))\"",
  "build": "npm run clean && tsup --config tsup.config.ts",
  "lint": "eslint src tests tsup.config.ts vitest.config.ts",
  "pretest": "npm run build",
  "test": "vitest run",
  "pretest:node": "npm run build",
  "test:node": "vitest run --project node",
  "pretest:chromium": "npm run build",
  "test:chromium": "vitest run --project chromium",
  "pretest:firefox": "npm run build",
  "test:firefox": "vitest run --project firefox",
  "pretest:webkit": "npm run build",
  "test:webkit": "vitest run --project webkit",
  "pretest:browser": "npm run build",
  "test:browser": "vitest run --project chromium --project firefox --project webkit",
  "test:browser:install": "playwright install chromium firefox webkit",
  "typecheck": "tsc --noEmit",
  "verify": "npm run typecheck && npm run lint && npm run test"
}
```

**Target state** (D-08, D-09):

```json
"scripts": {
  "clean": "node --eval \"import('node:fs').then((fs) => fs.rmSync('dist', { recursive: true, force: true }))\"",
  "build": "npm run clean && tsup --config tsup.config.ts",
  "lint": "eslint src tests tsup.config.ts vitest.config.ts",
  "test": "vitest run",
  "test:node": "vitest run --project node",
  "test:chromium": "vitest run --project chromium",
  "test:firefox": "vitest run --project firefox",
  "test:webkit": "vitest run --project webkit",
  "test:browser": "vitest run --project chromium --project firefox --project webkit",
  "test:browser:install": "playwright install chromium firefox webkit",
  "typecheck": "tsc --noEmit",
  "verify": "npm run typecheck && npm run lint && npm run build && npm run test"
}
```

**Changes:**
- Delete all six `pretest` and `pretest:*` scripts (`pretest`, `pretest:node`, `pretest:chromium`, `pretest:firefox`, `pretest:webkit`, `pretest:browser`).
- Update `verify` to insert `npm run build &&` between `npm run lint &&` and `npm run test`.
- All other scripts (`clean`, `build`, `lint`, `test`, `test:*`, `typecheck`) are unchanged.

---

## Shared Patterns

### `.js` Extension on Relative Imports
**Source:** `src/browser.ts` line 4, `src/node.ts` line 4, `src/index.ts` line 5
**Apply to:** All `src/*.ts` files — do NOT change import extensions when modifying `src/index.ts`
```typescript
// Correct — keep .js extension on relative imports (enforced by eslint-plugin-import-x)
import { createPlaceholderSurface } from "./shared.js";
// Wrong — bare .ts extension or no extension is a lint error
import { createPlaceholderSurface } from "./shared.ts";
```
**Note (D-05):** With `moduleResolution: Bundler` TypeScript no longer enforces `.js` extensions — ESLint's `import-x` rule is the sole backstop. Never remove extensions from relative imports.

### `globalThis` Global Access Pattern
**Source:** `src/index.ts` after D-10 change
**Apply to:** Any future code needing cross-runtime global access
```typescript
// Use globalThis.<property> — works in all target runtimes (Node, browser, Deno, Bun, Workers)
typeof globalThis.document !== "undefined"
// Avoid bare `document` or `window` — not defined in all runtimes
```

### Vitest Compile-time Defines
**Source:** `vitest.config.ts` lines 10-13 and 31-33
**Apply to:** Any new test project added to `vitest.config.ts`
```typescript
define: {
  __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: JSON.stringify("browser"),
  __ONEWAY_HTTP_TEST_PROJECT__: JSON.stringify(browser),
},
```
Corresponding declaration in `tests/parity/runtime-context.ts` lines 5-6:
```typescript
declare const __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: RuntimeTarget;
declare const __ONEWAY_HTTP_TEST_PROJECT__: ParityProjectName;
```

---

## No Analog Found

All modified files serve as their own analogs — no net-new files are created in this phase.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| *(none)* | — | — | — |

---

## Metadata

**Analog search scope:** `src/`, `tests/`, repo root config files
**Files read:** `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, `src/shared.ts`, `package.json`, `tsup.config.ts`, `tests/parity/runtime-context.ts`, `tests/parity/entrypoints.test.ts`, `copilot-instructions.md`
**Pattern extraction date:** 2026-05-04
