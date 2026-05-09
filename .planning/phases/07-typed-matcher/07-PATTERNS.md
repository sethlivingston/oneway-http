# Phase 7: Typed Matcher - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 2 (1 new, 1 modified)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/matcher.ts` | utility / dispatcher | transform (discriminated-union dispatch) | `src/response-matching.ts` | role-match (pure function, no I/O) |
| `src/index.ts` | entrypoint | N/A (export additions only) | `src/index.ts` (existing lines) | exact |

---

## Pattern Assignments

### `src/matcher.ts` (utility, discriminated-union dispatch)

**Analog:** `src/response-matching.ts` (pure function over structured types, `import type` from `./types.js`, no default exports, explicit return type on exported function)

---

#### Imports pattern — copy from `src/send.ts` lines 5–13 and `src/response-matching.ts` line 2

`src/response-matching.ts` shows the import-type-only pattern for a pure utility module:

```typescript
// src/response-matching.ts — lines 1-2
// src/response-matching.ts — pure function for two-tier response map lookup
import type { ResponseMap, StatusMatcher, TaggedEntry } from "./types.js";
```

`src/send.ts` shows the full `import type { ... }` block style for multiple types:

```typescript
// src/send.ts — lines 5-13
import type {
  ClientSpec,
  DecodeError,
  QueryValue,
  RequestSpec,
  SendResult,
  SendOptions,
  RequestError,
} from "./types.js";
```

**Apply to `src/matcher.ts`:** Use `import type { ... }` for all type imports from `./types.js`. No runtime imports are needed. Use `.js` extension on all local imports.

```typescript
// src/matcher.ts — imports block (to write)
import type {
  SendResult,
  TransportError,
  DecodeError,
  BodyPreview,
  RequestError,
} from "./types.js";
```

---

#### Core type + function pattern — `src/response-matching.ts` + CONTEXT.md D-01/D-05

**`TagsOf<R>` — internal distributive conditional type (do NOT export):**

```typescript
// src/matcher.ts — TagsOf (internal)
type TagsOf<R extends { tag: string; body: unknown }> =
  R extends { tag: infer Tag extends string } ? Tag : never;
```

**`Matcher<R,T>` — exported mapped type (from CONTEXT.md D-01):**

```typescript
// src/matcher.ts — Matcher<R,T> (export type, not export const)
export type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } &
  {
    transportError: (error: TransportError) => T;
    decodeError: (error: DecodeError, status: number, headers: Headers, preview: BodyPreview) => T;
    unhandledStatus: (status: number, headers: Headers, preview: BodyPreview) => T;
    requestError: (error: RequestError) => T;
  };
```

**`match<R,T>()` function — switch on `result.kind` (from CONTEXT.md D-05 + `src/send.ts` return shapes):**

The `SendResult<R>` variants from `src/types.ts` lines 60–76:
```typescript
// src/types.ts — lines 60-76
export type SendResult<R> =
  | { kind: "response"; response: R }
  | { kind: "transportError"; error: TransportError }
  | { kind: "decodeError"; status: number; headers: Headers; error: DecodeError; preview: BodyPreview }
  | { kind: "unhandledStatus"; status: number; headers: Headers; preview: BodyPreview }
  | { kind: "requestError"; error: RequestError };
```

The dispatch function must switch over all five `kind` values. Handler lookup for `"response"` branch uses the D-05 cast to satisfy `noUncheckedIndexedAccess`:

```typescript
// src/matcher.ts — match() function (to write)
export function match<R extends { tag: string; body: unknown }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T {
  switch (result.kind) {
    case "response": {
      const handler = (handlers as Record<string, (r: unknown) => T>)[result.response.tag];
      // handler is guaranteed by Matcher<R,T>'s mapped type — cast is safe
      return (handler as (r: R) => T)(result.response);
    }
    case "transportError":
      return handlers.transportError(result.error);
    case "decodeError":
      return handlers.decodeError(result.error, result.status, result.headers, result.preview);
    case "unhandledStatus":
      return handlers.unhandledStatus(result.status, result.headers, result.preview);
    case "requestError":
      return handlers.requestError(result.error);
  }
}
```

