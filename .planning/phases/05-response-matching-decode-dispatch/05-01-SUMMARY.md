---
phase: 05-response-matching-decode-dispatch
plan: "01"
subsystem: types-decode-preview
tags: [types, decode, preview, foundational-exports]
dependency_graph:
  requires: []
  provides:
    - DecoderLike interface in types.ts
    - exported readBytes from decode.ts
    - exported previewFromBytes from preview.ts
  affects:
    - src/send.ts (Plans 02/03 depend on these exports)
    - src/response-matching.ts (uses DecoderLike via TaggedEntry.decode)
tech_stack:
  added: []
  patterns:
    - DecoderLike structural interface (Decoder<T>.fn satisfies without cast)
    - previewFromBytes pure function (no I/O, derives BodyPreview from buffered bytes)
key_files:
  created: []
  modified:
    - src/types.ts
    - src/decode.ts
    - src/preview.ts
    - tests/unit/types.test.ts
    - tests/unit/send.test.ts
decisions:
  - "DecoderLike.fn returns Promise<unknown | DecodeError> matching Decoder<T>.fn structurally"
  - "TaggedEntry.decode changed from unknown to DecoderLike — eliminates cast at dispatch"
  - "readBytes exported with zero signature changes — pure visibility change"
  - "previewFromBytes uses fatal:false TextDecoder — never throws on truncated UTF-8"
metrics:
  duration: "~14 minutes"
  completed: "2026-05-06"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 05 Plan 01: Foundational Exports for Decode Dispatch Summary

**One-liner:** Added `DecoderLike` interface to types.ts, exported `readBytes` from decode.ts, and added pure `previewFromBytes` to preview.ts — three foundational exports enabling Plans 02 and 03 compile without casts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| T1 | Add DecoderLike interface; update TaggedEntry.decode | 183aac5 | src/types.ts, tests/unit/types.test.ts, tests/unit/send.test.ts |
| T2 | Export readBytes from decode.ts | 7bc7cec | src/decode.ts |
| T3 | Add previewFromBytes to preview.ts | ae1d845 | src/preview.ts |

## Verification

- `npm run typecheck`: passes ✓
- `npm test`: 124 passed | 3 skipped | 1 todo ✓
- `DecoderLike` exported from types.ts ✓
- `TaggedEntry.decode` is `DecoderLike` (no cast needed at dispatch) ✓
- `readBytes` exported from decode.ts ✓
- `previewFromBytes` exported from preview.ts ✓
- `previewFromBytes` uses `{ fatal: false }` — never throws on truncated UTF-8 ✓
- `Decoder<T>` structurally satisfies `DecoderLike` — `.fn` property matches ✓
- Zero imports added to types.ts ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test files incompatible with DecoderLike constraint**
- **Found during:** Task T1 (typecheck after adding DecoderLike)
- **Issue:** `tests/unit/types.test.ts` used `decode: null` and `tests/unit/send.test.ts` used a non-conforming function literal (`decode: () => ...`) — both invalid once `TaggedEntry.decode` changed from `unknown` to `DecoderLike`
- **Fix:** Added `DecoderLike` import to types.test.ts; replaced `null` values with `{ fn: async (_r) => ({ kind: "emptyBody" }) }` stub; updated send.test.ts decode to proper `{ fn: async (_r: Response) => ... }` shape
- **Files modified:** tests/unit/types.test.ts, tests/unit/send.test.ts
- **Commit:** 183aac5

### Parallel Execution Note

During T3 execution, the parallel 05-02 agent committed `test(05-02): add failing unit tests for matchResponse` (19943f7) to the shared branch. This briefly caused `npm run typecheck` to report a missing `src/response-matching.ts` module. This was NOT caused by Plan 01's changes — it was the 05-02 TDD RED phase test. The 05-02 agent subsequently committed the implementation (3931e12) before Plan 01's SUMMARY was written. Final typecheck and test suite both pass cleanly.

## Known Stubs

None — all exports are fully implemented with correct logic.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes introduced. All changes are pure type additions and function visibility changes.

## Self-Check: PASSED

- [x] src/types.ts — DecoderLike interface present, TaggedEntry.decode updated
- [x] src/decode.ts — readBytes exported
- [x] src/preview.ts — previewFromBytes exported
- [x] Commits 183aac5, 7bc7cec, ae1d845 exist
- [x] npm run typecheck passes
- [x] npm test passes (124 tests)
