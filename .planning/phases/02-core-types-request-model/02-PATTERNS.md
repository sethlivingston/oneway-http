# Phase 2: Core Types + Request Model — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 6 (3 source + 3 test)
**Analogs found:** 5 / 6

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/types.ts` | type-definition | — (zero logic) | `src/shared.ts` | role-match (shared.ts is the only existing pure-type file) |
| `src/request.ts` | utility / class | transform | `src/shared.ts` (`createPlaceholderSurface` factory pattern) | partial-match |
| `src/client.ts` | utility / factory | transform | `src/index.ts` + `src/shared.ts` | partial-match |
| `tests/unit/types.test.ts` | test | — | `tests/parity/entrypoint-cases.ts` + `tests/parity/entrypoints.test.ts` | role-match |
| `tests/unit/request.test.ts` | test | — | `tests/parity/entrypoint-cases.ts` + `tests/parity/entrypoints.test.ts` | role-match |
| `tests/unit/client.test.ts` | test | — | `tests/parity/entrypoint-cases.ts` + `tests/parity/entrypoints.test.ts` | role-match |

> No analog has no-analog status — the codebase is small but each file has at least a partial match.

---

## Pattern Assignments

### `src/types.ts` (type-definition, zero logic)

**Analog:** `src/shared.ts`

**What to copy:**
- `readonly` on all interface/type members
- `export type` (not `export interface`) for discriminated unions and mapped types — consistent with RESEARCH.md patterns; `verbatimModuleSyntax` requires `import type` at use sites, which `export type` aliases naturally
- `PascalCase` for all type names (convention from `copilot-instructions.md`)
- Named exports only — no default export (convention from existing `src/` files)

**Structural imports pattern** (`src/shared.ts` lines 1–0 — zero imports):
```typescript
// src/shared.ts has ZERO imports — types.ts must follow the same rule (D-11).
// All referenced globals (Headers, URL, URLSearchParams) are ambient browser/Node globals.
// Do NOT add any import statement.
```

**Type declaration pattern** (`src/shared.ts` lines 1–23):
```typescript
// Every member is readonly:
export type RuntimeTarget = "browser" | "node";

export interface PlaceholderDescription {
  readonly implementation: "placeholder";
  readonly runtime: RuntimeTarget;
}

export interface OnewayHttpSurface {
  readonly runtimeTarget: RuntimeTarget;
  describe: () => PlaceholderDescription;
}
```

**Phantom field pattern** (RESEARCH.md §Pattern 1 — no codebase analog exists yet):
```typescript
// declare keyword prevents runtime property slot; mandatory under exactOptionalPropertyTypes (D-12)
export type TaggedEntry<T = unknown, Tag extends string = string> = {
  readonly tag: Tag;
  declare readonly _phantom: T;  // type-only; zero runtime presence
  readonly _decode: unknown;     // runtime decoder; Phase 4 casts this
};
```

**Discriminated union pattern** (RESEARCH.md §Complete types.ts Shape):
```typescript
// Use `kind` as the discriminant — consistent with SendResult, TransportError, DecodeError
export type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };

export type SendResult<R> =
  | { kind: "response"; response: R }
  | { kind: "transportError"; error: TransportError }
  | { kind: "decodeError"; status: number; headers: Headers; error: DecodeError; preview: BodyPreview }
  | { kind: "unhandledStatus"; status: number; headers: Headers; preview: BodyPreview };
