---
phase: 04-body-producers-decoders
verified: 2026-05-11T19:12:30Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
---

# Phase 4: Body Producers + Decoders — Verification Report

**Phase Goal:** Implement the Body producer namespace (Body.none/json/text/formUrlEncoded/bytes), the Decoder class and Decode decoder namespace (Decode.none/discard/text/json/bytes/optional), extract readBodyPreview into src/preview.ts, wire body serialization into performSend(), and add the requestError variant to SendResult<R>.
**Verified:** 2026-05-11T19:12:30Z
**Status:** ✅ PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                               | Status     | Evidence                                                                                                                                                         |
|----|---------------------------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | `Body.none/json/text/formUrlEncoded/bytes` all produce opaque Body tokens                                          | ✓ VERIFIED | `grep 'export const Body' src/body.ts` → present; 5 factory methods confirmed; opaque cast via `toBody()`/`fromBody()` using `as unknown as BodyOpaque`          |
| 2  | `Decode` namespace exports `none/discard/text/json/bytes/optional` — all return `Decoder<T>` instances             | ✓ VERIFIED | `grep 'export const Decode' src/decode.ts` → present; `grep 'export class Decoder' src/decode.ts` → present; all 6 factories present                            |
| 3  | `Decode.none()` returns `decodeError.unexpectedBody` for any non-empty body                                        | ✓ VERIFIED | `grep 'unexpectedBody' src/decode.ts` → present in none() implementation; DEC-01 tests (peek-one-chunk strategy) pass                                            |
| 4  | `Decode.json(schema)` normalizes validation errors without `instanceof ZodError`                                   | ✓ VERIFIED | `grep 'normalizeSchemaError' src/decode.ts` → present; duck-types `.issues` array; `grep 'instanceof' src/decode.ts` → only error.message coercions, no ZodError check; DEC-05 tests pass |
| 5  | `readBytes()` normalizes null body and empty stream to zero bytes (DEC-08)                                         | ✓ VERIFIED | `grep 'body === null' src/decode.ts` → null-body guard at line 35 returns `new Uint8Array(0)`; DEC-08 tests pass                                                 |
| 6  | `src/preview.ts` exports `readBodyPreview` (extracted from send.ts)                                                | ✓ VERIFIED | `grep 'export async function readBodyPreview' src/preview.ts` → present; `grep 'async function readBodyPreview' src/send.ts` → 0 (removed from send.ts); peek-read truncation detection present in preview.ts |
| 7  | `Body` is exported from `index.ts`; `serializeBody` is NOT exported                                               | ✓ VERIFIED | `grep 'export { Body }' src/index.ts` → present; `grep 'serializeBody' src/index.ts` → 0                                                                        |
| 8  | `npm run verify` exits 0 with 180 tests passing                                                                    | ✓ VERIFIED | `Test Files 13 passed (13) / Tests 180 passed | 3 skipped | 1 todo (184)`                                                                                      |

**Score:** 8/8 truths verified

---

## Requirements Coverage

