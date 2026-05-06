# 04-01 SUMMARY: Body Producers + Types Foundation

## Status: Complete ✅

## What was built

### src/types.ts
- Added `export declare class Body` opaque type token (private constructor, private `_kind`)
- Added `export type RequestError` — 5-variant discriminated union: `bodySerializationFailed`, `requestConsumed`, `missingBaseUrl`, `duplicateResponseTag`, `invalidSpec`
- Added 5th `SendResult<R>` variant: `{ kind: "requestError"; error: RequestError }`
- Changed `RequestSpecBase.body?: BodyInit` → `RequestSpecBase.body?: Body`
- Zero-imports invariant preserved (TYPES-01)

### src/body.ts (new)
- `BodyInternal` discriminated union: `none | json | text | formUrlEncoded | bytes`
- `toBody()` / `fromBody()` cast helpers using `as unknown as T`
- `buildUrlSearchParams()` — repeated-key support for formUrlEncoded
- `export const Body = { none, json, text, formUrlEncoded, bytes }` factory namespace
- `export function serializeBody(body)` — serialization deferred to call time (D-07); returns `exactOptionalPropertyTypes`-safe `{ init?: BodyInit; contentType?: string }`
- TypeScript 6 fix: `bytes` field typed as `Uint8Array<ArrayBuffer>` (not bare `Uint8Array`) because `BufferSource = ArrayBufferView<ArrayBuffer>` in TS6 DOM lib

### tests/unit/body.test.ts (new)
- 13 tests, BODY-01..05 — all green

### tests/unit/decode.test.ts (new)
- DEC-01..DEC-08 stubs (`it.todo()`) — ready for Plan 04-02

### tests/unit/types.test.ts
- TYPES-02 updated: "four variants" → "five variants" + `requestError` test
- TYPES-09 added: RequestError union 5-variant coverage

## Key decisions
- Import alias: `import type { Body as BodyOpaque }` avoids name collision with `export const Body`
- TS6 `Uint8Array<ArrayBuffer>` required for `BodyInit` compatibility
- `JSON.stringify` left in `serializeBody()` (not `Body.json()`) per D-07; catch belongs in `send.ts`

## Tests
- 13/13 BODY tests green
- 13/13 TYPES tests green
- Full suite still at 70 passing (send.ts `Body` error is expected; fixed in 04-03)