```

**Mapped-type inference helper** (RESEARCH.md §Pattern 2):
```typescript
// InferResponseUnion<M> maps a ResponseMap to the tagged-union R used on Request<R>
export type InferResponseUnion<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag; body: T }
    : never;
}[keyof M];
// noUncheckedIndexedAccess: undefined extends TaggedEntry<...> is `never` — filters itself out.
```

**Optional field discipline** (RESEARCH.md §Pitfall 1, tsconfig.json):
```typescript
// exactOptionalPropertyTypes: never write `field?: T | undefined`.
// Truly-optional fields use `field?: T` (TypeScript will NOT add | undefined implicitly).
// Example from RESEARCH.md:
export type DecodeIssue = {
  path: Array<string | number>;
  message: string;
  code?: string;  // truly optional — no | undefined suffix
};
```

---

### `src/request.ts` (utility / class, transform)

**Analog:** `src/shared.ts` (factory function + pure return value) + RESEARCH.md §Pattern 4

**Import pattern** (modeled on `src/index.ts` lines 1–5):
```typescript
// verbatimModuleSyntax: use `import type` for every type-only import (Pitfall 6)
// .js extension required on all local imports (Pitfall 5, D-05)
import type { RequestSpec, ResponseMap, InferResponseUnion } from "./types.js";
```

**Class with private field + static factory** (RESEARCH.md §Pattern 4, CONTEXT.md D-07/D-08):
```typescript
// JS private field — NOT Symbol, NOT WeakMap (D-08)
export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;

  // private constructor: only Request.create() may instantiate
  private constructor(spec: RequestSpec) {
    this.#spec = spec;
  }

  // Static factory infers R from the literal responses object
  static create<M extends ResponseMap>(
    input: RequestSpec<M>,
  ): Request<InferResponseUnion<M>> {
    return new Request(input as RequestSpec);
  }

  // consume() is the only method; called exclusively by send() in Phase 3
  consume(): RequestSpec {
    if (this.#consumed) {
      throw new TypeError(
        "Request has already been consumed and cannot be sent again",
      );
    }
    this.#consumed = true;
    return this.#spec;
  }
}
```

**Path encoding helper** (RESEARCH.md §Pattern 5):
```typescript
// Internal — not exported; called from Request.create() or a path-building step
function buildPath(segments: readonly (string | number)[]): string {
  return segments.map((s) => encodeURIComponent(String(s))).join("/");
}
```

**Query construction helper** (RESEARCH.md §Pattern 6):
```typescript
// Internal — not exported; returns URLSearchParams (not string)
function buildQuery(
  query: Record<string, QueryValue | readonly QueryValue[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}
```

**Named export only** (consistent with all `src/` files — no default export):
```typescript
export class Request<R> { ... }
// No: export default class Request<R> { ... }
```

---

### `src/client.ts` (utility / factory, transform)

**Analog:** `src/shared.ts` lines 13–23 (`createPlaceholderSurface` factory that returns a typed value) + RESEARCH.md §Pattern 3

**Import pattern** (modeled on `src/browser.ts` lines 1–4):
```typescript
import type { ClientSpec, QueryValue } from "./types.js";
// import type for every type-only symbol; .js extension always required
```

**Factory function pattern** (`src/shared.ts` lines 13–23):
```typescript
// src/shared.ts pattern: named function that takes a spec and returns a typed value
export function createPlaceholderSurface(
  runtimeTarget: RuntimeTarget,
): OnewayHttpSurface {
  return { runtimeTarget, describe: () => ({ ... }) };
}

// client.ts mirrors this: accept spec, return shallow copy
export function createClient(spec: ClientSpec): ClientSpec {
  return { ...spec };  // shallow copy; merge semantics apply at send() time (Phase 3)
}
```

**Undefined-filtering merge pattern** (CONTEXT.md D-09/D-10, RESEARCH.md §Pattern 3):
```typescript
// NEVER use { ...base, ...override } — it propagates `undefined` as an explicit key (D-09)
// Header keys MUST be lowercased (D-10)
export function mergeHeaders(
  base: Record<string, string | undefined> | undefined,
  override: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value;
  }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value;
  }
  return result;
}

// Same loop pattern for query — no toLowerCase (keys are case-sensitive in query strings)
export function mergeQuery(
  base: Record<string, QueryValue | readonly QueryValue[] | undefined> | undefined,
  override: Record<string, QueryValue | readonly QueryValue[] | undefined> | undefined,
): Record<string, QueryValue | readonly QueryValue[]> {
  const result: Record<string, QueryValue | readonly QueryValue[]> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (value !== undefined) result[key] = value;
  }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
```

**Named exports only** (consistent with all `src/` files):
```typescript
export function createClient(...) { ... }
export function mergeHeaders(...) { ... }
export function mergeQuery(...) { ... }
// No default export
```

---

### `tests/unit/types.test.ts` (test, Wave 0 stubs for TYPES-01..TYPES-08)

**Analog:** `tests/parity/entrypoints.test.ts` (test runner shell) + `tests/parity/entrypoint-cases.ts` (case definitions) + `tests/parity/placeholder-assertions.ts` (import + assertion patterns)

**Import pattern** (`tests/parity/placeholder-assertions.ts` lines 1–6):
```typescript
import { describe, it, expect } from "vitest";
// Type-only imports use `import type`:
import type { SendResult, TransportError, DecodeError } from "../../src/types.js";
```

**Test file structure** (`tests/parity/suite.ts` lines 1–17):
```typescript
// Named describe block per requirement group; it() per requirement ID
import { describe, it, expect } from "vitest";

