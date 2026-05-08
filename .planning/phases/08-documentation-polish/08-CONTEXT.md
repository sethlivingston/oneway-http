# Phase 8: Documentation & Polish - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Write TSDoc on all public symbols; write a medium-length README with concise, complete working examples; finalize Zod as an optional peer dependency in `package.json`; remove scaffolding exports (`runtimeTarget`, `describe`) that are not in SPEC.md; add send-time reserved tag validation (promoted from backlog 999.1).

**In scope:**
- TSDoc on all public exports: `Request`, `Request.create()`, `createClient()`, `send()`, all `Body.*`, all `Decode.*`, `Send.match()`, all types in `types.ts`; mark `Request.consume()` as `@internal`
- README: sections covering ESM install, quick-start, `SendResult<R>` inline type shape, `Send.match()` exhaustive handler, retry policy, Zod decoder, known limitations
- `package.json`: add `peerDependencies: { "zod": "^3.25.0" }` + `peerDependenciesMeta: { "zod": { "optional": true } }`; verify `engines.node: ">=24.0.0"` is present
- Remove `runtimeTarget` and `describe` from `src/index.ts` public exports (scaffolding artifacts not in SPEC.md)
- Send-time reserved tag validation: reject response tag names that collide with `"transportError"`, `"decodeError"`, `"unhandledStatus"`, `"requestError"`; surface as new `RequestError` variant `{ kind: "reservedResponseTag"; tag: string }` in `src/types.ts`

**Not in scope:**
- Comprehensive examples suite / AI-agent reference (follow-on phase)
- `Body.formData()` multipart — v1 out-of-scope per SPEC.md §506 (note: `Body.formUrlEncoded()` handles `name=value&name2=value2` submissions and is already implemented)
- Streaming, `Retry-After`, Valibot adapter — v2 deferred items

</domain>

<decisions>
## Implementation Decisions

### TSDoc Depth
- **D-01:** Add `/** Brief description. */` to all exported types and interfaces. Add `@param` and `@returns` tags to all exported functions. No `@example` blocks in TSDoc — examples live in the README and the upcoming examples phase.
- **D-02:** Mark `Request.consume()` as `@internal` to suppress it from IntelliSense autocomplete. `Decoder<T>.fn` is already `@internal`; keep it.

### README Style
- **D-03:** Medium-length README (~300 lines). Sections per ROADMAP plan: ESM-only declaration + install; quick-start (mirrors SPEC.md introductory example); `SendResult<R>` inline type definition (full union shown, not just prose); `Send.match()` exhaustive handler example; retry policy config example; Zod schema decoder example (`Decode.json(schema)` with type inference shown); known limitations.
- **D-04:** Examples must be complete (not partial snippets) but without extensive narrative prose. A follow-on phase will add comprehensive examples/tests that serve as the primary AI-agent reference.
- **D-05:** Known limitations section covers only: CJS not supported (ESM-only). No mention of `Body.formData()` — multipart is intentionally out-of-scope for v1 and `Body.formUrlEncoded()` handles the common URL-encoded form case.

### Scaffolding Cleanup
- **D-06:** Remove `runtimeTarget` and `describe` from `src/index.ts`. Neither is in SPEC.md; `describe()` returns `{ implementation: "placeholder" }` — a clear scaffolding artifact. `src/shared.ts` may remain as internal build infrastructure or be removed; it must not be re-exported.

### Reserved Tag Validation (from backlog 999.1)
- **D-07:** Add a new `RequestError` variant: `{ kind: "reservedResponseTag"; tag: string }`. Extend send-time request validation in `send()` to check every key in `responses` against the four reserved kinds; return `{ kind: "requestError", error: { kind: "reservedResponseTag", tag } }` on the first collision found. Use a new variant (not extending `duplicateResponseTag`) for clearer error messages.
- **D-08:** The four reserved tag strings to check are: `"transportError"`, `"decodeError"`, `"unhandledStatus"`, `"requestError"`. Source of truth: `src/matcher.ts` `ReservedTags` type.

