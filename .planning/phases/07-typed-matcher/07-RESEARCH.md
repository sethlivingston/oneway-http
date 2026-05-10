# Phase 7: Typed Matcher - Research

**Researched:** 2026-05-07
**Domain:** TypeScript mapped types, distributive conditional types, runtime discriminated-union dispatch
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: `requestError` is the 5th fixed key in `Matcher<R,T>`**
Full shape:
```ts
type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } &
  {
    transportError: (error: TransportError) => T;
    decodeError: (error: DecodeError, status: number, headers: Headers, preview: BodyPreview) => T;
    unhandledStatus: (status: number, headers: Headers, preview: BodyPreview) => T;
    requestError: (error: RequestError) => T;
  };
```
All properties are required — no optional keys.

**D-02: Const object + flat type export (no `namespace` keyword)**
- `export const Send = { match } as const`
- `export type Matcher<R,T>` — flat, not `Send.Matcher<R,T>`

**D-03: `TagsOf<R>` is internal to `src/matcher.ts`, not exported**

**D-04: Handler receives full `{ tag, body }` object**
Tagged response handler: `(response: Extract<R, { tag: Tag }>) => T`
Callers access the body via `r.body`.

**D-05: `noUncheckedIndexedAccess` cast pattern for handler dispatch**
```ts
const handler = (handlers as Record<string, (r: unknown) => T>)[result.response.tag];
```

### the agent's Discretion

None specified in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-01 | `Send.match(result, handlers)` — exhaustive match over `SendResult<R>`; missing handler is a compile-time error | `Matcher<R,T>` mapped type with all-required keys enforces this; TypeScript reports missing keys at the call site |
| MATCH-02 | `Matcher<R,T>` — mapped type over `TagsOf<R>` plus `transportError \| decodeError \| unhandledStatus`; requires all variants | `TagsOf<R>` distributive conditional + intersection with 4 fixed-key object type |
| MATCH-03 | Handler objects composable with object spread for reuse of partial handler fragments | `Partial<Matcher<R,T>>` + spread works because Matcher uses all-required keys; `satisfies` preserves inference |

</phase_requirements>

---

## Summary

Phase 7 adds `Send.match()` — an exhaustive runtime dispatcher over `SendResult<R>` — backed by `Matcher<R,T>`, a mapped type that requires a handler for every tagged response variant plus the four fixed error keys. The implementation is entirely additive: one new file (`src/matcher.ts`), two new export lines in `src/index.ts`, and integration tests.

The core TypeScript machinery is straightforward: `TagsOf<R>` is a distributive conditional type that extracts tag string literals from the response union `R`; `Matcher<R,T>` is an intersection of the mapped type and a fixed-key object. The runtime `match()` function switches on `result.kind`; for the `"response"` branch it dispatches to `handlers[result.response.tag]` via a cast that satisfies `noUncheckedIndexedAccess`.

The main subtlety is the SPEC.md vs CONTEXT.md discrepancy. **SPEC.md uses `namespace Send` (banned) and maps over `Result["kind"]` with handlers receiving `Omit<variant, "kind">`**. **CONTEXT.md resolves this to flat exports and tagged response handlers receiving the full `Extract<R, {tag: Tag}>` object (`{tag, body}`)**. CONTEXT.md decisions are authoritative — they represent the design adapted to the project's linting constraints.

**Primary recommendation:** Implement `src/matcher.ts` with `TagsOf<R>` (unexported), `Matcher<R,T>` (exported type), `match<R,T>()` (exported function), and `Send = { match }` (exported const). Thread exports through `src/index.ts`. Write runtime tests in `tests/unit/matcher.test.ts` and compile-time negative tests using `@ts-expect-error`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `TagsOf<R>` distributive type | Type layer (`src/matcher.ts`) | — | Pure type utility; no runtime presence |
| `Matcher<R,T>` mapped type | Type layer (`src/matcher.ts`) | — | Compile-time contract; no runtime value |
| `match()` runtime dispatch | Library core (`src/matcher.ts`) | — | Pure function over `SendResult<R>`; no I/O |
| `Send` const export | Public API (`src/index.ts`) | — | Re-exported from matcher.ts; consumers call `Send.match()` |

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^6.0.3 | Compile-time exhaustiveness enforcement | Project baseline [VERIFIED: package.json] |
| Vitest | ^4.1.5 | Runtime test assertions | Project test framework [VERIFIED: package.json] |

