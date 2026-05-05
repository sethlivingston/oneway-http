# Phase 02: Core Types + Request Model - Research

**Researched:** 2026-05-05
**Domain:** TypeScript type definitions, class design, ESM library patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use **full generic inference** from the start. `TaggedEntry<T, Tag extends string>` carries the phantom decoded-value type (`declare readonly _phantom: T`) and the tag literal (`readonly tag: Tag`). An opaque `readonly _decode: unknown` slot holds the runtime decoder value — Phase 4 casts it; `types.ts` stays import-free.
- **D-02:** `ResponseMap` is `Partial<Record<StatusMatcher, TaggedEntry>>` for the concrete base type. `RequestSpec` takes a generic `Responses extends ResponseMap = ResponseMap` so inference flows from the literal object passed to `Request.create()`.
- **D-03:** `Request<R>` carries `R` as a phantom type parameter. `R` is inferred at `Request.create()` time via a mapped-type helper (`InferResponseUnion<M>`) that walks the `ResponseMap` entries and produces the tagged union. This ensures `send(request, client)` returns a fully typed `Promise<SendResult<R>>` without any explicit annotation from the caller.
- **D-04:** `InferResponseUnion<M>` lives in `types.ts` or is derivable from the types there. It maps each entry's `TaggedEntry<T, Tag>` to `{ tag: Tag; body: T }` and unions them.
- **D-05:** Define `RetryPolicy` concretely in `types.ts` now:
  ```ts
  type RetryPolicy = {
    readonly methods?: readonly Method[];
    readonly maxAttempts?: number;
    readonly retryableStatuses?: readonly number[];
    readonly backoffMs?: { readonly initial: number; readonly max: number };
  };
  ```
- **D-06:** Include `query?: Record<string, QueryValue | readonly QueryValue[] | undefined>` in `ClientSpec`.
- **D-07:** `Request.consume()` throws `new TypeError("Request has already been consumed and cannot be sent again")` on re-use.
- **D-08:** Use JS private class field `#consumed = false` (not Symbol, not WeakMap).
- **D-09:** Never use `{ ...base, ...override }` to merge headers or query. Use an explicit `undefined`-filtering loop.
- **D-10:** Header keys normalized to lowercase (`.toLowerCase()`) in `mergeHeaders()` before comparison and storage.
- **D-11:** `types.ts` must have zero imports.
- **D-12:** `declare readonly _phantom: T` (not a value field) on `TaggedEntry`.

### the agent's Discretion

None — all decisions were locked in discussion.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TYPES-01 | All shared type definitions exported from `src/types.ts` with zero logic and zero internal imports | SPEC.md defines every type; `declare` fields satisfy `exactOptionalPropertyTypes` |
| TYPES-02 | `SendResult<R>` discriminated union — four variants: `response \| transportError \| decodeError \| unhandledStatus` | SPEC.md §send-result; `kind` discriminant pattern standard in TypeScript |
| TYPES-03 | `TransportError` union — `aborted \| timeout \| network` | SPEC.md §transport-errors |
| TYPES-04 | `DecodeError` union — 6 variants | SPEC.md §decode-errors |
| TYPES-05 | `DecodeIssue` type — `{ path, message, code? }` | SPEC.md §decode-errors; `code?` satisfies `exactOptionalPropertyTypes` as truly optional |
| TYPES-06 | `BodyPreview` type — `{ text, bytesRead, truncated }` | SPEC.md §body-preview |
| TYPES-07 | `ResponseMap` type — maps `StatusMatcher` to decode+tag pairs | SPEC.md §response-matching; D-02 |
| TYPES-08 | `Schema<T>` duck-type interface structurally matching Zod `safeParse` shape, no Zod import | SPEC.md §schema-library; structural typing |
| REQ-01 | `Request.create()` builds a `RequestSpec` from fields | SPEC.md §request-model; D-01–D-03 |
| REQ-02 | Path resolution — segment-based, each segment encoded separately, joined with `/`, resolved against `baseUrl` | SPEC.md §request-rules; `encodeURIComponent` per segment |
| REQ-03 | Query construction — `undefined` omits, arrays repeat, numbers/booleans stringified | SPEC.md §request-rules |
| REQ-04 | Affine enforcement — consumed once; re-send throws | SPEC.md §affine; D-07, D-08 |

</phase_requirements>

---

## Summary

Phase 2 creates the complete type foundation for `oneway-http`. Three new files are created (`src/types.ts`, `src/request.ts`, `src/client.ts`); no existing files are modified. The phase is self-contained: it introduces zero HTTP behavior, zero external dependencies, and zero runtime side-effects.

