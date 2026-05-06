# 04-04 SUMMARY: Wire Public API into index.ts

## Status: Complete ✅

## What was built

### src/index.ts (updated)
Appended after existing exports:

```typescript
// --- Phase 4: Body producers, decoders, and associated types ---
export { Body } from "./body.js";
export { Decoder, Decode } from "./decode.js";
export type {
  RequestError, SendResult, DecodeError, DecodeIssue, BodyPreview, TransportError,
} from "./types.js";
export type { RequestSpec } from "./types.js";
```

Existing `runtimeTarget` and `describe` exports preserved untouched.

## Key decision: Body type export omitted from index.ts

TypeScript 6 raises TS2300 "Duplicate identifier" when a module contains both:
- `export { Body } from "./body.js"` (value export — also exports the type of the value)  
- `export type { Body } from "./types.js"` (re-exports the opaque class type)

Attempted fix (`export type { Body }` in body.ts alongside `export const Body`) also raises
TS2323 "Cannot redeclare exported variable". TypeScript 6 does not support merging a type
re-export and a value declaration with the same name in the same file.

Decision: Export only the value `Body` from index.ts. Consumers get the opaque instance type
through type inference from factory method return types. `serializeBody` is NOT exported (D-06).

## Acceptance criteria verified
- `grep -c "export { Body } from" src/index.ts` → 1 ✓
- `grep -c "export { Decoder, Decode } from" src/index.ts` → 1 ✓
- `grep -c "serializeBody" src/index.ts` → 0 ✓
- `grep -c "export const runtimeTarget" src/index.ts` → 1 ✓
- `grep -c "export const describe" src/index.ts` → 1 ✓

## Verification
- `vitest run` (full suite node + browser) → 117 passing, 3 browser skips, 1 todo ✓
- `npx tsc --noEmit` → 0 errors ✓
