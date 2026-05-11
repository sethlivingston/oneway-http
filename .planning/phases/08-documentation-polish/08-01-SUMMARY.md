---
phase: 08-documentation-polish
plan: "01"
subsystem: api
tags: [typescript, validation, types, tsdoc, public-api]

requires:
  - phase: 07-typed-matcher
    provides: Send.match() dispatcher and Matcher<R,T> type

provides:
  - RequestError.reservedResponseTag sixth variant with runtime validation in performSend()
  - RESERVED_RESPONSE_TAGS module-scope Set guarding tag name collisions
  - Clean src/index.ts exporting full public API without scaffolding
  - TSDoc on every exported type/interface/alias in src/types.ts

affects: [documentation, public-api, index-exports]

tech-stack:
  added: []
  patterns:
    - "satisfies RequestError pattern extended to sixth variant"
    - "Module-scope Set for runtime tag-name guard (avoids per-call allocation)"
    - "TSDoc /** Brief description. */ on every exported declaration in types.ts"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/send.ts
    - src/index.ts
    - tests/unit/types.test.ts
    - tests/unit/send.test.ts
    - tests/parity/entrypoint-cases.ts

key-decisions:
  - "RESERVED_RESPONSE_TAGS defined at module scope in send.ts — avoids per-call allocation and satisfies dependency direction (send.ts → types.ts only, no import from matcher.ts)"
  - "Parity test for root entrypoint updated to verify real public API exports instead of removed scaffolding surface"
  - "clearTimeout(deadlineTimer) called before both reserved-tag early returns — prevents timer leak"

patterns-established:
  - "Reserved tag validation: for...of over Object.values(), entry !== undefined guard, satisfies RequestError"
  - "TSDoc style: /** Brief description. */ above every exported declaration, no @example blocks"

requirements-completed: []

duration: 15min
completed: 2026-05-08
---

# Phase 8 Plan 01: Pre-Documentation Code Changes Summary

**Sixth RequestError variant (`reservedResponseTag`) with runtime validation, scaffolding-free public API index, and TSDoc on all exported types.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 4 (types, send, index, tests)
- **Files modified:** 6

## Accomplishments

- Added `reservedResponseTag` as the sixth `RequestError` variant; wired runtime validation in `performSend()` checking both `spec.responses` and `clientSpec.responses`
- Replaced `src/index.ts`: removed `runtimeTarget`/`describe` scaffolding exports, added `Request`, `createClient`, `Client`, and all public types
- Added `/** Brief description. */` TSDoc above every exported declaration in `src/types.ts`
- Updated TYPES-09 test to six variants; added SEND-11 reserved-tag validation tests (6 cases)

## Task Commits

1. **All tasks (atomic)** — `37d03c0` feat(08): reservedResponseTag validation, clean index.ts, types.ts TSDoc

## Files Created/Modified

- `src/types.ts` — Added `reservedResponseTag` sixth variant to `RequestError`; TSDoc on every exported declaration
- `src/send.ts` — Added `RESERVED_RESPONSE_TAGS` module-scope Set; added validation loops after `combinedSignal` assignment
- `src/index.ts` — Removed `shared.js` scaffolding; added `Request`, `createClient`, `Client`, and all public types
- `tests/unit/types.test.ts` — TYPES-09 updated to six variants (`toHaveLength(6)`)
- `tests/unit/send.test.ts` — Added SEND-11 block with 6 test cases for reserved tag validation
- `tests/parity/entrypoint-cases.ts` — Root entrypoint case updated to verify real public API exports (fixed in PR review follow-up)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Parity test for root entrypoint needed updating**
- **Found during:** TypeScript type-check after updating `src/index.ts`
- **Issue:** `tests/parity/entrypoint-cases.ts` passed the imported root module to `expectPlaceholderSurface()`, which expects `runtimeTarget` and `describe` — both removed per plan
- **Fix:** Identified in plan; completed in PR review follow-up commit
- **Files modified:** `tests/parity/entrypoint-cases.ts`

## Must-Haves Verification

| Must-Have | Status |
|-----------|--------|
| RequestError union has six variants including reservedResponseTag | ✅ |
| performSend() returns requestError.reservedResponseTag for spec.responses reserved tag | ✅ |
| performSend() returns requestError.reservedResponseTag for clientSpec.responses reserved tag | ✅ |
| runtimeTarget and describe NOT exported from src/index.ts | ✅ |
| createClient, Client, Request ARE exported from src/index.ts | ✅ |
| All exported types in types.ts have TSDoc comments | ✅ |
| npx tsc --noEmit passes | ✅ |
| All unit tests pass (164 passed, 1 todo) | ✅ |

## Self-Check: PASSED