> **Note:** `match()` must never throw. The `switch` is exhaustive over all five `kind` literals in `SendResult<R>`; TypeScript will flag any missing case at compile time. Do NOT add a `default` branch that throws — use the exhaustiveness pattern instead (TypeScript narrows to `never` after all cases are handled).

**`Send` const object — exported const (from CONTEXT.md D-02):**

```typescript
// src/matcher.ts — Send const (to write)
export const Send = { match } as const;
```

---

#### File-level comment pattern — `src/response-matching.ts` line 1 / `src/send.ts` line 1

Both existing modules start with a single-line comment naming the module and its role:

```typescript
// src/response-matching.ts — pure function for two-tier response map lookup
// src/send.ts — single-attempt transport core
```

Apply same pattern:

```typescript
// src/matcher.ts — exhaustive runtime dispatcher over SendResult<R>
```

---

#### Error handling pattern

`src/response-matching.ts` uses **no try/catch** — it returns structured values or `null`. `match()` must follow the same zero-throw discipline. All branches are accounted for by the switch; no error-catching wrapper needed.

---

### `src/index.ts` (entrypoint, export additions)

**Analog:** existing `src/index.ts` lines 21–37

Current export lines that establish the pattern to follow:

```typescript
// src/index.ts — lines 21-37 (existing)
export { Body } from "./body.js";

export { Decoder, Decode } from "./decode.js";

export type {
  RequestError,
  SendResult,
  DecodeError,
  DecodeIssue,
  BodyPreview,
  TransportError,
} from "./types.js";

export type { RequestSpec } from "./types.js";
```

**Two lines to add** (one value export, one type export — kept on separate lines per the existing style that groups by module):

```typescript
// src/index.ts — lines to add
export { Send } from "./matcher.js";
export type { Matcher } from "./matcher.js";
```

> **Note:** `Send` is a const (runtime value) so it uses `export { … }`, not `export type { … }`. `Matcher` is a type alias so it uses `export type { … }`. TypeScript 6 with `verbatimModuleSyntax` requires this distinction — mixing value and type under the same name from different modules is not allowed (see existing comment at line 17–19 in `src/index.ts`).

---

## Shared Patterns

### `import type` for all type-only imports
**Source:** `src/response-matching.ts` line 2; `src/send.ts` lines 5–13
**Apply to:** `src/matcher.ts` (all imports are type-only)
```typescript
import type { ... } from "./types.js";
```

### Explicit `.js` extension on all local imports
**Source:** `src/send.ts` line 13 (`"./types.js"`); `src/response-matching.ts` line 2
**Apply to:** `src/matcher.ts`, `src/index.ts` additions
- All local module imports must end with `.js`, even though source files are `.ts`.

### Named exports only — no default exports
**Source:** `src/response-matching.ts`, `src/send.ts`, `src/index.ts`
**Apply to:** `src/matcher.ts`
- Use `export function`, `export type`, `export const` — never `export default`.

### Explicit return type annotation on exported functions
**Source:** `src/response-matching.ts` line 26–31 (`): TaggedEntry | null {`)
**Apply to:** `src/matcher.ts` — `match()` must annotate `): T`
```typescript
export function match<R extends { tag: string; body: unknown }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T { ... }
```

### Test file structure
**Source:** `tests/unit/response-matching.test.ts` lines 1–76

```typescript
// tests/unit/response-matching.test.ts — lines 1-3
import { describe, it, expect } from "vitest";
import { matchResponse } from "../../src/response-matching.js";
import type { ResponseMap, TaggedEntry } from "../../src/types.js";
```

Pattern: `import { describe, it, expect } from "vitest"` + named import from `../../src/<module>.js` + `import type` for types. Each `describe` block maps to a single requirement ID (e.g., `MATCH-01`). Negative compile-time tests use `@ts-expect-error`.

---

## No Analog Found

All files have analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/`, `tests/unit/`
**Files scanned:** `src/response-matching.ts`, `src/types.ts`, `src/index.ts`, `src/send.ts`, `tests/unit/response-matching.test.ts`, `tests/unit/send.test.ts`
**Pattern extraction date:** 2026-05-07