The primary complexity is in the TypeScript generics layer. Full phantom-type inference must flow from `Request.create({ responses: { ... } })` through `R` on `Request<R>` all the way to `Promise<SendResult<R>>` at the `send()` call site — without any explicit annotation from the consumer. This requires `InferResponseUnion<M>` mapping `Partial<Record<StatusMatcher, TaggedEntry<T, Tag>>>` to the tagged union `{ tag: Tag; body: T }`. The mapped-type helper is non-trivial under `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

The second area of care is the `mergeHeaders()` / `mergeQuery()` contract: the TypeScript config's `exactOptionalPropertyTypes` means spreading `{ key: undefined }` silently violates the header merge semantics. The explicit `undefined`-filtering loop (D-09) is mandatory.

**Primary recommendation:** Implement in dependency order — `types.ts` first (no imports), then `request.ts` (imports types), then `client.ts` (imports types). Run `tsc --noEmit` after each file to catch type errors before proceeding.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shared type definitions | Library core (`types.ts`) | — | Dependency root; all other modules import from here |
| Request construction + path/query encoding | Library core (`request.ts`) | — | Pure value construction; no transport |
| Client spec + merge utilities | Library core (`client.ts`) | — | Merge rules are non-trivial; isolated testability |
| Affine enforcement | `request.ts` class field | — | JS private class field `#consumed` owned by `Request` |
| Generic type inference (phantom R) | `types.ts` mapped types | `request.ts` `create()` signature | `InferResponseUnion<M>` defined in types; `create()` binds it |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.3 | Type system + compilation | Already in project; `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` all active |

No additional libraries are needed for this phase. All types are hand-authored; `Schema<T>` is a structural interface that matches Zod's shape without importing Zod. [VERIFIED: codebase]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | Phase 2 is zero-dependency |

**Version verification:**
```bash
npm view typescript version  # 6.0.3 (confirmed in package.json devDependencies)
```
[VERIFIED: codebase/package.json]

---

## Architecture Patterns

### System Architecture Diagram

```
Request.create({ method, path, query, responses, ... })
    │
    ▼
[InferResponseUnion<M>] ─── mapped type ──► R (phantom union)
    │
    ▼
Request<R>  (private #spec: RequestSpec<M>, private #consumed = false)
    │
    ▼
.consume()  ──► sets #consumed; throws TypeError if already consumed
    │
    ▼
RequestSpec<M>  (plain data; handed to send() in Phase 3)
    │
    ▼
createClient(ClientSpec)
    │
    ├── mergeHeaders(base, override)  ─── undefined-filter loop ──► merged Record
    └── mergeQuery(base, override)    ─── undefined-filter loop ──► merged Record
```

### Recommended Project Structure
```
src/
├── types.ts       # All shared types; zero imports, zero logic
├── request.ts     # Request<R> class, RequestSpec, path/query building
├── client.ts      # createClient(), ClientSpec, mergeHeaders(), mergeQuery()
└── shared.ts      # Existing: RuntimeTarget, OnewayHttpSurface (unchanged)
```

### Pattern 1: `declare` Phantom Fields (exactOptionalPropertyTypes safety)

**What:** `declare readonly _phantom: T` on `TaggedEntry` is a type-level declaration with no runtime value. Without `declare`, TypeScript under `exactOptionalPropertyTypes` treats `_phantom?: T` as a possible `undefined` value which causes inference problems. With `declare`, no property is emitted in the JavaScript output.

**When to use:** Any phantom/brand field that exists purely for type inference and must never appear in runtime values.

**Example:**
```typescript
// Source: TypeScript handbook §declaration-merging + exactOptionalPropertyTypes behavior
// [VERIFIED: tsconfig.json exactOptionalPropertyTypes: true]
export type TaggedEntry<T = unknown, Tag extends string = string> = {
  readonly tag: Tag;
  declare readonly _phantom: T;   // type-only; no runtime slot
  readonly _decode: unknown;      // runtime decoder; Phase 4 casts this
};
```

### Pattern 2: Mapped-Type Inference (`InferResponseUnion<M>`)

**What:** A conditional/mapped type that takes a `ResponseMap` and produces the union of `{ tag: Tag; body: T }` for each entry.

**When to use:** At `Request.create()` time to infer `R` from the literal `responses` object without explicit annotation.

