---
phase: 07-typed-matcher
reviewed: 2025-07-24T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/matcher.ts
  - src/index.ts
  - tests/unit/matcher.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 07: Code Review Report

**Reviewed:** 2025-07-24  
**Depth:** standard  
**Files Reviewed:** 3  
**Status:** issues_found

## Summary

Three files implement the typed matcher dispatcher (`Send.match`) and its compile-time `Matcher<R,T>` type. The core structure is sound: distributive `TagsOf<R>`, the intersection-mapped `Matcher<R,T>`, and the five-case exhaustive switch with a `never` guard are all correctly conceived.

One blocker was found: the "unreachable" fallback branch in the `"response"` case silently returns `undefined` disguised as `T`, which violates the function's return-type contract for any caller that reaches it (e.g., untyped JavaScript callers or future regressions). Two warnings cover a tag-collision trap baked into the `Matcher<R,T>` intersection type, and excessive inline comments that violate the project's source-comment convention.

`src/index.ts` adds two lines and is clean. The test file exercises all five dispatch variants, includes bidirectional `@ts-expect-error` enforcement, and covers handler-composition via spread; no issues found there.

---

## Critical Issues

### ~~CR-01~~: REJECTED — "Unreachable" fallback returns `undefined` cast as `T`

**Status:** REJECTED — library targets TypeScript consumers. JavaScript callers who bypass the type system are explicitly unsupported ("on their own"). The branch is structurally unreachable for any correctly-typed caller; the no-throw public API contract takes precedence over defensive programming for unsupported callers. No action required.

**File:** `src/matcher.ts:48-49`

**Issue:**  
When `handler` resolves to `undefined` in the dynamic dispatch path, the code executes:

```typescript
if (handler === undefined) {
  return handler as unknown as T; // unreachable
}
```

`handler` is provably `undefined` here — the cast `handler as unknown as T` compiles, but at runtime it returns `undefined` to the caller, not a value of type `T`. Any consumer that assigns or chains the result of `Send.match()` will receive `undefined` where the type system promised them `T`. This is a silent contract violation that will manifest as obscure downstream failures (e.g., `Cannot read properties of undefined` far from the call site) with no indication that `match()` was the source.

The branch is described as "unreachable" for typed callers, but it is reachable in two real scenarios:
1. JavaScript (untyped) callers passing a response whose `tag` was not in the original `Matcher` — a likely integration error.
2. Future accidental regressions where `TagsOf<R>` and the actual response union diverge.

In both cases the current code masks the bug entirely instead of surfacing it.

**Fix:**  
Replace the silent `return undefined as T` with an explicit throw. The "Never throws" guarantee documented above the function applies to well-typed callers; a guard throw for programming errors is the correct behavior for a branch that should never execute:

```typescript
case "response": {
  const handler = (handlers as unknown as Record<string, (r: unknown) => T>)[
    result.response.tag
  ];
  if (handler === undefined) {
    // Unreachable for correctly-typed callers. Throw to surface bugs
    // from untyped callers or future type/runtime divergence.
    throw new Error(
      `[oneway-http] No handler for response tag "${result.response.tag}". ` +
      `This is a programming error — ensure every response tag in your union ` +
      `has a corresponding handler in the Matcher object.`
    );
  }
  return handler(result.response);
}
```

If an absolute no-throw constraint must be preserved even for programming errors, the minimum acceptable change is to make the fallback observable:

```typescript
if (handler === undefined) {
  // Unreachable; returning `undefined` here signals a programming error
  // to the caller rather than silently returning undefined-as-T.
  return undefined as never;
}
```

The `as never` prevents TypeScript from treating the return as satisfying `T`, making downstream TypeScript callers see a type error if this path were somehow provably reachable. But throwing remains the correct choice.

---

## Warnings

### WR-01: `Matcher<R,T>` intersection silently becomes unsatisfiable when a response tag collides with a fixed handler key

**File:** `src/matcher.ts:16-32`

**Issue:**  
`Matcher<R,T>` is defined as:

```typescript
{ [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T } &
{
  transportError: (error: TransportError) => T;
  decodeError: (error: DecodeError, ...) => T;
  unhandledStatus: (...) => T;
  requestError: (error: RequestError) => T;
};
```

If any member of `R` carries a `tag` equal to one of the four fixed keys — `"transportError"`, `"decodeError"`, `"unhandledStatus"`, or `"requestError"` — then the intersection produces conflicting handler signatures for the same key:

- From the mapped type: `transportError: (response: { tag: "transportError"; body: T }) => T`
- From the fixed section: `transportError: (error: TransportError) => T`

TypeScript resolves this as an intersection of the two function signatures, i.e., a handler that must be callable with EITHER argument type. No simple lambda can satisfy that without a union parameter, making `Matcher<R,T>` impossible to construct. The TypeScript error message will be cryptic — users will not understand why their ordinary response tag causes a conflict.

Additionally, at runtime `match()` dispatches these two cases through different code paths (`"response"` via dynamic lookup, `"transportError"` via the explicit `case`), so the tag collision would never be consistently handled even if a user forced the type through.

**Fix:**  
Add a `never` guard to the mapped type that drops any tag that collides with a fixed handler key:

```typescript
type ReservedTags = "transportError" | "decodeError" | "unhandledStatus" | "requestError";

export type Matcher<R extends { tag: string; body: unknown }, T> =
  { [Tag in Exclude<TagsOf<R>, ReservedTags>]: (response: Extract<R, { tag: Tag }>) => T } &
  {
    transportError: (error: TransportError) => T;
    decodeError: (error: DecodeError, status: number, headers: Headers, preview: BodyPreview) => T;
    unhandledStatus: (status: number, headers: Headers, preview: BodyPreview) => T;
    requestError: (error: RequestError) => T;
  };
```

Alternatively, add a type-level assertion in the `match()` overload or an `@ts-expect-error` test that documents the reserved-tag constraint. At minimum, the reserved tag names should be called out prominently in JSDoc or a type-level `never` assertion to give users a clear diagnostic.

---

### WR-02: Inline comments throughout `src/matcher.ts` violate the project's source-comment convention

**File:** `src/matcher.ts:10-11, 14-15, 34-35, 41-51, 71-72, 79-80`

**Issue:**  
The project convention explicitly states:

> "Prefer self-describing names and tiny modules over inline comments; `src/*.ts` … are almost entirely comment-free."
> "Put behavioral guidance in durable docs … rather than scattered source comments."

`src/matcher.ts` carries dense inline annotations on nearly every significant construct: the internal `TagsOf` type, the `Matcher` type, the `match` function, the `undefined` guard, the exhaustiveness guard, and the `Send` const. Other source files in `src/` contain minimal or no comments; this file is an outlier.

**Fix:**  
Remove inline comments. Move any non-obvious design rationale (e.g., why `as unknown as Record<…>` is required, why the exhaustiveness guard uses `never`) to a phase design doc or the spec. The `// unreachable` comment on line 49 is additionally misleading since — per CR-01 — the branch is reachable from untyped callers.

---

_Reviewed: 2025-07-24_  
_Reviewer: gsd-code-reviewer_  
_Depth: standard_
