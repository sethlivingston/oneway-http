---
phase: 2
completed: 2026-04-23
commits: [4860d53, e95112d, 7593b02]
---

# Phase 2: Done

## What Was Built

Added a parity-oriented test infrastructure based on Vitest projects and Playwright-backed browser mode so one shared suite can run against Node.js, Chromium, Firefox, and WebKit. The phase also introduced explicit developer scripts for Node-only tests, browser-only tests, browser installation, and full repository verification.

## Truths Verified

- [x] A single test authoring pattern is shared across Node.js and browser-engine runs rather than maintaining separate disconnected suites. — Verified by the single `tests/parity/entrypoints.test.ts` entrypoint calling `defineEntrypointParitySuite()` while `vitest.config.ts` feeds the same parity test glob to all four projects.
- [x] The full unit suite can be executed in Node.js and in real Chromium, Firefox, and WebKit browser engines from repository scripts. — Verified by `npm run test:node` passing in the node project and `npm run test:browser` passing in Chromium, Firefox, and WebKit.
- [x] The initial test harness includes placeholder parity-oriented cases that prove runtime-specific execution paths and shared expectations are wired correctly. — Verified by the shared parity harness files and live test output covering runtime context, root import resolution, explicit browser entrypoint loading, and visible skipped node-only cases in browser runs.
- [x] A repository-level verification command exists for developers to run the same build-and-test flow expected by CI. — Verified by `npm run verify`, which ran `typecheck` plus the full four-project parity suite successfully.

## Tests

- `tests/parity/entrypoints.test.ts` runs the shared parity suite in every configured runtime project.
- `tests/parity/runtime-context.ts`, `tests/parity/placeholder-assertions.ts`, `tests/parity/entrypoint-cases.ts`, and `tests/parity/suite.ts` provide the reusable parity harness and runtime-specific wiring boundaries.
- Repository scripts added: `test`, `test:node`, `test:browser`, `test:browser:install`, and `verify`.

## Code Review

### Medium

- Runtime-gated parity cases disappeared silently from browser output. Fixed by surfacing disabled cases with `it.skip(...)` so every omitted runtime-specific case remains visible in test reports.
- The root `"."` export used shared declarations but a browser build fallback, leaving the shared root runtime bundle unreachable in the default condition. Fixed by pointing the root fallback and `main` field to `dist/index.js`.

## Notes

- No plan deviations were required during Phase 2.
- Browser binaries were installed with the repository script before executing the Chromium, Firefox, and WebKit projects locally.
- Independent verification passed all four truths and reported no remaining gaps.