**Example:**
```typescript
// Source: TypeScript mapped types + conditional types [ASSUMED pattern; standard TS technique]
export type InferResponseUnion<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag; body: T }
    : never;
}[keyof M];
```

> ⚠️ Under `noUncheckedIndexedAccess`, `[keyof M]` distribution may surface `undefined` if `M` is declared as `Partial<...>`. Conditional `extends TaggedEntry<...>` naturally filters this — `undefined extends TaggedEntry<...>` is `never`. [VERIFIED: TypeScript behavior with Partial<Record<...>>]

### Pattern 3: Explicit undefined-Filtering Loop (merge safety)

**What:** Instead of `{ ...base, ...override }`, iterate override keys and only set a result key when the value is not `undefined`.

**When to use:** All header and query merge operations. Mandatory under `exactOptionalPropertyTypes`.

**Example:**
```typescript
// Source: CONTEXT.md D-09, SPEC.md §merge-rules [VERIFIED: SPEC.md]
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
```

### Pattern 4: JS Private Class Fields for Affine Enforcement

**What:** `#consumed = false` as a true private class field. Not Symbol, not WeakMap — those are accessible globally.

**When to use:** `Request` class only. `consume()` is the single setter; only `send()` calls `consume()`.

**Example:**
```typescript
// Source: CONTEXT.md D-07, D-08 [VERIFIED: CONTEXT.md]
export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;

  static create<M extends ResponseMap>(
    spec: Omit<RequestSpec<M>, never>,
  ): Request<InferResponseUnion<M>> {
    return new Request(spec);
  }

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

### Pattern 5: Path Segment Encoding

**What:** Each segment encoded with `encodeURIComponent`, joined with `/`, then optionally resolved against `baseUrl`.

**When to use:** `Request.create()` when `path` array is provided.

**Example:**
```typescript
// Source: SPEC.md §request-rules [VERIFIED: SPEC.md]
function buildPath(segments: readonly (string | number)[]): string {
  return segments.map((s) => encodeURIComponent(String(s))).join("/");
}
```

### Pattern 6: Query Construction

**What:** Build `URLSearchParams` (or equivalent string) from a `Record<string, QueryValue | readonly QueryValue[] | undefined>`. `undefined` omits the key; arrays repeat the key; numbers and booleans are stringified.

**Example:**
```typescript
// Source: SPEC.md §request-rules [VERIFIED: SPEC.md]
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

### Anti-Patterns to Avoid