describe("TYPES-01: types.ts has zero imports", () => {
  it("placeholder — implement in Wave 1", () => {
    // Wave 0 stub: test passes unconditionally until implementation
    expect(true).toBe(true);
  });
});
```

**Structural type-test pattern** (Vitest convention — no direct analog in codebase yet):
```typescript
// Type-level assertions use compile-time narrowing, not runtime values.
// Use type assignability checks to verify discriminated unions:
it("SendResult<R> has four variants with `kind` discriminant", () => {
  type _TestOk = SendResult<string> & { kind: "response" };
  type _TestTransport = SendResult<string> & { kind: "transportError" };
  type _TestDecode = SendResult<string> & { kind: "decodeError" };
  type _TestUnhandled = SendResult<string> & { kind: "unhandledStatus" };
  // If any of these produce `never`, tsc catches it before vitest runs.
  expect(true).toBe(true); // runtime presence; type safety is the real assertion
});
```

**⚠ vitest.config.ts update required:**
The current `vitest.config.ts` only includes `tests/parity/**/*.test.ts`. The `node` project's `include` must be extended to `["tests/parity/**/*.test.ts", "tests/unit/**/*.test.ts"]` so unit tests are picked up by `npx vitest run --project node`. Browser projects should NOT include unit tests (they test pure TS types/logic, not browser export surfaces).

---

### `tests/unit/request.test.ts` (test, Wave 0 stubs for REQ-01..REQ-04)

**Analog:** Same as `types.test.ts` — `tests/parity/` suite structure

**Import pattern**:
```typescript
import { describe, it, expect } from "vitest";
import { Request } from "../../src/request.js";
import type { RequestSpec } from "../../src/types.js";
```

**Affine enforcement test pattern** (CONTEXT.md D-07):
```typescript
describe("REQ-04: affine enforcement", () => {
  it("second consume() throws TypeError", () => {
    const req = Request.create({ method: "GET", responses: {} });
    req.consume();
    expect(() => req.consume()).toThrow(TypeError);
    expect(() => req.consume()).toThrow(
      "Request has already been consumed and cannot be sent again",
    );
  });
});
```

**Path encoding test pattern** (RESEARCH.md §Pattern 5):
```typescript
describe("REQ-02: path segment encoding", () => {
  it("encodes each segment independently and joins with /", () => {
    // placeholder — implement in Wave 1
    expect(true).toBe(true);
  });
});
```

---

### `tests/unit/client.test.ts` (test, Wave 0 stubs for merge rules)

**Analog:** Same as above

**Import pattern**:
```typescript
import { describe, it, expect } from "vitest";
import { mergeHeaders, mergeQuery } from "../../src/client.js";
```

**Merge rule test pattern** (CONTEXT.md D-09/D-10):
```typescript
describe("mergeHeaders()", () => {
  it("override wins on conflict", () => {
    // placeholder — implement in Wave 1
    expect(true).toBe(true);
  });

  it("undefined override value does NOT erase base value", () => {
    // placeholder — implement in Wave 1
    expect(true).toBe(true);
  });

  it("normalizes keys to lowercase", () => {
    // placeholder — implement in Wave 1
    expect(true).toBe(true);
  });
});
```

---

## Shared Patterns

### ESM Import Conventions
**Source:** All existing `src/*.ts` files
**Apply to:** `src/request.ts`, `src/client.ts`, all `tests/unit/*.test.ts`
```typescript
// 1. .js extension on every local import (verbatimModuleSyntax + ESM)
import { Request } from "./request.js";

// 2. `import type` for every type-only symbol (verbatimModuleSyntax)
import type { RequestSpec, ResponseMap } from "./types.js";

// 3. Separate value and type imports when mixing both:
import { createClient } from "./client.js";
import type { ClientSpec } from "./types.js";
```

### `readonly` on All Type Members
**Source:** `src/shared.ts` lines 3–11
**Apply to:** `src/types.ts` (all type/interface definitions)
```typescript
export interface PlaceholderDescription {
  readonly implementation: "placeholder";
  readonly runtime: RuntimeTarget;
}
// Every field in every exported type/interface must be readonly unless mutation is intentional.
```

### Named-Export-Only Convention
**Source:** `src/shared.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts` — none use default exports
**Apply to:** All three new `src/` files
```typescript
// Always: export function / export class / export type
// Never:  export default
```

### `exactOptionalPropertyTypes` Discipline
**Source:** `tsconfig.json` line 13 (`"exactOptionalPropertyTypes": true`)
**Apply to:** `src/types.ts` (type definitions), `src/request.ts`, `src/client.ts`
```typescript
// WRONG — adds | undefined implicitly, violates exactOptionalPropertyTypes
type Bad = { field?: string | undefined };

// CORRECT — truly optional, undefined NOT in the value domain
type Good = { field?: string };

// CORRECT — phantom field must use declare, not a value field
type Good2 = { declare readonly _phantom: T };
```

### `noUncheckedIndexedAccess` Guards
**Source:** `tsconfig.json` line 12 (`"noUncheckedIndexedAccess": true`)
**Apply to:** `src/request.ts`, `src/client.ts` (anywhere `Record` values are read by key)
```typescript
// Every index read returns T | undefined; always guard before use:
const entry = responseMap[key];  // type: TaggedEntry | undefined
if (entry !== undefined) { /* safe */ }
```

---

## Infrastructure Note: `vitest.config.ts` Modification Required

The current `vitest.config.ts` restricts all projects to `include: parityInclude` (`tests/parity/**/*.test.ts`). The unit tests in `tests/unit/` will not be discovered or run without a config change.

**Minimal change needed** — extend the `node` project's `include` only:
```typescript
// Current (vitest.config.ts lines 4, 38-45):
const parityInclude: string[] = ["tests/parity/**/*.test.ts"];
// node project: include: parityInclude

// Change to:
const unitInclude: string[] = ["tests/unit/**/*.test.ts"];
// node project: include: [...parityInclude, ...unitInclude]
// browser projects: unchanged (keep parityInclude only)
```

This is a supporting change for the test files in this phase. It belongs in the same phase plan.

---

## No Analog Found

All six files have at least a partial analog. No entries in this section.

---

## Metadata

**Analog search scope:** `src/`, `tests/parity/`, `tsconfig.json`, `vitest.config.ts`, `package.json`
**Files read:** 12
**Pattern extraction date:** 2026-05-05
