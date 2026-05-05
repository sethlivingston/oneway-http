# Plan 02-02 Summary — Real type assertions + src/request.ts

**Completed:** 2026-05-04
**Phase:** 02 — Core Types + Request Model
**Plan:** 02 of 3

## What Was Built

### tests/unit/types.test.ts — Real type-level assertions
- TYPES-01: Static (grep-verified); no runtime assertion needed
- TYPES-02: All four `SendResult<R>` variants assigned to typed variables — compile error if any variant shape is wrong
- TYPES-03: All three `TransportError` variants assigned
- TYPES-04: All six `DecodeError` variants collected into `DecodeError[]`
- TYPES-05: `DecodeIssue` with optional `code` field
- TYPES-06: `BodyPreview` shape
- TYPES-07: `ResponseMap` with numeric (200) and class ("4xx") keys
- TYPES-08: `Schema<T>` satisfied by a plain duck-typed object

### tests/unit/request.test.ts — Real behavioral assertions
- REQ-01: `Request.create().consume()` stores method, responses, path, headers
- REQ-02: `buildPath` segment encoding (space → `%20`, slash → `%2F`, ampersand → `%26`, numbers stringified, empty → `""`)
- REQ-03: `buildQuery` query construction (undefined omitted, scalars stringified, arrays repeated)
- REQ-04: Affine enforcement — first `consume()` succeeds, second throws `TypeError` with exact message

### src/request.ts — Request class + buildPath/buildQuery
- `buildPath(segments)`: Maps each segment through `encodeURIComponent(String(s))` and joins with `/`
- `buildQuery(query)`: Constructs `URLSearchParams`, skips undefined values, appends each array element separately
- `Request<R>`: Private constructor, JS private class field `#consumed`, static `create<M>()`, `consume()` with affine enforcement
- Named exports only: `Request`, `buildPath`, `buildQuery`
- Imports: `import type` with `.js` extension from `./types.js`

## Deviations and Decisions

### DEVIATION: RequestInput removed; Request.create() accepts RequestSpec<M> directly

- **Plan prescribed:** A `PathOrUrl` discriminated union type + `RequestInput<M>` = `Omit<RequestSpec<M>, "path" | "absoluteUrl"> & PathOrUrl` to enforce compile-time mutual exclusion between `path` and `absoluteUrl`
- **Actual implementation:** `Request.create<M>(input: RequestSpec<M>)` — no `PathOrUrl`, no `RequestInput`
- **Reason:** The `PathOrUrl` union required callers to provide either `path` OR `absoluteUrl` as a required field. All test cases in `request.test.ts` call `Request.create({ method: "GET", responses: {} })` with neither field, which failed to match either branch of the discriminated union. Since `RequestSpec` already has both fields as optional, the `PathOrUrl` wrapper added no value and broke the API.
- **Impact:** Callers can technically provide both `path` and `absoluteUrl` simultaneously. This is acceptable for a `RequestSpec`-building utility; the consumer (`send()` in Phase 3) is responsible for deciding which takes precedence.

### DEVIATION: `as unknown as RequestSpec` double cast

- **Plan prescribed:** `input as RequestSpec` (single cast)
- **Actual implementation:** `input as unknown as RequestSpec`
- **Reason:** TypeScript 6 with `exactOptionalPropertyTypes` rejects the single cast (`TS2352: Conversion of type 'RequestSpec<M>' to type 'RequestSpec' may be a mistake`). The `unknown` intermediate satisfies the type checker while preserving intent.
- **Impact:** None — purely internal to the constructor call. The runtime value is unchanged.

## Verification

```
✓ grep -c 'placeholder' tests/unit/types.test.ts    → 0
✓ grep -c 'placeholder' tests/unit/request.test.ts  → 0
✓ grep -c 'from.*src/types.js' tests/unit/types.test.ts → 1
✓ grep -c 'from.*src/request.js' tests/unit/request.test.ts → 1
✓ export class Request present in src/request.ts
✓ export function buildPath present in src/request.ts
✓ export function buildQuery present in src/request.ts
✓ #consumed private class field (JS private, not Symbol)
✓ Exact TypeError message present
✓ No default export
✓ npm run typecheck exits 0
✓ npx vitest run --project node tests/unit/request.test.ts → 12/12 pass (GREEN)
✓ npx vitest run --project node → 30/30 pass (no regression)
```