| Req     | Status | Evidence |
|---------|--------|----------|
| BODY-01 | ✅     | `Body.none()` in `src/body.ts`: `return toBody({ kind: "none" })` → no request body. `grep '"none"' src/body.ts` → present. tests/unit/body.test.ts BODY-01 test passes. |
| BODY-02 | ✅     | `Body.json(value)` in `src/body.ts`: stores `{ kind: "json", value }` opaquely; `serializeBody()` calls `JSON.stringify(value)` and returns `{ init: utf8bytes, contentType: "application/json" }`. TS6 fix: `Uint8Array<ArrayBuffer>` used for BodyInit compatibility. tests/unit/body.test.ts BODY-02 test passes. |
| BODY-03 | ✅     | `Body.text(value, contentType?)` in `src/body.ts`: defaults to `"text/plain; charset=utf-8"` when contentType omitted. `grep '"text/plain' src/body.ts` → present. tests/unit/body.test.ts BODY-03 test passes. |
| BODY-04 | ✅     | `Body.formUrlEncoded(entries)` in `src/body.ts`: `buildUrlSearchParams(entries)` — `URLSearchParams` with repeated-key support for arrays. `grep 'URLSearchParams' src/body.ts` → present. `grep 'buildUrlSearchParams' src/body.ts` → present. Content-type: `application/x-www-form-urlencoded`. tests/unit/body.test.ts BODY-04 test passes. |
| BODY-05 | ✅     | `Body.bytes(bytes, contentType?)` in `src/body.ts`: raw binary passthrough with caller-supplied content-type. `grep '"bytes"' src/body.ts` → present. tests/unit/body.test.ts BODY-05 test passes. |
| DEC-01  | ✅     | `Decode.none()` in `src/decode.ts`: reads exactly one chunk via `reader.read()`. If `done: true` → success (void). If `done: false` → `reader.cancel()` + return `{ kind: "unexpectedBody" }`. `grep 'unexpectedBody' src/decode.ts` → present. `grep 'reader.cancel' src/decode.ts` → present. tests/unit/decode.test.ts DEC-01 tests pass. |
| DEC-02  | ✅     | `Decode.discard()` in `src/decode.ts`: `response.body?.cancel().catch(() => {})` — no reader allocated, no byte buffering. Optional chaining handles null body. `grep 'body?.cancel' src/decode.ts` → present at line 154. tests/unit/decode.test.ts DEC-02 test passes. |
| DEC-03  | ✅     | `Decode.text()` in `src/decode.ts`: calls `readBytes(response)` then `new TextDecoder("utf-8").decode(bytes)`. Empty body → `""` (readBytes returns zero-length array). `grep 'TextDecoder' src/decode.ts` → present. tests/unit/decode.test.ts DEC-03 tests pass. |
| DEC-04  | ✅     | `Decode.json()` in `src/decode.ts` (no schema): reads bytes, empty → `{ kind: "emptyBody" }`, parse via `JSON.parse()`, parse failure → `{ kind: "invalidJson", message }`. `grep 'emptyBody\|invalidJson' src/decode.ts` → both present. tests/unit/decode.test.ts DEC-04 tests pass. |
| DEC-05  | ✅     | `Decode.json(schema)` in `src/decode.ts`: passes parsed JSON to `schema.safeParse()`; on failure normalizes via `normalizeSchemaError()` duck-typing `.issues` array — `typeof error === "object" && "issues" in error && Array.isArray(...)` (line 70). NEVER `instanceof ZodError`. `grep 'schemaMismatch' src/decode.ts` → present. `grep 'instanceof ZodError' src/decode.ts` → 0. tests/unit/decode.test.ts DEC-05 tests pass. |
| DEC-06  | ✅     | `Decode.bytes()` in `src/decode.ts`: returns `await readBytes(response)` directly as `Uint8Array<ArrayBuffer>`. `grep '"bytes"' src/decode.ts` → present in Decode namespace. tests/unit/decode.test.ts DEC-06 test passes. |
| DEC-07  | ✅     | `Decode.optional(inner)` in `src/decode.ts`: reads all bytes first; zero bytes → `undefined`; non-zero → creates `new Response(bytes)` and delegates to `inner.fn(syntheticResponse)`. `grep 'new Response' src/decode.ts` → present at line 201. tests/unit/decode.test.ts DEC-07 tests pass. |
| DEC-08  | ✅     | `readBytes()` in `src/decode.ts`: `if (response.body === null) return new Uint8Array(0)` at line 35 — null-body fast path. For non-null bodies, empty ReadableStream (e.g., 200 + Content-Length: 0) produces zero-length Uint8Array naturally. `grep 'body === null' src/decode.ts` → present. Both null-body (204/304/205) and empty-stream paths produce zero bytes before any decoder runs. tests/unit/decode.test.ts DEC-08 tests pass. |

**Score:** 13/13 requirements verified

---

## Phase 4 Type Additions

