# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** Provide a strict, explicit HTTP client that keeps consumers from having to manually manage transport semantics, status handling, and body decoding while staying consistent across Node and browsers.
**Current focus:** Phase 1 — Core Request/Response Pipeline

## Current Position

Phase: 1 of 3 (Core Request/Response Pipeline)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-04-27 — Roadmap created; ready to plan Phase 1

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: `docs/SPEC.md` is the sole behavioral source of truth — no MVP trimming
- Init: Zero new runtime dependencies; `msw` and `@arethetypeswrong/cli` are devDeps only
- Init: Existing `package.json` exports, `tsup.config.ts`, and parity harness are preserved as-is

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 1 gap:** `src/index.ts` neutral-root build silently loads browser behavior in non-condition-aware toolchains (CONCERNS.md). Decision needed: add runtime guard or document limitation.
- **Phase 2 pre-req:** `AbortSignal.any()` requires Node 20.3+/Chrome 116/Safari 17.4. Minimum supported versions not yet declared in `package.json engines`. Confirm before Phase 2 planning (polyfill may be unnecessary if Node 22 is the floor).
- **Phase 3 flag:** `Send.match()` TypeScript generic formulation (extracting tag unions from `ResponseMap`) benefits from prototyping/research before implementation.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-27
Stopped at: Roadmap created — Phase 1 ready to plan
Resume file: None
