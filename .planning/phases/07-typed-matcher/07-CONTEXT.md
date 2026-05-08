# Phase 7: Typed Matcher - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `Send.match()` as an exhaustive runtime dispatcher over `SendResult<R>`, backed by `Matcher<R,T>` — a mapped type that requires a handler for every response tag plus all five fixed error variants. Adding a new `ResponseMap` entry produces a compile-time error at every `Send.match()` call site missing that handler.

**In scope:**
- `src/matcher.ts` (new file) — `TagsOf<R>` (internal), `Matcher<R,T>` (exported type), `match<R,T>()` (exported function), `Send` const object (exported)
- `src/types.ts` — no changes needed; `InferResponseUnion<M>`, `SendResult<R>`, `RequestError` all already defined
- `src/index.ts` — export `Send` (const) and `Matcher` (type) from `./matcher.js`
- Integration tests verifying compile-time exhaustiveness enforcement

**Not in scope:**
- TSDoc — Phase 8
- README examples — Phase 8
- Changes to `send()`, `matchResponse()`, or any existing module

</domain>

<decisions>
## Implementation Decisions

### D-01: `requestError` included in `Matcher<R,T>` as a 5th fixed key

`SendResult<R>` has five variants: `response | transportError | decodeError | unhandledStatus | requestError`. `Matcher<R,T>` requires handlers for all five fixed variants plus the tagged response keys. The ROADMAP's four-key spec was written before `requestError` was added to `SendResult`; this decision corrects that gap.

`requestError` was added when pre-flight validation moved out of `Request.create()` and into `send()` — it is a real runtime outcome, not a programmer error that callers can ignore. Callers must handle it.

Full `Matcher<R,T>` shape:
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

All properties are **required** — no optional keys. A missing handler is a compile error.

### D-02: Const object + flat type export (no `namespace` keyword)

TypeScript namespaces are banned by `@sethlivingston/eslint-plugin-typescript-narrows` ("Do not use TypeScript namespaces; use ES modules" [M]).

**Export pattern:**
- `export const Send = { match } as const` — runtime value; consumers call `Send.match(result, handlers)`
- `export type Matcher<R,T>` — flat named type export; consumers annotate as `Matcher<R,T>`, not `Send.Matcher<R,T>`

**Note:** The ROADMAP specified `Send.Matcher<R,T>` but that requires namespace declaration merging which the linter bans. `Matcher<R,T>` (flat) is the compliant equivalent and equally readable. The `Send.match()` call shape is preserved.

### D-03: `TagsOf<R>` internal only

`TagsOf<R>` is the distributive conditional type extracting tag string literals from the response union. It lives in `src/matcher.ts`, unexported. `Matcher<R,T>` is the public contract; `TagsOf` is the mechanism.

### D-04: Handler receives full `{ tag, body }` object (carried from Phase 5 D-02)

Handler signatures for tagged response variants: `(response: Extract<R, { tag: Tag }>) => T`. This passes the full `{ tag: "user"; body: User }` object. Callers access the body via `r.body`.

Rationale (from Phase 5 D-02): discriminating on `tag` is unambiguous when decoder types overlap structurally; `Send.match()` is built directly on tag discrimination; ergonomic cost is low.

### D-05: `noUncheckedIndexedAccess` handler dispatch — cast pattern

Accessing `handlers` by tag key requires a cast to satisfy `noUncheckedIndexedAccess`. Correct pattern:

```ts
const handler = (handlers as Record<string, (r: unknown) => T>)[result.response.tag];
```

This avoids `as any`. The cast is safe because `Matcher<R,T>`'s mapped type guarantees every tag in `TagsOf<R>` has a handler.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behavioral specification
- `docs/SPEC.md` — sole behavioral source of truth; no behavior implemented that contradicts or extends it without a spec update
- `docs/SPEC.md` §Typed Matcher — `Send.match()` and `Send.Matcher<R,T>` behavioral contract

### Type foundations (already implemented)
- `src/types.ts` — `SendResult<R>`, `InferResponseUnion<M>`, `TransportError`, `DecodeError`, `RequestError`, `BodyPreview`, `ResponseMap`, `TaggedEntry`
- `.planning/phases/05-response-matching-decode-dispatch/05-CONTEXT.md` — D-02: response union shape `{ tag, body }` decision; `InferResponseUnion<M>` rationale

### Requirements
- `.planning/REQUIREMENTS.md` §Typed Matcher — MATCH-01, MATCH-02, MATCH-03

### Coding standards
- `.github/copilot-instructions.md` — architectural rules, no `instanceof`, no namespace, dependency direction
- ESLint: `@sethlivingston/eslint-plugin-typescript-narrows` strict config — no `namespace`, no `any`, explicit return types on exports

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types.ts` — `SendResult<R>`, `InferResponseUnion<M>`, `TransportError`, `DecodeError`, `RequestError`, `BodyPreview` all fully defined; import as needed
- `src/index.ts` — existing export pattern to follow when adding `Send` and `Matcher`

### Established Patterns
- **Flat named exports** — `index.ts` uses named exports throughout; no default exports; no barrel re-exports of submodule internals
- **`import type`** — enforced by `verbatimModuleSyntax`; use `import type` for type-only imports in `matcher.ts`
- **Explicit return types on exports** — all exported functions annotate return type explicitly
- **Structured returns, zero throws** — `match()` must never throw; if `result.kind` is somehow unrecognized, the `never` default branch in the switch should be a compile-time guard, not a runtime throw
- **`noUncheckedIndexedAccess`** — cast pattern for handler dispatch: `(handlers as Record<string, (r: unknown) => T>)[tag]`

### Integration Points
- `src/index.ts` — add `export { Send } from "./matcher.js"` and `export type { Matcher } from "./matcher.js"`
- No changes to `src/send.ts`, `src/response-matching.ts`, or `src/types.ts`

</code_context>

<specifics>
## Specific Ideas

- The `satisfies` idiom for composable partial fragments: `const baseHandlers = { transportError: ..., decodeError: ..., ... } satisfies Partial<Matcher<R, string>>` — works naturally because `Matcher<R,T>` has no optional properties and `Partial<>` makes them optional for fragment use.
- Integration test: adding `"404": { decoder: Decode.none(), tag: "notFound" as const }` to `responses` should produce a TypeScript compile error at every existing `Send.match()` call site lacking a `notFound` handler.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 7-Typed Matcher*
*Context gathered: 2026-05-07*
