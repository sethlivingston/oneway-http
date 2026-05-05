---
phase: 2
slug: core-types-request-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (already configured with aliases) |
| **Quick run command** | `npx vitest run --project node` |
| **Full suite command** | `npm run verify` (typecheck + lint + all test projects) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npx vitest run --project node`
- **Before `/gsd-verify-work`:** Full suite must be green (`npm run verify`)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TYPES-01 | — | N/A | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TYPES-02 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | TYPES-03 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | TYPES-04 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | TYPES-05 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | TYPES-06 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 1 | TYPES-07 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-08 | 01 | 1 | TYPES-08 | — | N/A | unit | `npx vitest run --project node tests/unit/types.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | REQ-01 | — | N/A | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | REQ-02 | — | N/A | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | REQ-03 | — | N/A | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | REQ-04 | — | N/A | unit | `npx vitest run --project node tests/unit/request.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | REQ-01 | — | N/A | unit | `npx vitest run --project node tests/unit/client.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/types.test.ts` — stubs for TYPES-01 through TYPES-08
- [ ] `tests/unit/request.test.ts` — stubs for REQ-01 through REQ-04 (path encoding, query building, affine enforcement)
- [ ] `tests/unit/client.test.ts` — stubs for merge rules (`mergeHeaders()`, `mergeQuery()`)

*All wave 0 test files must be created before the main implementation tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `types.ts` has zero imports | TYPES-01 | Structural — verify with `grep "^import" src/types.ts` returns empty | Run `grep "^import" src/types.ts` — must produce no output |
| `declare readonly _phantom: T` not emitted as value field | TYPES-08 | Compile-time check — ensure no JS output for `_phantom` | Inspect `dist/` output for absence of `_phantom` property assignment |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
