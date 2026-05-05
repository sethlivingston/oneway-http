# Phase 2: Core Types + Request Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 2-Core Types + Request Model
**Areas discussed:** ResponseMap / TaggedEntry design, RetryPolicy type shape, ClientSpec.query, Affine violation error

---

## ResponseMap / TaggedEntry design

| Option | Description | Selected |
|--------|-------------|----------|
| A — Full generic inference | `TaggedEntry<T, Tag>` with phantom + opaque decode slot; `Request<R>` infers R from ResponseMap at create() time | ✓ |
| B — Tag-only generics | Tag literal carried, decoded type T deferred to Phase 4 | |
| C — Fully opaque | Simplest now; caller provides R explicitly | |

**User's choice:** "You decide" — user provided guidelines: all phases built in sequence, no MVP pressure, defer only for phase size or likely-to-change concerns.
**Notes:** Agent selected Option A. Rationale: reworking types mid-build is the main avoidable cost; since Phase 4 (Decode) and Phase 7 (Matcher) are both happening, full inference from day one is correct. The opaque `_decode: unknown` slot keeps `types.ts` import-free while Phase 4 fills in the runtime decoder.

---

## RetryPolicy type shape

| Option | Description | Selected |
|--------|-------------|----------|
| Concrete now | Define fields based on SPEC semantics (methods, maxAttempts, retryableStatuses, backoffMs) | ✓ |
| Opaque until Phase 6 | `type RetryPolicy = unknown` or deferred | |

**User's choice:** Deferred to agent.
**Notes:** Agent defined concretely. All phases are building in sequence; minor field adjustments are acceptable in Phase 6 if the implementation requires them.

---

## ClientSpec.query

| Option | Description | Selected |
|--------|-------------|----------|
| Include query in ClientSpec | Aligns with ROADMAP implementation notes and SPEC merge table | ✓ |
| Omit (follow SPEC type block literally) | ClientSpec has no query field per SPEC prose | |

**User's choice:** Deferred to agent.
**Notes:** Agent included `query`. The SPEC merge table lists `query: Merge by key; request wins on conflicts` — that rule only applies if the client can supply query params. Absence from the `ClientSpec` type block is a prose gap, not intent. ROADMAP explicitly lists it.

---

## Affine violation error

| Option | Description | Selected |
|--------|-------------|----------|
| `TypeError` with message | Standard built-in, semantically correct, no custom class | ✓ |
| Custom `RequestConsumedError` | Typed, catchable by name — but overkill for a programming error | |
| Plain `Error` | Simple but less semantically precise | |

**User's choice:** Deferred to agent.
**Notes:** Agent chose `TypeError`. This is a programming mistake, not a recoverable condition. The caller won't normally catch it; `TypeError` has a `.name` of `"TypeError"` for basic inspection if ever needed.

---

## the agent's Discretion

All four areas were decided by the agent based on user-provided guidelines: build all phases in sequence, no MVP pressure, defer only for phase size or likely-to-change concerns.

## Deferred Ideas

None — discussion stayed within phase scope.