**No new packages required.** Phase 7 is pure TypeScript with no runtime dependencies.

---

## Architecture Patterns

### System Architecture Diagram

```
Consumer call site
        │
        ▼
  Send.match(result, handlers)   ← src/matcher.ts
        │
        ├── result.kind === "response"
        │         │
        │         └── handlers[result.response.tag](result.response)
        │              (cast via Record<string, (r: unknown) => T>)
        │
        ├── result.kind === "transportError"
        │         └── handlers.transportError(result.error)
        │
        ├── result.kind === "decodeError"
        │         └── handlers.decodeError(result.error, result.status, result.headers, result.preview)
        │
        ├── result.kind === "unhandledStatus"
        │         └── handlers.unhandledStatus(result.status, result.headers, result.preview)
        │
        ├── result.kind === "requestError"
        │         └── handlers.requestError(result.error)
        │
        └── default: satisfies never  (compile-time guard only)
```

### Recommended Project Structure

```
src/
├── matcher.ts       # TagsOf<R>, Matcher<R,T>, match(), Send const — NEW
├── types.ts         # SendResult<R>, TransportError, DecodeError, etc. — unchanged
├── index.ts         # + export { Send }; export type { Matcher } — 2 new lines
└── ...              # all other files unchanged

tests/
└── unit/
    └── matcher.test.ts  # Runtime dispatch tests + compile-time @ts-expect-error tests — NEW
```

### Pattern 1: `TagsOf<R>` — Distributive Conditional Type

**What:** Extracts tag string literals from a response union by distributing over each union member.

**When to use:** Internally, to map over all tags in `Matcher<R,T>`.

**Important:** The project rule "Wrap conditional types in `[T]` to prevent unintended distribution" applies only when distribution is *unintended*. `TagsOf<R>` intentionally distributes — do NOT wrap in `[T]`. [VERIFIED: copilot-instructions.md confirms the word "unintended"]

```ts
// Source: TypeScript distributive conditional type — standard pattern [ASSUMED: TypeScript docs]
// Internal to src/matcher.ts — not exported (D-03)
type TagsOf<R> = R extends { tag: infer T extends string } ? T : never;

// Example: TagsOf<{tag:"ok";body:User} | {tag:"notFound";body:null}>
//       => "ok" | "notFound"
```

### Pattern 2: `Matcher<R,T>` — Mapped Type Intersection

**What:** Combines a dynamic mapped type over `TagsOf<R>` with a static fixed-key object type via intersection (`&`).

**When to use:** As the type of the `handlers` parameter in `match()`.

```ts
// Source: CONTEXT.md D-01 [VERIFIED: 07-CONTEXT.md]
export type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } &
  {
    transportError:  (error: TransportError) => T;
    decodeError:     (error: DecodeError, status: number, headers: Headers, preview: BodyPreview) => T;
    unhandledStatus: (status: number, headers: Headers, preview: BodyPreview) => T;
    requestError:    (error: RequestError) => T;
  };
```

### Pattern 3: `match()` Runtime Implementation

**What:** Dispatches over `SendResult<R>` at runtime using a switch statement.

**Critical:** For the `"response"` branch, `noUncheckedIndexedAccess` means `handler` is typed as `((r: unknown) => T) | undefined` after indexing — a defensive guard is needed even though the cast makes it semantically safe. The `!` operator is banned; use a type assertion or guard.

```ts
// Source: CONTEXT.md D-05 + project rules [VERIFIED: 07-CONTEXT.md + copilot-instructions.md]
export function match<R extends { tag: string; body: unknown }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T {
  switch (result.kind) {
    case "response": {
      const handler = (handlers as Record<string, (r: unknown) => T>)[
        result.response.tag
      ];
      // Defensive guard: unreachable when types are correct.
      // Cannot use ! (banned). Cast satisfies the return type.
      if (handler === undefined) {
        return handler as T;  // unreachable branch — types guarantee coverage
      }
      return handler(result.response);
    }
    case "transportError":
      return handlers.transportError(result.error);
    case "decodeError":
      return handlers.decodeError(result.error, result.status, result.headers, result.preview);
    case "unhandledStatus":
      return handlers.unhandledStatus(result.status, result.headers, result.preview);
    case "requestError":
      return handlers.requestError(result.error);
    default: {
      // Compile-time exhaustiveness guard — never executes at runtime.
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
```

