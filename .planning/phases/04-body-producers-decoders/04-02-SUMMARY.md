# 04-02 SUMMARY: Decode Namespace + Decoder Class

## Status: Complete ✅

## What was built

### src/decode.ts (new)
- `type DecoderFn<T>` — internal fn signature
- `export class Decoder<T>` — wraps fn, exposes `.as<Tag>(tag)` for tagged entries
- `async function readBytes(response)` — null-body guard + try/finally cancel + for...of Uint8Array assembly
- `function normalizeSchemaError(error)` — duck-types `.issues` (D-10, never instanceof ZodError)
- `function jsonDecoder()` + overload `jsonDecoder<T>(schema)` — handles emptyBody, invalidJson, schemaMismatch
- `export const Decode = { none, discard, text, json, bytes, optional }` — complete namespace

### tests/unit/decode.test.ts (updated from stubs)
- DEC-01..DEC-08: 24 tests (23 passing, 1 static todo for getReader guard)
- All behavioral assertions pass

## Key decisions

### D-03: discard() uses `response.body?.cancel()` directly
No reader, no allocation. Optional chaining propagates through the full chain:
`response.body?.cancel().catch(() => {})` → no-op when body is null ✓

### D-04: none() peeks exactly one chunk
Only reads one chunk via `reader.read()`. If `done: true` → void. If `done: false` → cancel + unexpectedBody.
`new Response("")` correctly gives `{done: true}` on first read (empty ReadableStream).

### D-05: optional() uses synthetic `new Response(bytes)` forwarding
Reads all bytes first, then forwards to inner decoder via fresh synthetic Response.

### D-10: normalizeSchemaError duck-types `.issues`
`typeof error === "object" && "issues" in error && Array.isArray(...)` — works across Zod versions/boundaries.
Non-Zod errors fall back to `[{ path: [], message: error.message }]`.

### TS6: Uint8Array<ArrayBuffer>
`BufferSource = ArrayBufferView<ArrayBuffer>` in TS6 lib.dom.d.ts — bare `Uint8Array` (which defaults to `Uint8Array<ArrayBufferLike>`) is NOT assignable. All byte types use explicit `Uint8Array<ArrayBuffer>`.

## Verification
- `grep -c "export class Decoder" src/decode.ts` → 1 ✓
- `grep -c "export const Decode" src/decode.ts` → 1 ✓
- `grep -c "normalizeSchemaError" src/decode.ts` → 2 (definition + call site) ✓
- `grep -c "\.issues" src/decode.ts` → 2 (duck-type check + access) ✓
- `vitest run --project node` → 108 tests passing ✓
- `npx tsc --noEmit` → 1 expected error only (send.ts:219 — fixed in 04-03) ✓