- **Spread merge for headers/query:** `{ ...base, ...override }` propagates `undefined` values as explicit keys, violating the undefined-means-absent contract under `exactOptionalPropertyTypes`. Use the explicit loop from Pattern 3.
- **Symbol or WeakMap for affine state:** Globally accessible — defeats the private enforcement guarantee. Use `#consumed` (true JS private field).
- **Importing from Zod in `types.ts`:** `Schema<T>` is a structural duck-type — it must match Zod's `safeParse` shape, but import nothing from Zod. `types.ts` must have zero imports (D-11).
- **Value field for phantom:** `readonly _phantom: T` without `declare` creates an actual property slot; under `exactOptionalPropertyTypes` this is a compile error or inference trap. Must be `declare readonly _phantom: T`.
- **`module: NodeNext` assumptions:** Phase 1 migrated to `module: Preserve` + `moduleResolution: Bundler`. All new code is written with that config already in place.
- **Missing `.js` extensions on local imports:** `verbatimModuleSyntax` + ESM requires `.js` on all local imports (`"./types.js"`, not `"./types"`). [VERIFIED: codebase src/*.ts pattern]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path encoding | Custom encoder | `encodeURIComponent()` per segment | Built-in; handles all RFC 3986 reserved chars |
| Query string building | Manual string concat | `URLSearchParams` | Handles encoding, repeated keys, special chars |
| URL resolution | String concat | `new URL(path, baseUrl)` | Handles relative resolution correctly per spec |
| Exhaustive union checking | Custom logic | TypeScript `never` distribution via mapped types | Compile-time enforcement is cheaper and more correct |

**Key insight:** This phase is almost entirely type-system work. The runtime logic (path encoding, query building) is trivially covered by existing globals (`encodeURIComponent`, `URLSearchParams`, `URL`). The real complexity is in the TypeScript generics — don't simplify them now; inferring `R` correctly here saves costly refactoring in Phase 7's `Send.Matcher<R, T>`.

---

## Common Pitfalls

### Pitfall 1: `exactOptionalPropertyTypes` + Phantom Fields
**What goes wrong:** Declaring `readonly _phantom: T` (not `declare`) on `TaggedEntry` creates a real value slot. Under `exactOptionalPropertyTypes`, TypeScript will reject assignments where `_phantom` is absent, or produce inference surprises.
**Why it happens:** `exactOptionalPropertyTypes` changes the semantics of optional properties.
**How to avoid:** Always use `declare readonly _phantom: T` — D-12 is a hard requirement.
**Warning signs:** `tsc --noEmit` errors mentioning `_phantom` at object literal sites; or phantom field appearing in emitted `.d.ts`.

### Pitfall 2: Spread Merge Violating Undefined Semantics (P9)
**What goes wrong:** `{ ...clientHeaders, ...requestHeaders }` sets keys with `undefined` values when a request-layer header is explicitly `undefined`. The merged result has `{ "accept": undefined }` — which is an explicit key in strict TypeScript but absent from the actual `fetch` call.
**Why it happens:** Developers assume spread is a "safe" merge idiom.
**How to avoid:** Always use the explicit `undefined`-filtering loop (Pattern 3). D-09 is a hard requirement.
**Warning signs:** Tests show `mergeHeaders({ a: "v" }, { a: undefined })` returning `{ a: undefined }` instead of `{ a: "v" }`.

### Pitfall 3: `noUncheckedIndexedAccess` + `Partial<Record<StatusMatcher, TaggedEntry>>`
**What goes wrong:** Accessing `responseMap[statusMatcher]` returns `TaggedEntry | undefined` under `noUncheckedIndexedAccess`. Code that doesn't handle the `undefined` case fails to compile.
**Why it happens:** `noUncheckedIndexedAccess` adds `| undefined` to all index signatures.
**How to avoid:** Use optional chaining or explicit undefined checks when reading from `ResponseMap` at runtime. In `types.ts` itself, this is a type definition concern, not a runtime concern.
**Warning signs:** TS2345 errors when calling functions on `responseMap[key]` without a null check.

### Pitfall 4: `InferResponseUnion<M>` Distribution Under `Partial<Record<...>>`
**What goes wrong:** When `M` is `Partial<Record<StatusMatcher, TaggedEntry>>`, `keyof M` includes all `StatusMatcher` keys (even absent ones), and the distribution produces `never` for absent keys — which is correct but requires the conditional `extends TaggedEntry<infer T, infer Tag>` to filter them out.
**Why it happens:** `Partial<Record<K, V>>[K]` is `V | undefined`, so the mapped type must handle `undefined` in the `infer` branch.
**How to avoid:** The `M[K] extends TaggedEntry<infer T, infer Tag> ? ... : never` conditional naturally filters `undefined`. Verify with a unit-level type test (`type _test = InferResponseUnion<{ 200: TaggedEntry<User, "ok"> }>`).
**Warning signs:** `R` resolves to `never` or includes `undefined` unexpectedly.

### Pitfall 5: Missing `.js` Extension on Local Imports
**What goes wrong:** `import { ... } from "./types"` (without `.js`) fails at runtime and under the `eslint-plugin-import-x` resolver.
**Why it happens:** `verbatimModuleSyntax` + ESM requires explicit extensions.
**How to avoid:** All local imports must use `.js` extension: `import { ... } from "./types.js"`.
**Warning signs:** ESLint `import-x/no-unresolved` or `import-x/extensions` errors; runtime `ERR_MODULE_NOT_FOUND`.

### Pitfall 6: `import type` Enforcement Under `verbatimModuleSyntax`
**What goes wrong:** A type-only import without `import type` causes a TS error under `verbatimModuleSyntax`.
**Why it happens:** `verbatimModuleSyntax` requires `import type` for type-only imports.
**How to avoid:** Use `import type { RequestSpec } from "./types.js"` in `request.ts` and `client.ts` for type-only imports.
**Warning signs:** TS1484 "This import is never used as a value and must use 'import type'".

---

## Code Examples

Verified patterns from official sources:

### Complete `types.ts` Shape (verified against SPEC.md)
```typescript
// Source: docs/SPEC.md [VERIFIED]
export type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export type QueryValue = string | number | boolean;

export type StatusMatcher = number | "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

export type Schema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
};

export type DecodeIssue = {
  path: Array<string | number>;
  message: string;
  code?: string;
};

export type DecodeError =
  | { kind: "unexpectedBody" }
  | { kind: "emptyBody" }
  | { kind: "invalidJson"; message: string }
  | { kind: "schemaMismatch"; issues: DecodeIssue[] }
  | { kind: "bodyReadFailed"; message: string }
  | { kind: "custom"; message: string; details?: unknown };

export type BodyPreview = {
  text: string;
  bytesRead: number;
  truncated: boolean;
};

export type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };

export type SendResult<R> =
  | { kind: "response"; response: R }
  | { kind: "transportError"; error: TransportError }
  | { kind: "decodeError"; status: number; headers: Headers; error: DecodeError; preview: BodyPreview }
  | { kind: "unhandledStatus"; status: number; headers: Headers; preview: BodyPreview };

export type TaggedEntry<T = unknown, Tag extends string = string> = {
  readonly tag: Tag;
  declare readonly _phantom: T;
  readonly _decode: unknown;
};

export type ResponseMap = Partial<Record<StatusMatcher, TaggedEntry>>;

export type RetryPolicy = {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly backoffMs?: { readonly initial: number; readonly max: number };
};

export type RequestSpec<Responses extends ResponseMap = ResponseMap> = {
  method: Method;
  path?: readonly (string | number)[];
  absoluteUrl?: string | URL;
  query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown; // Body type defined in Phase 4
  responses: Responses;
  retry?: RetryPolicy;
  deadlineMs?: number;
};

export type ClientSpec = {
  baseUrl?: string | URL;
  headers?: Record<string, string | undefined>;
  query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  responses?: ResponseMap;
  retry?: RetryPolicy;
  deadlineMs?: number;
  diagnostics?: {
    bodyPreviewBytes?: number;
  };
};

// Helper: extracts the tagged union from a ResponseMap
export type InferResponseUnion<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag; body: T }
    : never;
}[keyof M];
```

### `Request` class (verified against CONTEXT.md decisions)
```typescript
// Source: CONTEXT.md D-07, D-08; SPEC.md §affine [VERIFIED]
import type { RequestSpec, ResponseMap, InferResponseUnion } from "./types.js";

export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;

  private constructor(spec: RequestSpec) {
    this.#spec = spec;
  }

  static create<M extends ResponseMap>(
    input: Omit<RequestSpec<M>, never>,
  ): Request<InferResponseUnion<M>> {
    return new Request(input as RequestSpec);
  }

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

### `createClient()` minimal shape
```typescript
// Source: SPEC.md §client-model; CONTEXT.md D-06 [VERIFIED]
import type { ClientSpec } from "./types.js";

export function createClient(spec: ClientSpec): ClientSpec {
  return { ...spec }; // shallow copy; merge happens at send() time (Phase 3)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `module: NodeNext` | `module: Preserve` + `moduleResolution: Bundler` | Phase 1 | New files must NOT use NodeNext assumptions; Bundler mode is permissive on extensions at type-check time but runtime still requires `.js` |
| `baseUrl` path aliases | `paths` in tsconfig only | Phase 1 | No bare path imports; local imports always relative |
| `ignoreDeprecations: "6.0"` | Removed | Phase 1 | All deprecated API usage must be resolved before writing new code |

**Deprecated/outdated:**
- `Symbol.for()` for encapsulation: bypassed globally — use `#privateField` instead.
- Spread merge for headers: violates `exactOptionalPropertyTypes` contract — use the explicit loop.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Body` type in `RequestSpec.body` can be typed as `unknown` in Phase 2 (Phase 4 defines the real `Body` type) | Code Examples | Low — Phase 3 imports `RequestSpec`; if `Body` is typed too specifically it may cause breaking changes in Phase 4 |
| A2 | `InferResponseUnion<M>` pattern will satisfy TypeScript 6.x without additional distributive conditional type workarounds | Architecture Patterns | Medium — TS 6.x behavior with `Partial<Record<...>>` and mapped types not directly verified in this session |

---

## Open Questions

1. **`Body` type in `RequestSpec` during Phase 2**
   - What we know: `Body` producers are defined in Phase 4; `RequestSpec.body` needs *some* type in Phase 2.
   - What's unclear: Whether to use `unknown`, `object`, or a forward-declared opaque type.
   - Recommendation: Use `unknown` in Phase 2; Phase 4 can narrow to the real `Body` type when it replaces the placeholder. This is the minimal assumption.

2. **`Request.create()` signature for path/absoluteUrl mutual exclusion**
   - What we know: SPEC requires exactly one of `path` or `absoluteUrl`.
   - What's unclear: Whether to enforce this as a TypeScript union type (`{ path: ... } | { absoluteUrl: ... }`) or defer to runtime validation.
   - Recommendation: Enforce with an overloaded/union input type — catches mistakes at compile time without adding runtime cost. The planner should include this in the `request.ts` plan.

---

## Environment Availability

Step 2.6: No external dependencies identified for this phase. All operations use TypeScript compiler, Node.js built-ins (`encodeURIComponent`, `URLSearchParams`, `URL`), and in-repo tools.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript | `tsc --noEmit` typecheck | ✓ | 6.0.3 | — |
| Node.js | `npm run typecheck` | ✓ | ≥24.0.0 | — |
| Vitest | unit tests | ✓ | 4.1.5 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (already configured with aliases) |
| Quick run command | `npx vitest run --project node` |
| Full suite command | `npm run verify` (typecheck + lint + all test projects) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TYPES-01 | `types.ts` has zero imports; all types exported | typecheck | `npm run typecheck` | ❌ Wave 0 |
| TYPES-02 | `SendResult<R>` 4-variant union with `kind` discriminant | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| TYPES-03 | `TransportError` 3-variant union | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| TYPES-04 | `DecodeError` 6-variant union | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| TYPES-05 | `DecodeIssue` shape | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| TYPES-06 | `BodyPreview` shape | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| TYPES-07 | `ResponseMap` maps `StatusMatcher` to `TaggedEntry` | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| TYPES-08 | `Schema<T>` matches Zod `safeParse` shape structurally | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ Wave 0 |
| REQ-01 | `Request.create()` returns `Request<R>` with correct `RequestSpec` | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ Wave 0 |
| REQ-02 | Path segments encoded separately, joined with `/` | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ Wave 0 |
| REQ-03 | Query: `undefined` omits key; arrays repeat; numbers stringified | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ Wave 0 |
| REQ-04 | Second `consume()` throws `TypeError` | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ Wave 0 |

> Note: SEND-03 (`mergeHeaders()` case-insensitive, undefined-filter) is tested here even though the merge function lives in `client.ts` — it is a behavioral requirement whose correctness can be verified in unit tests before Phase 3.

### Sampling Rate
- **Per task commit:** `npm run typecheck`
- **Per wave merge:** `npx vitest run --project node`
- **Phase gate:** `npm run verify` (full suite green) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/types.test.ts` — covers TYPES-01 through TYPES-08 (structural type tests + import-count assertion)
- [ ] `tests/unit/request.test.ts` — covers REQ-01 through REQ-04 + `mergeHeaders()` / `mergeQuery()`

*(Existing `tests/parity/` is unaffected by this phase — parity tests verify package export surfaces, not new types.)*

---

## Security Domain

This phase contains no authentication, session management, cryptography, HTTP transport, or external I/O. It is pure type definitions and value construction.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Partial | Type system enforces at compile time; runtime path/query encoding via `encodeURIComponent` / `URLSearchParams` |
| V6 Cryptography | No | — |

No threat patterns apply to this phase.

---

## Sources

### Primary (HIGH confidence)
- `docs/SPEC.md` — sole behavioral source of truth; all type definitions verified against spec sections §request-model, §client-model, §send-result, §transport-errors, §body-preview, §decode-errors, §response-matching, §affine
- `.planning/phases/02-core-types-request-model/02-CONTEXT.md` — all locked decisions D-01 through D-12
- `.planning/REQUIREMENTS.md` — TYPES-01–TYPES-08, REQ-01–REQ-04 requirements
- `tsconfig.json` — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: Preserve`, `moduleResolution: Bundler` confirmed active
- `src/shared.ts` — existing `RuntimeTarget` type; must not conflict with Phase 2 types
- `package.json` — confirmed ESM-only, Node ≥24, TypeScript 6.0.3 devDependency

### Secondary (MEDIUM confidence)
- `copilot-instructions.md` — conventions (`.js` extensions, 2-space indent, double quotes, semicolons, named exports, `camelCase` functions, `PascalCase` types, `readonly` members)

### Tertiary (LOW confidence)
- A2 in Assumptions Log: `InferResponseUnion<M>` behavior under TypeScript 6.x with `Partial<Record<...>>` — not directly verified against a TypeScript 6 playground in this session.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; TypeScript version confirmed
- Architecture: HIGH — all decisions locked in CONTEXT.md; SPEC.md fully reviewed
- Pitfalls: HIGH — directly derived from locked decisions and TypeScript config facts
- InferResponseUnion generics: MEDIUM — standard TS mapped-type pattern, but TS 6.x nuances not playground-verified

**Research date:** 2026-05-05
**Valid until:** 2026-06-04 (stable — no external moving parts)