### Pattern 4: `Send` Const Object Export (D-02)

**What:** Bundles `match` under the `Send` namespace without using the banned `namespace` keyword.

```ts
// Source: CONTEXT.md D-02 [VERIFIED: 07-CONTEXT.md]
export const Send = { match } as const;
```

Consumer usage: `Send.match(result, handlers)` — identical call shape to the SPEC, just without namespace syntax.

### Pattern 5: `satisfies` for Composable Handler Fragments (MATCH-03)

**What:** Enables typed partial handler fragments that compose with object spread.

```ts
// Source: CONTEXT.md §Specific Ideas [VERIFIED: 07-CONTEXT.md]
const commonFailures = {
  transportError:  (error: TransportError)  => ({ state: "networkError" as const, error }),
  decodeError:     (error: DecodeError, ...) => ({ state: "parseError" as const,  error }),
  unhandledStatus: (status: number, ...)    => ({ state: "unexpected" as const,   status }),
  requestError:    (error: RequestError)    => ({ state: "clientError" as const,  error }),
} satisfies Partial<Matcher<typeof result, SomeReturnType>>;

// Compose at call site:
const outcome = Send.match(result, {
  ...commonFailures,
  ok:       (r) => ({ state: "loaded" as const,  data: r.body }),
  notFound: (r) => ({ state: "missing" as const }),
} satisfies Matcher<typeof result, SomeReturnType>);
```

**Key:** `satisfies` rather than `: Matcher<...>` preserves per-handler inferred return types inside handler bodies.

### Anti-Patterns to Avoid

- **Using `namespace Send`**: Banned by `@sethlivingston/eslint-plugin-typescript-narrows`. Use `export const Send = { match } as const` instead.
- **Wrapping `TagsOf<R>` in `[T]`**: Would prevent the intentional distribution. Only wrap conditional types when distribution is *un*intentional.
- **Using `!` on the handler lookup result**: `!` is banned. Use a defensive `if (handler === undefined)` guard instead.
- **Throwing in the `never` default branch**: `match()` must never throw. The `never` default is a compile-time guard only.
- **Exporting `TagsOf<R>`**: It is internal per D-03. Only `Matcher<R,T>` is the public contract.
- **Using `any` in the cast**: Cast to `Record<string, (r: unknown) => T>` — `unknown` not `any`.
- **Calling `handler(result.response.tag)` vs `handler(result.response)`**: Handler receives the full response object (`{tag, body}`), not just the tag string (D-04).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag extraction | Custom loop to find all tags | `TagsOf<R>` distributive conditional | TypeScript computes this at the type level with zero runtime cost |
| Exhaustiveness check | Runtime schema of expected keys | TypeScript's `Matcher<R,T>` mapped type | Compile-time is cheaper, faster, and catches errors before runtime |
| Partial type fragments | Custom optional-ified handler types | `Partial<Matcher<R,T>>` | Already built into TypeScript's utility types |

**Key insight:** All exhaustiveness enforcement in this phase happens at compile time via the TypeScript type system. The runtime `match()` function is simple dispatch — the complex work is in the types.

---

## Common Pitfalls

### Pitfall 1: SPEC.md handler signatures vs CONTEXT.md handler signatures

**What goes wrong:** Implementing handlers as `(payload: Omit<Extract<Result, { kind: K }>, "kind">) => T` (SPEC pattern) instead of `(response: Extract<R, { tag: Tag }>) => T` for tagged response variants (CONTEXT pattern).

**Why it happens:** SPEC.md §Typed matcher shows the SPEC-level design; CONTEXT.md overrides it with implementation-compliant design.

**How to avoid:** Use CONTEXT.md D-01 as the authoritative handler signature. The fixed-key handlers (`transportError`, `decodeError`, `unhandledStatus`, `requestError`) receive individual arguments, not a single payload object.

**Warning signs:** If `transportError` handler has signature `(payload: { error: TransportError }) => T`, that's the SPEC pattern — wrong for this implementation.

### Pitfall 2: `noUncheckedIndexedAccess` making the handler `T | undefined`

**What goes wrong:** TypeScript infers `handler` as `((r: unknown) => T) | undefined` after the cast-based index access, requiring a call-site guard. Forgetting the guard causes a TypeScript error. Using `handler!` violates the ban on `!`.

