# Phase 7: Typed Matcher - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 07-typed-matcher
**Areas discussed:** `requestError` in Matcher, `Send` namespace export shape, `TagsOf<R>` visibility

---

## `requestError` in `Send.Matcher`

| Option | Description | Selected |
|--------|-------------|----------|
| Include as 5th fixed key | Fully exhaustive — all `SendResult` variants required in handler | ✓ |
| Exclude from Matcher | Callers handle `requestError` upstream before calling `Send.match()` | |
| Exclude with silent return | `Send.match()` returns `undefined` silently on `requestError` | |

**User's choice:** Option 1 — include `requestError` as a required handler key.

**Notes:** User explained that `requestError` was added after the initial ROADMAP was written, when pre-flight validation was moved out of `Request.create()` and into `send()`. Because it's a real runtime outcome from `send()` rather than a programming error that callers could detect before calling `match()`, it belongs in the exhaustive handler. The ROADMAP's four-key spec was simply written before this variant existed.

---

## `Send` namespace export shape

| Option | Description | Selected |
|--------|-------------|----------|
| Pure TypeScript namespace | `export namespace Send { export function match... }` — BANNED by linter | |
| Const object + namespace merge | `export const Send = { match }` + `export namespace Send { type Matcher... }` — also requires `namespace` keyword | |
| Const object + flat type export | `export const Send = { match }` + `export type Matcher<R,T>` separately | ✓ |
| Flat exports, no grouping | `export function match` and `export type Matcher` with no `Send.` prefix at all | |

**User's choice:** Deferred to agent — "be sure it doesn't conflict with /the-typescript-narrows or the linter."

**Notes:** Agent checked `@sethlivingston/eslint-plugin-typescript-narrows` rule "Do not use TypeScript namespaces; use ES modules [M]" — confirmed `namespace` keyword is banned unconditionally, including for declaration merging. User then asked whether the rule is overbearing. Agent assessed: the rule is technically overbearing for this specific pattern (namespace merging with a const adds no runtime code and doesn't violate tree-shaking), but the consistency benefit of "namespace never appears in this codebase" outweighs the ergonomic gain of `Send.Matcher<R,T>` over `Matcher<R,T>`. User accepted that reasoning. Result: `const Send = { match }` for the runtime object; `Matcher<R,T>` as a flat named type export. `Send.match()` call shape preserved; type loses the `Send.` prefix.

---

## `TagsOf<R>` visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Internal only | Lives in `src/matcher.ts`, unexported — implementation detail of `Matcher<R,T>` | ✓ |
| Public export | Exported for consumers building generic utilities over response maps | |

**User's choice:** Keep internal.

**Notes:** No additional rationale provided — clean default.

---

## Agent's Discretion

- Handler dispatch cast pattern for `noUncheckedIndexedAccess`: `(handlers as Record<string, (r: unknown) => T>)[tag]` — agent selected this as the correct pattern per ROADMAP implementation notes; user did not override.
- Handler function argument shape (`Extract<R, { tag: Tag }>` passes full `{ tag, body }` object) — carried forward from Phase 5 D-02; not re-discussed.

## Deferred Ideas

None — discussion stayed within phase scope.
