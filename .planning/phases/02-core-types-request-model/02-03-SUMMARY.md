# Plan 02-03 Summary — Real client assertions + src/client.ts

**Completed:** 2026-05-04
**Phase:** 02 — Core Types + Request Model
**Plan:** 03 of 3

## What Was Built

### tests/unit/client.test.ts — Real behavioral assertions
- **createClient()**: Returns `baseUrl`, `deadlineMs`, `headers`, `query` from spec (shallow copy)
- **mergeHeaders()**: Override wins on conflict; `undefined` override does NOT erase base (D-09); keys normalized to lowercase (D-10); handles `undefined` base/override gracefully; case-insensitive dedup (`Content-Type` + `content-type` → single `content-type` key)
- **mergeQuery()**: Override wins on conflict; `undefined` override does NOT erase base (D-09); handles `undefined` base/override gracefully; array values preserved

### src/client.ts — createClient + mergeHeaders + mergeQuery
- `mergeHeaders(base, override)`: Two explicit `for...of` loops over `Object.entries()`. Each loop lowercases the key and skips `undefined` values. Base loop runs first, override loop runs second — last writer wins for defined values.
- `mergeQuery(base, override)`: Same loop pattern, no key lowercasing (query keys are case-sensitive per URL spec).
- `createClient(spec)`: Returns `{ ...spec }` — shallow copy of the `ClientSpec`. Merge semantics are applied at `send()` time in Phase 3.
- Named exports only: `createClient`, `mergeHeaders`, `mergeQuery`. No default export.
- Imports: `import type { ClientSpec, QueryValue }` with `.js` extension from `./types.js`

## Key Design Decisions

### D-09: No spread for merge — explicit undefined-filtering loops
The `{ ...base, ...override }` pattern spreads `undefined` values from `override` into the result, which under `exactOptionalPropertyTypes` violates the "undefined means not specified at this layer" contract. Using explicit `Object.entries()` loops with `if (value !== undefined) continue` ensures that an absent or `undefined` value in the override layer does not erase a valid base value. This is the most critical correctness guarantee in the request model.

### D-10: Header keys lowercased
HTTP header names are case-insensitive. Both base and override keys are lowercased via `.toLowerCase()` before writing into the result. This means `"Content-Type"` and `"content-type"` produce the same result key `"content-type"`. If base provides `"Content-Type"` and override provides `"content-type"`, the override wins because its loop runs second — there is only one result key.

### Query keys not lowercased
URL query parameter names are case-sensitive per the URL spec. `mergeQuery` does not apply `.toLowerCase()` to keys.

## Verification

```
✓ grep -c 'placeholder' tests/unit/client.test.ts → 0
✓ grep -c 'from.*src/client.js' tests/unit/client.test.ts → 1
✓ grep -c 'createClient, mergeHeaders, mergeQuery' tests/unit/client.test.ts → 1
✓ grep -c 'does NOT erase' tests/unit/client.test.ts → 2 (headers + query)
✓ 3 top-level describe blocks
✓ export function createClient in src/client.ts
✓ export function mergeHeaders in src/client.ts
✓ export function mergeQuery in src/client.ts
✓ No default export
✓ import type with .js extension
✓ npm run typecheck exits 0
✓ npx vitest run --project node tests/unit/client.test.ts → 12/12 pass (GREEN)
✓ npx vitest run --project node → 39/39 pass (no regression)
```