**Why it happens:** `noUncheckedIndexedAccess` always adds `| undefined` to string-indexed access, even after a `Record<string, V>` cast.

**How to avoid:** Add a defensive `if (handler === undefined) { return handler as T; }` guard. This branch is unreachable at runtime — it's purely to satisfy the type checker. [VERIFIED: tsconfig.json `noUncheckedIndexedAccess: true`]

### Pitfall 3: `TagsOf<R>` constraint variance — `R` must be constrained

**What goes wrong:** If `TagsOf<R>` is called with a `R` that doesn't extend `{ tag: string }`, it silently distributes over `unknown`/`never` and produces `never` tags, making `Matcher<R,T>` require only the 4 fixed keys.

**Why it happens:** Missing constraint on `R` in `TagsOf`.

**How to avoid:** The constraint is on `Matcher<R extends { tag: string; body: unknown }, T>` — this propagates naturally into `TagsOf<R>`. The `infer T extends string` in `TagsOf` also adds implicit narrowing.

### Pitfall 4: Missing `requestError` handler

**What goes wrong:** Writing `Matcher<R,T>` with only the original 4 fixed keys (`transportError`, `decodeError`, `unhandledStatus`) and omitting `requestError`.

**Why it happens:** The ROADMAP originally specified 4 fixed keys; `requestError` was added to `SendResult<R>` later.

**How to avoid:** `SendResult<R>` has 5 kinds — verified from `src/types.ts`. D-01 explicitly adds `requestError` as the 5th key. [VERIFIED: src/types.ts]

### Pitfall 5: `export const Send` import interop with `verbatimModuleSyntax`

**What goes wrong:** In `src/index.ts`, trying to `export { Send, Matcher }` in a single line — TypeScript with `verbatimModuleSyntax` requires value exports and type exports to be separate.

**How to avoid:** Two separate lines:
```ts
export { Send } from "./matcher.js";          // value
export type { Matcher } from "./matcher.js";  // type
```
[VERIFIED: src/index.ts shows this exact pattern for existing value/type split exports]

---

## Code Examples

### Complete `src/matcher.ts` skeleton

```typescript
// Source: CONTEXT.md D-01 through D-05 [VERIFIED: 07-CONTEXT.md]
import type {
  BodyPreview,
  DecodeError,
  RequestError,
  SendResult,
  TransportError,
} from "./types.js";

// TagsOf<R> — internal, not exported (D-03)
// Intentionally distributive — do NOT wrap in [T].
type TagsOf<R> = R extends { tag: infer T extends string } ? T : never;

// Matcher<R,T> — exported flat type (D-01, D-02)
export type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } &
  {
    transportError:  (error: TransportError) => T;
    decodeError:     (error: DecodeError, status: number, headers: Headers, preview: BodyPreview) => T;
    unhandledStatus: (status: number, headers: Headers, preview: BodyPreview) => T;
    requestError:    (error: RequestError) => T;
  };

// match<R,T>() — exported function (D-05)
export function match<R extends { tag: string; body: unknown }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T {
  switch (result.kind) {
    case "response": {
      const handler = (handlers as Record<string, (r: unknown) => T>)[
        result.response.tag
      ];
      if (handler === undefined) {
        return handler as T; // unreachable
      }
      return handler(result.response);
    }
    case "transportError":
      return handlers.transportError(result.error);
    case "decodeError":
      return handlers.decodeError(result.error, result.status, result.headers, result.preview);
    case "unhandledStatus":
      return handlers.unhandledStatus(result.status, result.headers, result.preview);
    case "requestError":
      return handlers.requestError(result.error);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

// Send const object (D-02) — consumers call Send.match(result, handlers)
export const Send = { match } as const;
```

### `src/index.ts` additions

```typescript
// Source: CONTEXT.md §Integration Points + existing index.ts pattern [VERIFIED: src/index.ts]
export { Send } from "./matcher.js";
export type { Matcher } from "./matcher.js";
```

### Runtime vitest test skeleton

