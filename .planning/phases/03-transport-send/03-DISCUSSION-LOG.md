# Phase 3: Transport + Send - Discussion Log

**Date:** 2026-05-05
**Mode:** --text (plain-text, no interactive prompts)
**Outcome:** All decisions auto-resolved by agent per user directive ("recommend the best option, no MVP shortcuts, avoid rework")

## Areas Presented

### 1. `Client` interface shape
**Options presented:**
1. `createClient()` returns `Client` (SPEC-conformant) with `send()` method closing over spec
2. Standalone `send(request, clientSpec, options)` per ROADMAP plan
3. Both — standalone internal, `Client.send()` delegates

**Decision:** Option (a) — SPEC-conformant. Internal `performSend()` is standalone in `send.ts`; `createClient()` closes over spec to implement `Client.send()`. Circular import resolved by having `performSend()` accept pre-merged effective values from the closure.

**Rationale:** SPEC is the canonical source of truth. The ROADMAP plan described an internal implementation detail, not the public API contract.

---

### 2. Phase 3 response path (stub)
**Options presented:**
1. Always return `unhandledStatus` with body preview — Phase 5 replaces
2. Inject `dispatchResponse` callback stubbed to `unhandledStatus`
3. Skip response path testing in Phase 3

**Decision:** Option (a) — always `unhandledStatus` with body preview.

**Rationale:** Phase 5 slots matching+decode in at the exact point where Phase 3 returns the stub. Additive — not rework. Tests for Phase 3 verify body preview reading and correct transport-error-vs-HTTP-response classification.

---

### 3. Body reading scope
**Options presented:**
1. Full deadline-aware body reading (same error classification as fetch errors)
2. Basic body reading, defer deadline-during-body-read to Phase 6
3. Stub `BodyPreview` until Phase 4

**Decision:** Option (a) — full deadline-aware body reading in Phase 3.

**Rationale:** The `combinedSignal` is already set up in Phase 3. Phase 6 wraps Phase 3's `performSend()` in a retry loop — if body-read deadline classification isn't in Phase 3, Phase 6 must modify Phase 3's code, generating rework. Body reading with the same `try/catch` classification is straightforward given the signal is already present.

---

### 4. Entrypoint wiring
**Options presented:**
1. Update `src/index.ts`, `src/browser.ts`, `src/node.ts` in Phase 3
2. Defer to Phase 8 (Documentation & Polish)

**Decision:** Option (b) — defer to Phase 8.

**Rationale:** Partial exports create confusion and no consumer benefit during construction. Phase 8 wires all entrypoints once the complete API surface exists.

---

## Agent Discretion Items

- `deadlineMs <= 0` validation: throw `RangeError` (SPEC says `requestError.invalidSpec`, but `SendResult` has no such variant per Phase 2). Can be revisited if `requestError` is added later.
- Circular import resolution: `performSend()` accepts pre-merged effective values (headers, query, deadlineMs, fetch, responseMap) from the `createClient()` closure, so `send.ts` never needs to import from `client.ts`.
- `Client` interface lives in `src/client.ts`; `SendOptions` added to `src/types.ts`.

## Deferred Ideas

- `requestError` variant in `SendResult` — not in Phase 3 scope
- Response matching + decode dispatch — Phase 5
- Retry loop — Phase 6
- Entrypoints — Phase 8
