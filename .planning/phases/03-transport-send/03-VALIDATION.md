---
phase: 3
slug: transport-send
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (exists; `tests/unit/**/*.test.ts` already in `unitInclude`) |
| **Quick run command** | `npx vitest run --project node tests/unit/send.test.ts` |
| **Full suite command** | `npx vitest run --project node` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project node tests/unit/send.test.ts`
- **After every plan wave:** Run `npx vitest run --project node`
- **Before `/gsd-verify-work`:** `npm run verify` (typecheck + lint + full test suite) must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SEND-01 | — | N/A | unit | `npx vitest run --project node tests/unit/client.test.ts` | ✅ needs update | ⬜ pending |
| 03-01-02 | 01 | 1 | SEND-01 | — | absoluteUrl bypasses baseUrl | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | SEND-02 | — | send() returns unhandledStatus for HTTP | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | SEND-02 | — | send() never throws on network error | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | SEND-02 | — | Body preview populated in unhandledStatus | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | SEND-05 | — | Request deadlineMs overrides client | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | SEND-06 | — | Deadline fires → timeout (not aborted) | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | SEND-06 | — | clearTimeout fires in finally even on error | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | SEND-06 | — | Pre-aborted signal → immediate aborted, no fetch | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 1 | SEND-06 | — | Caller abort during request → aborted | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 1 | SEND-04 | — | responses map not pre-merged | unit | `npx vitest run --project node tests/unit/send.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-04 | 03 | 1 | SEND-03 | — | Header merge case-insensitive, request wins | unit | `npx vitest run --project node tests/unit/client.test.ts` | ✅ covered | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/send.test.ts` — new file; stub tests for SEND-02, SEND-04, SEND-05, SEND-06 (does not yet exist)
- [ ] `tests/unit/client.test.ts` — needs update for SEND-01: `createClient()` return type is now `Client` with `.send()` method

*All other test infrastructure exists and covers Phase 3 adequately.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
