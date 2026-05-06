# 04-03 SUMMARY: Extract Preview + Wire Body Serialization

## Status: Complete ✅

## What was built

### src/preview.ts (new)
- `export async function readBodyPreview(response, maxBytes)` — verbatim extract from send.ts (D-11)
- Imports only `import type { BodyPreview } from "./types.js"` 
- `finally { await reader.cancel() }` preserved — connection hygiene (P3)
- Both the main read loop and the TextDecoder fallback blocks are identical to original

### src/send.ts (updated)
- Updated dependency comment to reflect `body.ts` and `preview.ts` imports
- Added `RequestError` to `import type { ... }` from types.js
- Added `import { serializeBody } from "./body.js"`
- Added `import { readBodyPreview } from "./preview.js"`
- Removed inline `readBodyPreview` function (83 lines removed)
- Added body serialization before fetchInit:
  - `serializeBody(spec.body)` wrapped in try/catch
  - Catch returns `{ kind: "requestError", error: { kind: "bodySerializationFailed", message } }`
  - Message extracted via `e instanceof Error ? e.message : String(e)` (no stack trace — T-04-03-02)
- Updated fetchInit body: `serialized?.init` instead of `spec.body`
- Added content-type injection from `serialized.contentType` when caller hasn't set it

## Key decisions
- `satisfies RequestError` on the bodySerializationFailed return ensures type-narrowing is checked at compile time
- `headers["content-type"] === undefined` check (not `!headers["content-type"]`) is safe because `mergeEffectiveHeaders` returns `Record<string, string>` — with `noUncheckedIndexedAccess`, the value is `string | undefined`
- Content-type injection is placed AFTER fetchInit construction but BEFORE the fetch call — correct ordering

## Verification
- `grep -c "export async function readBodyPreview" src/preview.ts` → 1 ✓
- `grep -c "async function readBodyPreview" src/send.ts` → 0 (removed) ✓
- `grep -c "import { serializeBody }" src/send.ts` → 1 ✓
- `grep -c "import { readBodyPreview }" src/send.ts` → 1 ✓
- `grep -c "requestError" src/send.ts` → 2 (return + satisfies) ✓
- `vitest run --project node` → 108 tests passing ✓
- `npx tsc --noEmit` → 0 errors ✓