### Folded Todos
- **999.1 — Reserved tag validation** (backlog): Promoted into Phase 8 scope. Reject response tag names colliding with `SendResult` reserved kinds at send-time. `Matcher<R,T>` already excludes reserved tags at compile time (via `Exclude<TagsOf<R>, ReservedTags>`), but runtime validation was missing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behavioral Spec
- `docs/SPEC.md` — Source of truth for all public API behavior. §479–496: `Body.*` producers including `Body.formUrlEncoded`. §506: multipart explicitly v1 out-of-scope. §337: `RequestError` variants (new `reservedResponseTag` variant extends this list).

### Requirements
- `.planning/REQUIREMENTS.md` — DOC-01, DOC-02, DOC-03 are the three requirements for this phase.
- `.planning/ROADMAP.md` §Phase 8 — Plans, success criteria, implementation notes, pitfall warnings. Read in full before planning.

### Prior Phase Decisions
- `.planning/phases/07-typed-matcher/07-CONTEXT.md` — `Matcher<R,T>` shape (5 fixed keys), `ReservedTags` type location, `Send` const export pattern.
- `.planning/STATE.md` — Carries forward: zero runtime deps; namespace keyword banned; `module: Preserve` tsconfig.

### Existing Implementation
- `src/types.ts` — All shared types; `RequestError` union to extend with `reservedResponseTag`.
- `src/matcher.ts` — `ReservedTags` type (canonical list of reserved tag strings).
- `src/send.ts` — Location for new reserved tag validation logic.
- `src/body.ts` — All `Body.*` producers including `Body.formUrlEncoded`; all need TSDoc.
- `src/decode.ts` — All `Decode.*` decoders; all need TSDoc.
- `src/index.ts` — Public export surface; `runtimeTarget` and `describe` to be removed.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/body.ts`: `Body.formUrlEncoded()` already implemented (kind: `formUrlEncoded`, serializes to `application/x-www-form-urlencoded`). Needs TSDoc only.
- `src/matcher.ts`: `ReservedTags = "transportError" | "decodeError" | "unhandledStatus" | "requestError"` — use this as the source of truth for the reserved tag validation set.
- `src/types.ts`: `RequestError` union — add `{ kind: "reservedResponseTag"; tag: string }` as a new variant.

### Established Patterns
- `@internal` TSDoc tag: already used on `Decoder<T>.fn` (`src/decode.ts:9`). Apply same pattern to `Request.consume()`.
- `RequestError` early-return pattern: existing variants in `send()` return `{ kind: "requestError", error: { kind: "..." } }`. The new reserved tag check follows the same pattern.
- Zero imports rule: `src/types.ts` has zero imports — adding a new `RequestError` variant requires no new imports.

### Integration Points
- New `reservedResponseTag` variant: `src/types.ts` (type definition) → `src/send.ts` (validation logic) → consumer code (error handling). No changes to `src/matcher.ts` needed.
- Scaffolding removal: deleting `runtimeTarget` and `describe` from `src/index.ts` is a breaking change — confirm no tests import these before removal (check `tests/` and `packages/`).

</code_context>

<specifics>
## Specific Ideas

- **`Body.formUrlEncoded()` clarification:** The user asked about `name=seth&role=foo` style form submission — confirmed this is `Body.formUrlEncoded({ name: "seth", role: "foo" })`, already implemented. The README quick-start or a body section should include this as an example to make it discoverable.
- **README "AI-agent usable":** Include the full `SendResult<R>` discriminated union type definition inline in the README (not just prose about it) so an AI agent reading only the README can understand the full result shape without reading source.
- **Follow-on examples phase:** The user confirmed a separate phase will add comprehensive working examples/tests as the primary AI-agent reference. README examples are intentionally concise.

</specifics>

<deferred>
## Deferred Ideas

- `Body.formData()` multipart/form-data — explicitly v1 out-of-scope per SPEC.md §506. File uploads and multipart are v2.
- Streaming request/response bodies — v2 (retry semantics require spec extension).
- `Retry-After` header awareness — v2.
- Valibot schema adapter — v2 (seam maintained via `Schema<T>` duck-type interface).
- `@example` TSDoc blocks — deferred to follow-on examples phase. TSDoc in this phase covers descriptions + @param/@returns only.

</deferred>

---

*Phase: 8-Documentation & Polish*
*Context gathered: 2026-05-08*
