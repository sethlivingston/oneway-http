---
phase: 4
slug: body-producers-decoders
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `vitest run --project node` |
| **Full suite command** | `vitest run` |
| **Estimated runtime** | ~10 seconds (node project) |

---

## Sampling Rate

- **After every task commit:** Run `vitest run --project node`
- **After every plan wave:** Run `vitest run --project node`
- **Before `/gsd-verify-work`:** Full suite (`vitest run`) must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | BODY-01 | — | N/A | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-01-02 | 01 | 1 | BODY-02 | — | N/A | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-01-03 | 01 | 1 | BODY-03 | — | N/A | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-01-04 | 01 | 1 | BODY-04 | — | N/A | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-01-05 | 01 | 1 | BODY-05 | — | N/A | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-01 | 02 | 1 | DEC-01 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-02 | 02 | 1 | DEC-02 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-03 | 02 | 1 | DEC-03 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-04 | 02 | 1 | DEC-04 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-05 | 02 | 1 | DEC-06 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-06 | 02 | 1 | DEC-07 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-02-07 | 02 | 1 | DEC-08 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-03-01 | 03 | 2 | DEC-05 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-03-02 | 03 | 2 | DEC-02 | — | N/A | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-04-01 | 04 | 2 | PREV-01 | — | Reader cancelled in finally | unit | `vitest run --project node tests/unit/send.test.ts` | ✅ | ⬜ pending |
| 04-04-02 | 04 | 2 | PREV-02 | — | N/A | unit | `vitest run --project node tests/unit/send.test.ts` | ✅ | ⬜ pending |
| 04-04-03 | 04 | 2 | PREV-03 | — | N/A | unit | `vitest run --project node tests/unit/send.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/body.test.ts` — stubs for BODY-01 through BODY-05
- [ ] `tests/unit/decode.test.ts` — stubs for DEC-01 through DEC-08

*PREV-01, PREV-02, PREV-03 are already covered by existing `send.test.ts` tests.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
