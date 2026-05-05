# Phase 4: Body Producers + Decoders — Discussion Log

**Date:** 2026-05-05
**Phase:** 04 — Body Producers + Decoders
**Mode:** --text (plain-text interactive)

---

## Areas Discussed

### 1. Decoder calling convention

**Question:** Should decoders receive a pre-normalized `Uint8Array` (normalize-first) or the raw `Response`?

**Options presented:**
- Option A: Normalize first — shared `normalizeBody(response) → Uint8Array`, all decoders receive `Uint8Array`
- Option B: Raw Response — each decoder receives `Response`; internal `readBytes()` helper for normal decoders; `discard()` and `none()` bypass it

**User response:** "We need to do the Right Thing here. Differences between plan 2 and 3 are secondary, let's get it right. If we can avoid memory costs great, but let's not violate our principles to do so."

**Research requested:** User asked to look for prior art and think outside the box. Research subagent consulted undici, ky, reqwest, got, WHATWG Fetch spec, and WHATWG Streams spec.

**Research finding:** Option A is architecturally impossible for a correct `discard()`. `cancel()` lives on `ReadableStream` (reachable only via `response.body`), not on the Body mixin. Pre-buffering permanently loses the ability to cancel. All major HTTP libraries (undici, ky, reqwest) confirm the two-tier pattern: outer decoder receives `Response`, inner `readBytes()` helper provides `Uint8Array` to normal decoders.

**Decision:** Option B with two-tier architecture. See D-01 through D-05 in CONTEXT.md.

---

### 2. Body serialization in `send.ts`

**Question:** After introducing opaque `Body` type, does Phase 4 update `send.ts` and add `requestError` to `SendResult`?

**User response:** "See no. 1, but also let's not create rework. We're not looking to save time here, we're looking to get it right."

**Decision:** Phase 4 updates `send.ts` to consume `serializeBody()` from `body.ts`, and adds `requestError` variant to `SendResult` (starting with `bodySerializationFailed`). Other `requestError` subtypes remain thrown errors until a future phase adopts them. See D-07, D-09.

---

### 3. `BodyPreview` extraction to `src/preview.ts`

**Question:** Phase 3 implemented `readBodyPreview()` in `send.ts`, but the ROADMAP specifies `src/preview.ts`. Should Phase 4 extract it?

**User response:** "Once again the right thing should prevail, despite differences in plan. If it belongs in preview.ts, let's put it there."

**Decision:** Extract to `src/preview.ts` with no behavior changes. See D-11.

---

### 4. `Decode.json()` overload strategy

**Question:** How should the two-signature `json()` / `json(schema)` be declared?

**User response:** "Follow best practices."

**Decision:** Standard TypeScript overloaded function declarations. Duck-typed `Schema<T>` interface. See D-10.

---

### 5. Codifying prior art research as a project practice

**User request:** "Let's codify the value of using the HTTP libraries we used to resolve challenges and see tried and true techniques. I want it to be part of the repo's copilot instructions, the memory too if that makes sense."

**Action:** Created `.github/copilot-instructions.md` with a "Prior Art Reference" section listing undici, ky, reqwest, and got as canonical sources for HTTP body handling decisions. The session decision (D-12) is also recorded in CONTEXT.md.

---

## Deferred Ideas

- Retrofitting `requestConsumed`, `missingBaseUrl`, `duplicateResponseTag`, `invalidSpec` into `SendResult.requestError` — deferred to future phase
- Connection pool keep-alive threshold heuristic for `discard()` — out of scope for v1
