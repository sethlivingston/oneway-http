# oneway-http

## What This Is

`oneway-http` is a runtime-aware TypeScript HTTP client for Seth's own apps that aims to provide the same declarative, structured experience in both Node.js and browser environments. Instead of exposing a fetch-style interface that leaves status handling, body consumption, and transport semantics up to each caller, it is meant to let callers define meaningful request/response contracts and receive truthful structured results.

The current repository already provides the package, build, and runtime-parity scaffold for that library, but the HTTP client behavior itself still needs to be implemented from `docs/SPEC.md`.

## Core Value

Provide a strict, explicit HTTP client that keeps consumers from having to manually manage transport semantics, status handling, and body decoding while staying consistent across Node and browsers.

## Requirements

### Validated

- ✓ Runtime-aware package exports resolve the root package and explicit `browser`/`node` subpaths to distinct build outputs — existing
- ✓ The repository builds root, browser, and node ESM artifacts from one source tree — existing
- ✓ Runtime parity checks exist for Node, Chromium, Firefox, and WebKit entrypoint resolution — existing

### Active

- [ ] Implement the declarative request and client model defined in `docs/SPEC.md`, including merge rules for defaults, per-send overrides, and status-specific response matching
- [ ] Implement `send()` so it returns structured results for decoded responses, transport failures, decode failures, and unhandled statuses without treating HTTP statuses as exceptions
- [ ] Implement the outbound `Body.*`, inbound `Decode.*`, and `Send.match()` surfaces described in `docs/SPEC.md`
- [ ] Enforce the affine request/body runtime rules and explicit unmatched-status behavior described in `docs/SPEC.md`
- [ ] Preserve the runtime-aware single-package contract across browser and node entrypoints while moving from placeholder behavior to real HTTP behavior
- [ ] Keep the repository and release lifecycle secure enough to ship and then exercise the library in real apps

### Out of Scope

- Streaming request bodies in v1 — explicitly excluded by `docs/SPEC.md`
- A hosted service, daemon, or UI product — this repository is a published TypeScript library, not an application
- Fetch-style implicit body handling or exception-driven HTTP semantics — rejected by the project's core design

## Context

The repository is already a brownfield scaffold with conditional package exports in `package.json`, three build targets in `tsup.config.ts`, thin runtime entrypoints in `src/index.ts`, `src/browser.ts`, and `src/node.ts`, and parity-first verification in `tests/parity/`. The current implementation is intentionally placeholder-only, and `docs/SPEC.md` is the functional source of truth for what the library should become.

This project is primarily for Seth's own apps rather than immediate broad-market generality. The motivation is dissatisfaction with existing HTTP libraries that feel sloppy, behave inconsistently across runtimes, and require consumers to know and do too much manually.

Success means the features in `docs/SPEC.md` are implemented, the repository and release lifecycle are secure, and the library has been tried in real app usage.

## Constraints

- **Tech stack**: TypeScript ESM package targeting both Node.js and browser runtimes — the existing package/export/build structure is already in place and should be preserved
- **Product scope**: Implement the library substantially as specified rather than optimizing for a reduced MVP — the goal is the spec-backed client, not a partial convenience wrapper
- **API semantics**: Transport failures must be structured values, HTTP statuses must not be treated as transport exceptions, and response decoding must remain status-specific — these are core design constraints from `docs/SPEC.md`
- **Repository shape**: Shared runtime-agnostic logic should stay centralized while runtime-specific entrypoints remain thin wrappers — consistent with the current source layout and codebase conventions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `docs/SPEC.md` is the implementation source of truth | The existing code is intentionally placeholder-only, and the spec defines the intended behavior precisely | — Pending |
| Build for Seth's own apps first | The project exists to solve concrete needs in the author's own software before broader positioning concerns | — Pending |
| Implement the full spec rather than targeting a minimized MVP | The project goal is correctness and semantic completeness, not speed-to-demo | — Pending |
| Preserve one runtime-aware package with explicit browser/node entrypoints | The current packaging and test matrix already establish this contract and it should survive the feature build-out | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 after initialization*
