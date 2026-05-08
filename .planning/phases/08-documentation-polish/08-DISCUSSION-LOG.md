# Phase 8: Documentation & Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 8-Documentation & Polish
**Areas discussed:** TSDoc depth, README style, scaffolding exports, known limitations, Body.formData clarification, backlog 999.1

---

## TSDoc Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Descriptions only | Brief `/** ... */` on everything, no param/returns | |
| Descriptions + @param/@returns | Standard library docs style, no examples | ✓ |
| Full with @example blocks | Verbose, inline examples in IntelliSense | |

**User's choice:** Descriptions + `@param`/`@returns`, no `@example` blocks.
**Notes:** A follow-on phase will add a comprehensive examples suite. TSDoc examples are deferred to that phase.

---

## README Style

| Option | Description | Selected |
|--------|-------------|----------|
| Terse reference | ~150 lines, minimal prose | |
| Middle ground | ~300 lines, concise complete examples | ✓ |
| Tutorial narrative | ~500+ lines, full guide with extensive prose | |

**User's choice:** Middle ground — complete examples but without extensive narrative. A follow-on examples phase will be the primary AI-agent reference.
**Notes:** The "AI-agent usable" goal should be partially satisfied here (inline `SendResult<R>` type shape, complete examples), but the follow-on phase is the real investment.

---

## Scaffolding Exports (`runtimeTarget` + `describe`)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep + document as public API | Add TSDoc, treat as v1 public | |
| Mark @internal | Suppress from IntelliSense but keep in package | |
| Remove from public exports | Clean break; correct for v1 | ✓ |

**User's choice:** Remove — "Your recommendation sounds great."
**Notes:** Neither `runtimeTarget` nor `describe` is in SPEC.md. `describe()` returns `{ implementation: "placeholder" }`. Both are scaffolding artifacts.

---

## Known Limitations Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (just user-facing blockers) | CJS only | ✓ |
| Two roadmap items | CJS + Body.formData() | |
| Full v2 deferred list | CJS + formData + streaming + Retry-After + Valibot | |

**User's choice:** Only CJS not supported. No `Body.formData()` mention — clarified below.
**Notes:** User initially thought `Body.formData()` was accidentally omitted, but SPEC.md §506 explicitly marks multipart as v1 out-of-scope. The user actually wanted `application/x-www-form-urlencoded` (name=value pairs), which is `Body.formUrlEncoded()` — already implemented.

---

## Body.formData() Clarification

**User's concern:** "We definitely need to implement Body.formData(), I'm not sure how that got left out."
**Resolution:** The user described wanting `name=seth&role=foo` submission — this is `Body.formUrlEncoded()`, not multipart. `Body.formUrlEncoded()` is already implemented in `src/body.ts` and in SPEC.md §479–496. `Body.formData()` (multipart) is intentionally v1 out-of-scope per SPEC.md §506.
**Action:** No implementation needed. README should include a `Body.formUrlEncoded()` example to make it discoverable.

---

## Backlog 999.1 — Reserved Tag Validation

**User's choice:** Promote into Phase 8.
**Notes:** `Matcher<R,T>` excludes reserved tags at compile time via `Exclude<TagsOf<R>, ReservedTags>`, but a `send()` call with `tag: "transportError"` in the `responses` map would silently misbehave at runtime. The fix is a new `RequestError` variant `{ kind: "reservedResponseTag"; tag: string }` checked during send-time validation.

---

## the agent's Discretion

- `src/shared.ts` retention: the file may remain as build infrastructure or be deleted along with the export cleanup — planner decides based on whether anything else imports it.
- Order of reserved tag check relative to other `RequestError` checks in `send()`: planner decides based on existing validation flow.

## Deferred Ideas

- `@example` TSDoc blocks — deferred to follow-on examples phase.
- `Body.formData()` multipart — v2, explicitly out-of-scope in SPEC.md §506.
- Streaming, `Retry-After`, Valibot adapter — v2 deferred items, not mentioned in README.
