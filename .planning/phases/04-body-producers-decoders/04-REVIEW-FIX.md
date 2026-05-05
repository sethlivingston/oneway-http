---
phase: "04"
phase_name: "body-producers-decoders"
status: all_fixed
findings_in_scope: 3
fixed: 3
skipped: 0
iteration: 1
fixed_at: "2026-05-05T23:36:14Z"
review_path: .planning/phases/04-body-producers-decoders/04-REVIEW.md
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-05-05T23:36:14Z
**Source review:** `.planning/phases/04-body-producers-decoders/04-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, WR-02)
- Fixed: 3
- Skipped: 0

All fixes verified via `npx tsc --noEmit` (pass) and `npm test` (10/10 test files, 117 passed | 3 skipped browser-parity | 1 todo).

---

## Fixed Issues

### CR-01: `readBytes()` stream errors now return `bodyReadFailed` instead of rejecting

**Files modified:** `src/decode.ts`
**Commit:** `0a85472`

**Applied fix:**
- Changed `readBytes()` return type to `Promise<Uint8Array<ArrayBuffer> | { kind: "bodyReadFailed"; message: string }>`.
- Added `catch (e)` block inside `readBytes()` (between the `try` and `finally`) that returns `{ kind: "bodyReadFailed", message: ... }` when `reader.read()` rejects on stream error.
- Updated all four callers — `Decode.text()`, `Decode.json()` (via `jsonDecoder`), `Decode.bytes()`, `Decode.optional()` — to check `if ("kind" in bytes) return bytes;` before proceeding with the byte array.
- Added a `catch (e)` block to `Decode.none()`'s inline `reader.read()` call, returning `{ kind: "bodyReadFailed", message: ... }`.
- The `bodyReadFailed` variant in `types.ts` is now reachable for the first time (resolves IR-01 as a side effect).

**Verification:** TypeScript `--noEmit` clean; all 117 tests pass.

---

### WR-01: `preview.ts` TextDecoder changed to `{ fatal: false }` per architectural rule D-17

**Files modified:** `src/preview.ts`
**Commit:** `da95a4f`

**Applied fix:**
- Changed `new TextDecoder("utf-8", { fatal: true })` to `new TextDecoder("utf-8", { fatal: false })`.
- Removed the nested ISO-8859-1 try/catch fallback entirely — it was only needed as a safety net when `fatal: true` threw on truncated sequences. With `fatal: false`, invalid/incomplete bytes are replaced with U+FFFD and the decoder never throws.
- Retained the single outer try/catch for best-effort preview resilience, per the REVIEW fix suggestion.
- Comment updated to reference rule D-17 and explain the rationale.

**Verification:** TypeScript `--noEmit` clean; all 117 tests pass.

---

### WR-02: False comment in `index.ts` about `Body` opaque type re-export removed

**Files modified:** `src/index.ts`
**Commit:** `e1a44d7`

**Applied fix:**
- Removed the incorrect comment `// Body type (declare class) is re-exported via body.ts which body.js's export { Body } carries`.
- Replaced the `Body` factory export comment with an accurate description of current behavior.
- Added a note documenting the limitation: TypeScript 6 with `verbatimModuleSyntax` does not permit re-exporting a value and a type-only declaration under the same identifier from different source modules (TS2300). The REVIEW's exact suggestion (`export type { Body } from "./types.js"` alongside `export { Body } from "./body.js"`) was verified to cause TS2300.
- Documented the consumer workaround: `type BodyValue = ReturnType<typeof Body.none>`.

**Note on adaptation:** The REVIEW suggested adding `export type { Body } from "./types.js"` to index.ts. Two approaches were attempted:
1. Adding it directly to index.ts alongside the value export → TS2300: Duplicate identifier.
2. Adding `export type { Body } from "./types.js"` to body.ts alongside `export const Body` → TS2323/TS2484: Cannot redeclare exported variable + TS1448: must use type-only re-export (the type-only export shadowed the value).
Both fail under TypeScript 6 with `verbatimModuleSyntax`. The false comment (the primary defect) has been corrected; the public API gap is documented for future resolution (likely requiring renaming one of the two `Body` things).

**Verification:** TypeScript `--noEmit` clean; all 117 tests pass.

---

## Out-of-Scope Findings

### IR-01: `bodyReadFailed` variant was unreachable dead code (INFO — out of scope)

**File:** `src/types.ts:38-39`
**Status:** Out of scope for this fix run (`fix_scope: critical_warning`). However, this finding was resolved as a **side effect of CR-01** — the `bodyReadFailed` variant is now reachable via the new `catch` blocks in `readBytes()` and `Decode.none()`. No separate action required.

---

_Fixed: 2026-05-05T23:36:14Z_
_Fixer: gsd-code-fixer_
_Iteration: 1_