```typescript
// Source: tests/unit/send.test.ts + types.test.ts conventions [VERIFIED: tests/unit/]
import { describe, it, expect } from "vitest";
import { Send } from "../../src/index.js";
import type { Matcher, SendResult, TransportError, DecodeError, BodyPreview, RequestError } from "../../src/index.js";

// Minimal typed response union for tests
type TestResponse = { tag: "ok"; body: string } | { tag: "notFound"; body: null };
type TestResult = SendResult<TestResponse>;

describe("MATCH-01: Send.match() dispatches response variant by tag", () => {
  it("calls 'ok' handler with response object when result.kind is 'response' and tag is 'ok'", () => {
    const result: TestResult = { kind: "response", response: { tag: "ok", body: "hello" } };
    const out = Send.match(result, {
      ok:              (r) => r.body,
      notFound:        (_r) => "not found",
      transportError:  (_e) => "transport",
      decodeError:     (_e, _s, _h, _p) => "decode",
      unhandledStatus: (_s, _h, _p) => "unhandled",
      requestError:    (_e) => "request",
    });
    expect(out).toBe("hello");
  });
  // ... more cases
});
```

### Compile-time negative test with `@ts-expect-error`

```typescript
// @ts-expect-error — missing 'notFound' handler should be a compile error
const _bad = Send.match(result, {
  ok:              (r) => r.body,
  // notFound:     missing intentionally
  transportError:  (_e) => "",
  decodeError:     (_e, _s, _h, _p) => "",
  unhandledStatus: (_s, _h, _p) => "",
  requestError:    (_e) => "",
});
```

This is caught by `tsc --noEmit` (`npm run typecheck`) and by `npm run build` (tsup runs tsc). [VERIFIED: package.json scripts, tsconfig.json includes tests/]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `namespace Send { type Matcher; function match }` | `export const Send = { match }; export type Matcher` | Phase 7 design — namespace banned by ESLint plugin | Flat exports; same consumer call shape `Send.match()` |
| Spec's `Omit<..., "kind">` handler payload | Full `Extract<R, {tag: Tag}>` object | CONTEXT.md D-04 | Callers use `r.body` instead of `r` directly |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@ts-expect-error` in test files validates against missing handler errors when `tsc --noEmit` runs (since tests/ is in tsconfig.json includes) | Validation Architecture | If tsc doesn't catch it, need alternative negative test approach |
| A2 | `if (handler === undefined) { return handler as T; }` satisfies TypeScript without triggering ESLint rules | Code Examples | May need `satisfies never` or different pattern; planner should verify with a trial compile |

---

## Open Questions (RESOLVED)

1. **Defensive `undefined` handler branch — safest pattern**
   - What we know: `!` is banned; `handler` is `((r: unknown) => T) | undefined` after indexed access
   - What's unclear: Whether `return handler as T` (where handler is `undefined`) is the cleanest TS-and-ESLint-compliant escape hatch, or whether `const _: never = result.response.tag as never; return _ as T;` is preferred
   - **RESOLVED:** Use `return handler as T` — the cast is to the expected return type `T`, not to `any`, so it is ESLint-compliant under the typescript-narrows "proven-safe patterns only" rule. The branch is unreachable at runtime (Matcher<R,T> guarantees all tags are covered). Fallback if ESLint flags it: `const _exhaustive: never = result.response.tag as never; return _exhaustive as unknown as T;`

---

## Environment Availability

