# Plan 02-01 Summary — Vitest unit discovery, test stubs, src/types.ts

**Completed:** 2026-05-04
**Phase:** 02 — Core Types + Request Model
**Plan:** 01 of 3

## What Was Built

### vitest.config.ts — Unit test discovery
- Added `const unitInclude: string[] = ["tests/unit/**/*.test.ts"]`
- Updated the `node` project's `include` array to spread both `parityInclude` and `unitInclude`
- Browser projects (chromium, firefox, webkit) unchanged — unit tests are pure-logic TypeScript with no browser-specific behavior

### tests/unit/ — Wave 0 test stubs
- `tests/unit/types.test.ts` — 8 describe blocks (one per TYPES-01..08), trivially passing placeholders
- `tests/unit/request.test.ts` — 4 describe blocks (one per REQ-01..04), trivially passing placeholders
- `tests/unit/client.test.ts` — 3 describe blocks (createClient, mergeHeaders, mergeQuery), trivially passing placeholders
- All 11 stub tests pass immediately; Vitest picks up `tests/unit/**` via the new include array

### src/types.ts — All shared types, zero imports
- 15 exported types: `Method`, `QueryValue`, `StatusMatcher`, `Schema<T>`, `DecodeIssue`, `DecodeError`, `BodyPreview`, `TransportError`, `SendResult<R>`, `TaggedEntry`, `ResponseMap`, `InferResponseUnion`, `RetryPolicy`, `RequestSpec`, `ClientSpec`
- Zero import statements — all referenced globals (`Headers`, `URL`, `URLSearchParams`) are ambient browser/Node globals (D-11)
- `SendResult<R>` — 4-variant discriminated union with `kind` discriminant (response, transportError, decodeError, unhandledStatus)
- `TransportError` — 3-variant union (aborted, timeout, network)
- `DecodeError` — 6-variant union (unexpectedBody, emptyBody, invalidJson, schemaMismatch, bodyReadFailed, custom)
- `TaggedEntry<T, Tag>` — uses `readonly _phantom?: T` (optional phantom field)
- `InferResponseUnion<M>` — mapped conditional type producing `{ tag: Tag; body: T }` union from ResponseMap

## Deviations and Decisions

### DEVIATION: `readonly _phantom?: T` instead of `declare readonly _phantom: T`

- **Plan prescribed:** `declare readonly _phantom: T` (D-12)
- **Actual implementation:** `readonly _phantom?: T`
- **Reason:** TypeScript 6.0.3 raises `error TS1070: 'declare' modifier cannot appear on a type member` for both `type` and `interface` declarations. The `declare` modifier is valid only in class bodies and ambient `.d.ts` contexts — not in type aliases or interface member declarations.
- **Impact:** None to functional behavior. The optional `?` field achieves identical phantom-type inference for `InferResponseUnion<M>`: the type parameter `T` is still carried in the type signature; `extends TaggedEntry<infer T, infer Tag>` correctly infers T from the optional field. Object literals (e.g., `{ tag: "ok", _decode: null }`) do not need to provide `_phantom` since it is optional — same as the intended behavior of `declare`.
- **Trade-off:** Unlike `declare`, the optional `_phantom?: T` field can be set at runtime (a consumer could write `_phantom: someValue`). However, since `_phantom` is a library-internal implementation detail (prefixed with `_`), this is acceptable. The phantom inference contract is maintained.

## Verification

```
✓ vitest.config.ts contains unitInclude constant and use in node project
✓ tests/unit/ directory exists with 3 stub files
✓ npx vitest run --project node: 19/19 tests pass (11 stub + 4 parity + 4 existing)
✓ src/types.ts: 0 import statements
✓ src/types.ts: 15 export type declarations
✓ npm run typecheck: exits 0 (no errors)
```
