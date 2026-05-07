---
phase: 6
slug: abort-deadline-retry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --project node tests/unit/retry.test.ts tests/unit/send.test.ts` |
| **Full suite command** | `npx vitest run --project node` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project node tests/unit/retry.test.ts tests/unit/send.test.ts`
- **After every plan wave:** Run `npx vitest run --project node`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-P5-pitfall | Wave 0 | 0 | ADR-03 | — | N/A | integration | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 6-P6-pitfall | Wave 0 | 0 | ADR-04 | — | N/A | unit | `npx vitest run --project node tests/unit/retry.test.ts` | ❌ W0 | ⬜ pending |
| 6-P7-pitfall | Wave 0 | 0 | ADR-05 | — | N/A | unit | `npx vitest run --project node tests/unit/retry.test.ts` | ❌ W0 | ⬜ pending |
| 6-resolve-policy | Wave 0 | 0 | D-10 | — | N/A | unit | `npx vitest run --project node tests/unit/retry.test.ts` | ❌ W0 | ⬜ pending |
| 6-types | Wave 1 | 1 | ADR-01, ADR-02 | — | N/A | unit | `npx vitest run --project node tests/unit/retry.test.ts` | ❌ W0 | ⬜ pending |
| 6-retry-loop | Wave 2 | 2 | ADR-01–ADR-07 | — | N/A | integration | `npx vitest run --project node tests/unit/send.test.ts` | ✅ (extend) | ⬜ pending |
| 6-adr06 | Wave 2 | 2 | ADR-06 | — | N/A | integration | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 6-adr07 | Wave 2 | 2 | ADR-07 | — | N/A | integration | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/retry.test.ts` — unit tests for `sleepWithAbort` (ADR-04), `jitterDelay` (ADR-05), `resolveRetryPolicy` (D-10)
- [ ] `tests/unit/send.test.ts` — extend with retry integration tests: off-by-one mock (ADR-03), decodeError no-retry (ADR-06), default policy GET/HEAD (ADR-07)

*Wave 0 tests must be written (failing/red) before production implementation begins.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