Phase 4 also extended `src/types.ts` with:
- `export declare class Body` — opaque class type token (private constructor, private `_kind`) — enables typed `Body` values without exposing internals
- `export type RequestError` — 5-variant discriminated union added to types.ts (`bodySerializationFailed | requestConsumed | missingBaseUrl | duplicateResponseTag | invalidSpec`)
- `SendResult<R>` extended from 4 to **5 variants**: `{ kind: "requestError"; error: RequestError }` added as the 5th SendResult variant
- These are documented because they affect the overall type surface and the TYPES-02 requirement (which originally stated 4 variants but was superseded by Phase 4)

---

## Decisions Coverage

| Decision | Status | Evidence |
|----------|--------|----------|
| D-07 (body serialization deferred) | ✅ | `JSON.stringify` in `serializeBody()` (not in `Body.json()`); catch belongs in `send.ts`. `grep 'JSON.stringify' src/body.ts` → in serializeBody; NOT in Body.json factory. |
| D-03 (discard via cancel) | ✅ | `response.body?.cancel()` — no reader, no allocation. `grep 'body?.cancel' src/decode.ts` → present at line 154. |
| D-04 (none peeks exactly one chunk) | ✅ | `reader.read()` called once; `done` check; cancel on non-empty. |
| D-05 (optional via synthetic Response) | ✅ | `new Response(bytes)` forwarded to inner decoder; reads all bytes first. `grep 'new Response' src/decode.ts` → present. |
| D-10 (normalizeSchemaError duck-types) | ✅ | `typeof error === "object" && "issues" in error && Array.isArray(...)` pattern at line 70. `grep 'issues' src/decode.ts` → present. |
| D-11 (preview extracted) | ✅ | `src/preview.ts` created; `readBodyPreview` removed from send.ts. `grep 'async function readBodyPreview' src/send.ts` → 0. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/send.ts` | `src/body.ts` | `import { serializeBody }` | ✓ WIRED | `grep 'import.*serializeBody' src/send.ts` → present; body serialized before fetchInit |
| `src/send.ts` | `src/preview.ts` | `import { readBodyPreview }` | ✓ WIRED | `grep 'import.*readBodyPreview' src/send.ts` → present at line 17 |
| `src/decode.ts readBytes` | null-body fast path | `if (response.body === null) return new Uint8Array(0)` | ✓ WIRED | Critical for DEC-08; prevents hang on 204/304 |
| `src/index.ts` | `src/body.ts`, `src/decode.ts` | `export { Body } from "./body.js"; export { Decoder, Decode } from "./decode.js"` | ✓ WIRED | Public API surface complete; `grep 'export.*Body\|export.*Decode' src/index.ts` → both present |

---

## Test Results

```
Test Files  13 passed (13)
     Tests  180 passed | 3 skipped | 1 todo (184)
  Start at  [phase 4 completion]
  Duration  ~3s
```

Key suites contributing to Phase 4 verification:
- `tests/unit/body.test.ts` — 13 tests (BODY-01..05), all pass
- `tests/unit/decode.test.ts` — 24 tests | 1 todo (DEC-01..08), all assertions pass
- `tests/unit/types.test.ts` — 13 tests including TYPES-09 (RequestError 5-variant), all pass

---

## Issues Found

None. Phase 4 implementation is complete and correct. The `Body` type export collision (TS2300) was resolved by exporting only the value `Body` from `index.ts` (consumers get the type through inference); this is documented in 04-04-SUMMARY.md as an intentional decision, not a defect.

---

## Summary

Phase 4 Body Producers + Decoders is fully implemented and verified. The `Body` namespace provides 5 opaque producer factories with serialization deferred to send time. The `Decode` namespace provides 7 decoder factories including the critical `none()` peek-one-chunk strategy, `discard()` via direct cancel, and `json(schema)` with Zod-independent error normalization. `readBodyPreview()` was extracted to `src/preview.ts` with peek-read truncation detection. Body serialization errors are caught in `send.ts` and returned as `requestError.bodySerializationFailed`. Phase 4 also extended `SendResult<R>` to 5 variants by adding `requestError` as the 5th SendResult variant.

---

_Verified: 2026-05-11T19:12:30Z_
_Verifier: gsd-verifier (agent)_
