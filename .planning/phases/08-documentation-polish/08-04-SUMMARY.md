---
phase: 08-documentation-polish
plan: "04"
subsystem: infra
tags: [zod, peer-dependency, package-json, npm]

requires: []
provides:
  - "Optional Zod peer dependency declared in package.json (^3.25.0)"
  - "Zod in devDependencies for CI test builds"
affects: [consumers using Decode.json(zodSchema)]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - package.json

key-decisions:
  - "Declared zod ^3.25.0 as optional peer dependency so npm install does not fail for users who don't use Zod"
  - "Added zod to devDependencies to ensure CI test builds can resolve it without relying on consumers"

patterns-established: []

requirements-completed: [DOC-03]

duration: 5min
completed: 2026-05-08
---

# Phase 8 Plan 04: Zod Optional Peer Dependency Summary

**Declared `zod ^3.25.0` as optional peer dependency in `package.json` with `peerDependenciesMeta` opt-in and added to `devDependencies` for CI test resolution**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T17:29:32Z
- **Completed:** 2026-05-08T17:34:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `peerDependencies: { zod: "^3.25.0" }` to package.json
- Added `peerDependenciesMeta: { zod: { optional: true } }` so `npm install` never fails for non-Zod consumers
- Added `zod: "^3.25.0"` to `devDependencies` for CI test builds
- `engines.node` unchanged at `>=24.0.0`

## Task Commits

1. **Task 1: Add Zod peer dependency and devDependency to package.json** — `b1a3a63` (chore)

**Plan metadata:** _(docs commit forthcoming)_

## Files Created/Modified
- `package.json` — Added `peerDependencies`, `peerDependenciesMeta`, and `zod` entry in `devDependencies`

## Decisions Made
- `optional: true` in `peerDependenciesMeta` ensures consumers without Zod are not penalized at install time
- Placing Zod in `devDependencies` (in addition to `peerDependencies`) ensures the test suite can resolve the Zod import without requiring a consumer to have it installed

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- DOC-03 satisfied: consumers using `Decode.json(zodSchema)` will now see the peer dependency clearly in `package.json`
- No blockers for remaining documentation-polish plans

---
*Phase: 08-documentation-polish*
*Completed: 2026-05-08*
