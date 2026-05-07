# Phase 05 Verification

**Status:** COMPLETE
**Date:** 2026-05-06

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| RESP-01 | ✅ | `matchResponse()` in `src/response-matching.ts` implements all 4 steps in order: `requestMap[status]` → `requestMap[classOf(status)]` → `clientMap[status]` → `clientMap[classOf(status)]`. Maps are consulted independently (never pre-merged). Tests in `tests/unit/response-matching.test.ts` verify exact-match, class-match, cross-tier precedence, and null-return cases. |
| RESP-02 | ✅ | `matchResponse()` is a pure function with no I/O, no side effects, no async. It only reads map properties and returns a value or null. Tested in isolation with injected maps. |
| RESP-03 | ✅ | `send.ts` line 188 comment is now `// D-13, D-14: Match status → decode → response | decodeError | unhandledStatus` — the Phase 3 stub comment is gone. Real dispatch implemented: `matchResponse()` called, null path returns `unhandledStatus`, matched path buffers + decodes. |
| RESP-04 | ✅ | `send.ts` lines 215–238: `const syntheticResponse = new Response(bytes)` then `decoded = await match.decode.fn(syntheticResponse)`. Decode exceptions caught and wrapped as `decodeError`. Decoder returning a `DecodeError` value also wrapped via `isDecodeError()` guard. |
| PREV-01 | ✅ | `unhandledStatus` path (`match === null`) calls `readBodyPreview(response, maxBytes)` (send.ts line 193) — stream NOT yet consumed at that point. Preview included in result (lines 194–200). |
| PREV-02 | ✅ | `decodeError` path calls `previewFromBytes(bytes, maxBytes)` (send.ts lines 220, 231) — bytes already buffered by `readBytes()`. Preview included in both exception-catch and decode-error-value paths. |
| PREV-03 | ✅ | `previewFromBytes` exists in `src/preview.ts` (lines 88–101). Uses `new TextDecoder("utf-8", { fatal: false })` at line 95. Slice + decode logic confirmed. |

## Decisions Coverage

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 | ✅ | `DecoderLike` interface exported from `types.ts` (lines 78–80): `interface DecoderLike { fn(response: Response): Promise<unknown>; }`. `TaggedEntry.decode: DecoderLike` at line 85. |
| D-02 | ✅ | `InferResponseUnion<M>` shape unchanged in `types.ts` (lines 90–94): maps tag+body union over `ResponseMap` keys. |
| D-03 | ✅ | `previewFromBytes` implemented in `src/preview.ts` (lines 88–101). |
| D-04 | ✅ | `matchResponse` is pure; accepts two separate map params (`requestMap`, `clientMap`); consults them in sequence without merging. |
| D-05 | ✅ | `unhandledStatus` path uses `readBodyPreview` (`send.ts` line 193), not `readBytes`. Stream is not yet consumed when this path is taken. |
| D-06 | ✅ | Decode errors duck-typed via `isDecodeError()` which checks `DECODE_ERROR_KINDS` set (lines 86–99). Decode exceptions caught in try/catch (lines 217–228). |
| D-07 | ✅ | Happy path returns `{ tag: match.tag, body: decoded } as unknown as R` (send.ts line 247). |
| D-08 | ✅ | `readBytes` exported from `decode.ts` (line 19: `export async function readBytes`). Imported in `send.ts` line 18. |

## Test Results

```
> @sethlivingston/oneway-http@0.1.5 verify
> npm run typecheck && npm run lint && npm run test

✓ typecheck — no errors
✓ lint — no errors

Test Files  11 passed (11)
     Tests  131 passed | 3 skipped | 1 todo (135)
  Start at  18:08:15
  Duration  4.32s (transform 714ms, setup 0ms, import 1.94s, tests 293ms, environment 1ms)
```

Key test suites contributing to Phase 5 verification:
- `tests/unit/response-matching.test.ts` — 7 tests: exact/class/precedence/null cases for `matchResponse()`
- `tests/unit/send.test.ts` — 36 tests including SEND-06 (decode dispatch), SEND-09 (body preview), SEND-10 (full dispatch integration: happy path, unhandledStatus, throwing decoder, decode error with preview)

## Issues Found

None.
