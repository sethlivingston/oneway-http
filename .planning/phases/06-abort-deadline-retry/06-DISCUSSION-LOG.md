# Phase 6: Abort, Deadline & Retry — Discussion Log

**Date:** 2026-05-07
**Mode:** --text (plain-text, no interactive TUI)
**Areas discussed:** 2 of 3 identified

---

## Gray Areas Identified

1. `RetryPolicy` type shape — SPEC defines `true | false | RetryOptions` union; `types.ts` had interface only
2. Retry lifecycle architecture — status-first (SPEC) vs result-based (ROADMAP description)
3. File placement for retry utilities — not selected; delegated to agent's discretion

---

## Area 1: `RetryPolicy` type shape

**Question:** Should Phase 6 match the SPEC names exactly (`RetryOptions` + `RetryPolicy = true | false | RetryOptions`) or keep the existing name for the object form?

**User response:** "I'm fine with you making the call here. Note that we want it to be right more than we want it to match the spec."

**User follow-up:** Asked what `initialDelayMs`/`maxDelayMs` mean — concerned they sounded like per-attempt timeouts.

**Clarification provided:** These are backoff *sleep* durations between retry attempts, not per-attempt timeouts. `initialDelayMs: 200` = sleep ~200ms before the first retry; `maxDelayMs: 10_000` = cap on the exponential growth. `deadlineMs` is what bounds total execution time.

**Decision (agent):**
- Rename `interface RetryPolicy` → `interface RetryOptions` (object form)
- Define `export type RetryPolicy = true | false | RetryOptions`
- Replace `backoffMs: { initial, max }` with flat `initialDelayMs` + `maxDelayMs`
- `backoffMs` field dropped (never shipped, no migration concern)
- Rationale: SPEC names are correct and semantically clear; `true`/`false` branches are semantically distinct from `undefined`

---

## Area 2: Retry lifecycle architecture

**Question:** SPEC says status-first (check raw status before matchResponse/decode). ROADMAP describes `shouldRetry(result)` post-classification. Which drives implementation?

**Structural question:** Extract `fetchOnce()` helper or inline both phases in the loop?

**User response:** "You decide" (on the fetchOnce question)

**Decisions:**
- Status-first architecture (SPEC §448–450) — retry checks raw HTTP status before matchResponse/decode; body is cancelled cheaply on retryable attempts; decode only runs on the final attempt
- Inline both phases — no `fetchOnce()` extraction; it would only be called from one place with no reuse value

---

## Deferred Ideas

- `Retry-After` header awareness — already deferred to v2 in STATE.md
- File placement for retry utilities (sleepWithAbort, jitterDelay, etc.) — agent's discretion

---

*Phase: 06-abort-deadline-retry*
*Log written: 2026-05-07*
