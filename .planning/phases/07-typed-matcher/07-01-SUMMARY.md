---
phase: 07-typed-matcher
plan: "01"
subsystem: typed-matcher
tags: [matcher, types, dispatch, send]
dependency_graph:
  requires: [src/types.ts]
  provides: [src/matcher.ts]
  affects: [src/index.ts, tests/unit/matcher.test.ts]
tech_stack:
  added: []
  patterns: [distributive-conditional-types, mapped-intersection-type, exhaustive-switch, noUncheckedIndexedAccess-cast]
key_files:
  created:
    - src/matcher.ts
    - tests/unit/matcher.test.ts
  modified:
    - src/index.ts
decisions:
  - "D-01: Matcher<R,T> has 5 fixed keys (transportError, decodeError, unhandledStatus, requestError) + mapped TagsOf<R>"
  - "D-02: export const Send = { match } as const — flat, no namespace"
  - "D-03: TagsOf<R> is internal (unexported)"
  - "D-04: Handler receives full Extract<R, { tag: Tag }> object"
  - "D-05: noUncheckedIndexedAccess cast pattern: (handlers as Record<string, (r: unknown) => T>)[tag] with undefined guard"
metrics:
  duration: "173s"
  completed: "2026-05-07T22:02:23Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 7 Plan 1: Typed Matcher — TagsOf, Matcher, match, Send Summary

**One-liner:** Exhaustive `Send.match()` dispatcher backed by `Matcher<R,T>` mapped intersection type with compile-time enforcement over all 5 `SendResult<R>` variants.

## What Was Built

### src/matcher.ts (new)

- **`TagsOf<R>`** — Internal distributive conditional type extracting tag string literals from the response union. Not exported (D-03).
- **`Matcher<R,T>`** — Exported intersection type combining a mapped type `{ [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T }` with 4 fixed error handler keys (`transportError`, `decodeError`, `unhandledStatus`, `requestError`). All properties required — missing any key is a compile-time error.
- **`match<R,T>()`** — Exported function with exhaustive `switch` over all 5 `SendResult<R>` variants. Never throws. Uses the `noUncheckedIndexedAccess` cast pattern with a defensive `undefined` guard for handler lookup (the undefined branch is unreachable at runtime but required by the type checker; `!` operator is banned).
- **`Send`** — Exported const object `{ match } as const`. Consumers call `Send.match(result, handlers)`. Not a namespace — TypeScript namespaces are banned.

### src/index.ts (modified)

Added two lines after the last existing export:
```typescript
export { Send } from "./matcher.js";
export type { Matcher } from "./matcher.js";
```
`Send` is a runtime value export; `Matcher` is a type-only export — kept on separate lines per `verbatimModuleSyntax` requirements.

### tests/unit/matcher.test.ts (new stub)

9 `it.todo()` stubs across 7 `describe` blocks covering MATCH-01 (all 5 dispatch variants), MATCH-02 (compile-time exhaustiveness), and MATCH-03 (composability). No imports from `matcher.ts` yet — Wave 2 (Plan 02) will fill out the stubs.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

`tests/unit/matcher.test.ts` — 9 `it.todo()` stubs intentionally left empty. This is by design: the test file is a Wave 1 scaffold to unblock Wave 2 test authoring (07-02-PLAN.md). Plan 02 will fill in all stubs with real assertions.

## Threat Flags

None — `src/matcher.ts` is pure type machinery and runtime dispatch over caller-supplied values. No I/O, no network, no trust boundary crossed.

## Self-Check

- [x] `src/matcher.ts` exists: created with 81 lines
- [x] `tests/unit/matcher.test.ts` exists: 9 it.todo() stubs
- [x] `src/index.ts` has both export lines
- [x] `npm run typecheck` passes with 0 errors
- [x] No namespace, no `any`, no `!` operator in src/matcher.ts
- [x] TagsOf is not exported
- [x] Commits bdb9cec and 2b04e7e exist