Step 2.6: SKIPPED — Phase 7 is purely additive TypeScript code with no external tool dependencies beyond the existing project toolchain (already verified operational).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --project node --reporter=verbose tests/unit/matcher.test.ts` |
| Full suite command | `npm test` (runs all projects: node + chromium + firefox + webkit) |
| Type check command | `npm run typecheck` (tsc --noEmit — validates @ts-expect-error annotations) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-01 | `Send.match()` dispatches to correct handler for each `SendResult` kind | unit | `npx vitest run --project node tests/unit/matcher.test.ts` | ❌ Wave 0 |
| MATCH-01 | Missing handler causes compile error | compile-time | `npm run typecheck` + `@ts-expect-error` | ❌ Wave 0 |
| MATCH-02 | `Matcher<R,T>` mapped type covers all tags + 4 fixed keys | type | `npm run typecheck` (TypeScript assignability) | ❌ Wave 0 |
| MATCH-03 | Partial fragment + spread composes into valid `Matcher<R,T>` | unit+type | `npx vitest run --project node tests/unit/matcher.test.ts` + typecheck | ❌ Wave 0 |

### Compile-Time Test Strategy

Vitest uses esbuild for transpilation (strips types without checking them). TypeScript type errors are **not** caught by `vitest run` alone. They are caught by:

1. `npm run typecheck` → `tsc --noEmit` which includes all files in `tsconfig.json` (including `tests/**/*.ts`)
2. `npm run build` → tsup (also runs type checking)
3. `npm run verify` → full pipeline: `typecheck && lint && test`

**`@ts-expect-error`** is the standard mechanism for asserting that a specific line *must* produce a TypeScript error. If the error disappears (e.g., handler is accidentally optional), the `@ts-expect-error` itself becomes an error — giving the test failure we want.

### Sampling Rate

- **Per task commit:** `npx vitest run --project node tests/unit/matcher.test.ts`
- **Per wave merge:** `npm run typecheck && npx vitest run --project node`
- **Phase gate:** `npm run verify` (full suite: typecheck + lint + all 4 projects)

### Wave 0 Gaps

- [ ] `tests/unit/matcher.test.ts` — covers MATCH-01, MATCH-02, MATCH-03
- [ ] `src/matcher.ts` — new file (Wave 1 creates it; Wave 0 only creates the test file)

---

## Security Domain

Not applicable. Phase 7 is a pure type utility and runtime dispatch function with no I/O, no user input, no network access, and no data persistence. ASVS categories V2–V6 do not apply.

---

## Project Constraints (from copilot-instructions.md)

| Rule | Impact on Phase 7 |
|------|--------------------|
| No `namespace` keyword (banned by ESLint [M]) | Use `export const Send = { match } as const` not `namespace Send` |
| No explicit `any` — use `unknown` [B] | Cast to `Record<string, (r: unknown) => T>` not `Record<string, (r: any) => T>` |
| No `!` non-null assertion [B] | Defensive `if (handler === undefined)` guard required |
| Explicit return types on exported functions [M] | `match<R,T>(result, handlers): T` needs explicit `: T` return type annotation |
| `noUncheckedIndexedAccess` | Cast pattern for `handlers[tag]` access; `handler` typed as `V | undefined` |
| `import type` for type-only imports [S] | All type imports in `matcher.ts` must use `import type` |
| `verbatimModuleSyntax` | `index.ts` needs separate `export { Send }` and `export type { Matcher }` lines |
| `.js` extensions in local imports | `import from "./types.js"` not `"./types"` |
| Named exports only — no default exports [M] | `export const Send`, `export type Matcher`, `export function match` |
| Wrap conditional types in `[T]` only to prevent *unintended* distribution [B] | `TagsOf<R>` must NOT be wrapped — distribution is intentional |
| Always handle all discriminated union variants exhaustively [B] | Switch needs all 5 `result.kind` cases + `never` default |
| Dependency direction: no circular imports | `matcher.ts` may import from `types.ts` — fine; must NOT import from `client.ts` or `send.ts` |
| `types.ts` has zero imports | `matcher.ts` is a new file — this rule doesn't apply to it |

---

## Sources

### Primary (HIGH confidence)
- `src/types.ts` — verified `SendResult<R>` 5-variant structure, `TransportError`, `DecodeError`, `RequestError`, `BodyPreview` signatures
- `.planning/phases/07-typed-matcher/07-CONTEXT.md` — authoritative locked decisions D-01 through D-05
- `src/index.ts` — verified export pattern (verbatimModuleSyntax, named exports, .js extensions)
- `tsconfig.json` — verified `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`, `strict: true`
- `package.json` — verified scripts (`typecheck`, `verify`, `pretest`), no tsd dependency
- `tests/unit/types.test.ts` — verified test patterns (no tsd, no `@ts-expect-error` yet, TypeScript assignability via direct annotations)
- `tests/unit/response-matching.test.ts` — verified test file naming convention and describe/it structure
- `src/response-matching.ts` — confirmed no `TagsOf<R>` exists from Phase 5 — Phase 7 must define it fresh

### Secondary (MEDIUM confidence)
- `docs/SPEC.md §Typed matcher` — behavioral context; superseded by CONTEXT.md for implementation specifics
- `copilot-instructions.md` — project conventions confirmed against codebase evidence

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; TypeScript built-in features only
- Architecture: HIGH — verified against actual source files
- Pitfalls: HIGH — SPEC vs CONTEXT discrepancy directly verified; noUncheckedIndexedAccess confirmed in tsconfig
- Test approach: MEDIUM — `@ts-expect-error` pattern is standard TypeScript but not yet used in this project's test suite (A1)

**Research date:** 2026-05-07
**Valid until:** Until any changes to `src/types.ts` (SendResult shape) or project ESLint rules
