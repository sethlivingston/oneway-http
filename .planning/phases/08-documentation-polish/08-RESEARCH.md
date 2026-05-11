# Phase 8: Documentation & Polish — Research

**Focus:** Reserved tag validation integration (the only area needing investigation before planning)

---

## Reserved Response Tag Validation

### What needs to happen

Add a send-time check that rejects any `TaggedEntry` whose `.tag` value collides with the four
reserved `SendResult` kinds: `"transportError"`, `"decodeError"`, `"unhandledStatus"`, `"requestError"`.

The compile-time protection already exists (`Matcher<R,T>` uses `Exclude<TagsOf<R>, ReservedTags>`
so the type system rejects reserved tags in fully-typed code), but a caller using the
unparameterised `ResponseMap` type at runtime can still pass a reserved tag through.

---

### Type change: `src/types.ts`

Add one variant to `RequestError` (currently 5 variants → becomes 6):

```ts
| { kind: "reservedResponseTag"; tag: string }
```

No imports needed — `types.ts` has zero imports by design.

---

### Runtime check: `src/send.ts`

**Where to place it:** After `request.consume()` (which gives us `spec`) and before body
serialization — following the same early-return guard pattern as `invalidSpec`:

```ts
// ── Reserved tag check (after consume, before body serialization) ──────────
// Runtime guard complementing the compile-time Exclude<TagsOf<R>, ReservedTags> in matcher.ts.
// Cannot import ReservedTags from matcher.ts (violates dependency direction: send.ts → types.ts only).
// Must stay in sync with ReservedTags in src/matcher.ts.
const RESERVED_RESPONSE_TAGS = new Set(["transportError", "decodeError", "unhandledStatus", "requestError"]);

for (const entry of Object.values(spec.responses ?? {})) {
  if (entry !== undefined && RESERVED_RESPONSE_TAGS.has(entry.tag)) {
    clearTimeout(deadlineTimer); // prevent timer leak on early return
    return {
      kind: "requestError",
      error: { kind: "reservedResponseTag", tag: entry.tag } satisfies RequestError,
    };
  }
}
```

**Why not check `clientSpec.responses` too?**
The check should cover both maps. `matchResponse()` consults `spec.responses` first then
`clientSpec.responses`. A reserved tag in either map would be placed into the `kind: "response"`
result, colliding with the fixed `SendResult` discriminants. Add a second loop for `clientSpec.responses`.

**Const placement:** Define `RESERVED_RESPONSE_TAGS` as a module-level const (alongside
`DECODE_ERROR_KINDS`) — not inside `performSend` — so it is not re-allocated per call.

**Return the first collision found** (same as `duplicateResponseTag` intent) — no need to
collect all collisions.

---

### Key caveats

1. **`deadlineTimer` may be undefined** at the point of the check (it is only set if
   `effectiveDeadlineMs !== undefined`). `clearTimeout(undefined)` is a no-op, so the call
   is safe regardless.

2. **`duplicateResponseTag` is defined in `types.ts` but has no runtime implementation**
   (search confirms it is never emitted by any source file). The new `reservedResponseTag`
   variant should NOT share its implementation — they are separate concerns with different
   messages. `duplicateResponseTag` can remain unimplemented for now.

3. **Dependency direction is safe.** `send.ts` already imports from `types.ts`; no new
   import is needed.

4. **TypeScript `satisfies RequestError`** — the pattern is already used for `bodySerializationFailed`
   and `invalidSpec` at lines 167 and 189. Use the same pattern for `reservedResponseTag`.

---

### Test coverage required

- `performSend` returns `{ kind: "requestError", error: { kind: "reservedResponseTag", tag } }`
  when `spec.responses` contains an entry with a reserved tag.
- Same test for `clientSpec.responses`.
- All four reserved tag strings tested (or parameterised test covering all four).
- Non-reserved tags pass through without triggering the check.
- `types.test.ts` `TYPES-09` describe block: update from "five variants" → "six variants",
  add `{ kind: "reservedResponseTag", tag: "transportError" }` to the variants array.

---

## RESEARCH COMPLETE

All other Phase 8 work (TSDoc, README, package.json, scaffolding removal) is fully specified
in CONTEXT.md with no research gaps. Planning can proceed for all plans.
