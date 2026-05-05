# Phase 2: Core Types + Request Model - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the complete type foundation and the `Request` class. Three files, zero HTTP behavior:

1. `src/types.ts` — all shared type definitions; zero logic, zero imports.
2. `src/request.ts` — `Request<R>` class with `create()` static factory, path/query building, affine enforcement.
3. `src/client.ts` — `createClient()` function and header/query merge utilities.

Every subsequent module (`send.ts`, `body.ts`, `decode.ts`, etc.) imports from `types.ts`. It is the dependency root.

</domain>

<decisions>
## Implementation Decisions

### TaggedEntry / ResponseMap / Request<R> phantom typing
- **D-01:** Use **full generic inference** from the start. `TaggedEntry<T, Tag extends string>` carries the phantom decoded-value type (`declare readonly _phantom: T`) and the tag literal (`readonly tag: Tag`). An opaque `readonly _decode: unknown` slot holds the runtime decoder value — Phase 4 casts it; `types.ts` stays import-free.
- **D-02:** `ResponseMap` is `Partial<Record<StatusMatcher, TaggedEntry>>` for the concrete base type. `RequestSpec` takes a generic `Responses extends ResponseMap = ResponseMap` so inference flows from the literal object passed to `Request.create()`.
- **D-03:** `Request<R>` carries `R` as a phantom type parameter. `R` is inferred at `Request.create()` time via a mapped-type helper (`InferResponseUnion<M>`) that walks the `ResponseMap` entries and produces the tagged union. This ensures `send(request, client)` returns a fully typed `Promise<SendResult<R>>` without any explicit annotation from the caller.
- **D-04:** `InferResponseUnion<M>` lives in `types.ts` or is derivable from the types there. It maps each entry's `TaggedEntry<T, Tag>` to `{ tag: Tag; body: T }` and unions them. Phase 7's `Send.Matcher<R, T>` is built on top of the same inference.

### RetryPolicy
- **D-05:** Define `RetryPolicy` concretely in `types.ts` now. Based on SPEC semantics:
  ```ts
  type RetryPolicy = {
    readonly methods?: readonly Method[];
    readonly maxAttempts?: number;
    readonly retryableStatuses?: readonly number[];
    readonly backoffMs?: { readonly initial: number; readonly max: number };
  };
  ```
  Minor field adjustments are acceptable in Phase 6 if the implementation requires them.

### ClientSpec.query
- **D-06:** Include `query?: Record<string, QueryValue | readonly QueryValue[] | undefined>` in `ClientSpec`. The SPEC merge table lists query with "Merge by key; request wins on conflicts" — that rule only applies if the client can supply query params too. Its absence from the SPEC's `ClientSpec` type block is a prose gap, not intent. The ROADMAP explicitly lists it as one of the seven `createClient()` defaults.

### Affine enforcement
- **D-07:** `Request.consume()` throws `new TypeError("Request has already been consumed and cannot be sent again")` on re-use. Standard built-in, semantically correct (wrong API usage), no custom class needed — this is a programming error, not a recoverable condition.
- **D-08:** Use JS private class field `#consumed = false` (not Symbol, not WeakMap). `consume()` sets it; `send()` is the only caller.

### Merge rules (carried from Phase 1 pitfall warnings)
- **D-09:** Never use `{ ...base, ...override }` to merge headers or query. Spreading `{ accept: undefined }` silently sets `accept: undefined` in the result, violating the "undefined means not specified at this layer" contract. Use an explicit `undefined`-filtering loop.
- **D-10:** Header keys normalized to lowercase (`.toLowerCase()`) in `mergeHeaders()` before comparison and storage.

### types.ts constraints
- **D-11:** `types.ts` must have zero imports — all types it references (e.g., `Headers`, `Response`) are browser/Node globals, not imported. This is the hard dependency-root rule.
- **D-12:** `declare readonly _phantom: T` (not a value field) on `TaggedEntry` — required for `exactOptionalPropertyTypes` compatibility.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behavioral specification
- `docs/SPEC.md` — sole behavioral source of truth; defines `RequestSpec`, `ClientSpec`, `StatusMatcher`, `ResponseMap`, `SendResult`, `TransportError`, `DecodeError`, `BodyPreview`, merge rules, affine rules, and the full `Request.create()` example. Read end-to-end before writing any type.

### Type constraints
- `tsconfig.json` — `strictPropertyTypes`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` all active. Phantom fields must use `declare`.
- `.planning/ROADMAP.md` §Phase 2 — implementation notes with per-file breakdowns, success criteria, and pitfall warnings (P9 header spread, affine bypass).
- `.planning/REQUIREMENTS.md` §TYPES-01–TYPES-08, REQ-01–REQ-04 — full requirement list for this phase.

### Prior phase decisions
- `.planning/phases/01-infrastructure-fixes/01-CONTEXT.md` — D-05 (`.js` extension enforcement), D-01–D-04 (tsconfig), D-09 (verify script).

### Existing source
- `src/shared.ts` — existing `RuntimeTarget`, `OnewayHttpSurface`, `PlaceholderDescription` types. New types in `types.ts` must not conflict with these.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared.ts`: `RuntimeTarget = "browser" | "node"` is already defined and exported. Do not redefine it in `types.ts`; import from `shared.ts` if needed, or keep `RuntimeTarget` in `shared.ts` as a peer.

### Established Patterns
- ESM-only with `.js` extensions on all local imports — `import { ... } from "./shared.js"` (see all existing `src/` files).
- `verbatimModuleSyntax` is active — use `import type` for type-only imports throughout.
- Strict TypeScript mode (`exactOptionalPropertyTypes`) — no optional fields with `| undefined` in the value position; use `declare` for phantom fields.

### Integration Points
- `src/index.ts`, `src/browser.ts`, `src/node.ts` currently export placeholder surface only. Phase 2 adds `types.ts`, `request.ts`, `client.ts` as new files; no changes to existing entrypoints required in this phase.
- Phase 3 (`send.ts`) will import `RequestSpec`, `ClientSpec`, `SendResult`, `TransportError` from `types.ts` — these are the most critical types to get right.

</code_context>

<specifics>
## Specific Ideas

- User confirmed: all phases are being built in sequence with no MVP pressure. Full generic inference now is the right call — reworking types mid-build is the main avoidable cost.
- `ClientSpec.query` gap is a SPEC prose error, not intent. Include it.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Core Types + Request Model*
*Context gathered: 2026-05-04*
