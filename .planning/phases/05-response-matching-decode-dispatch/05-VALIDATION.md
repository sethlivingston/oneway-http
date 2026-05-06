---
phase: 5
slug: response-matching-decode-dispatch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test:node` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:node`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TYPES (DecoderLike) | — | N/A | typecheck | `npm run typecheck` | ✅ | ⬜ pending |
| 05-01-02 | 01 | 1 | DEC (readBytes export) | — | N/A | unit | `npm run test:node -- tests/unit/decode.test.ts` | ✅ | ⬜ pending |
| 05-01-03 | 01 | 1 | PREV-01, PREV-03 | — | N/A | unit | `npm run test:node -- tests/unit/send.test.ts` | ✅ (extend) | ⬜ pending |
| 05-02-01 | 02 | 1 | RESP-01, RESP-02 | — | No pre-merge of maps | unit | `npm run test:node -- tests/unit/response-matching.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-03-01 | 03 | 2 | RESP-01–04, PREV-02 | — | No decode on unhandled | unit | `npm run test:node -- tests/unit/send.test.ts` | ✅ (extend) | ⬜ pending |
| 05-03-02 | 03 | 2 | RESP-03 | — | Preview on unhandledStatus | unit | `npm run test:node -- tests/unit/send.test.ts` | ✅ (extend) | ⬜ pending |
| 05-03-03 | 03 | 2 | RESP-04 | — | Preview on decodeError | unit | `npm run test:node -- tests/unit/send.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/response-matching.test.ts` — stubs covering RESP-01 (4-step precedence), RESP-02 (no match → unhandledStatus); pure function, no HTTP mocks needed

*Existing infrastructure (Vitest, vitest.config.ts) covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TypeScript produces a type error when Send.match() handler is missing for a tag | RESP-01 (type-level) | Compile-time type error cannot be asserted in runtime test | Run `npm run typecheck` and verify `expect-error` comment in types.test.ts if added |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
