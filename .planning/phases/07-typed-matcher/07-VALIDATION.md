---
phase: 7
slug: typed-matcher
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --project node tests/unit/matcher.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (full suite includes node + chromium + firefox + webkit) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project node tests/unit/matcher.test.ts`
- **After every plan wave:** Run `npm run typecheck && npx vitest run --project node`
- **Before `/gsd-verify-work`:** `npm run verify` (typecheck + lint + full test suite)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | MATCH-01, MATCH-02 | — | N/A | type | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | MATCH-02 | — | N/A | type | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | MATCH-01 | — | N/A | unit | `npx vitest run --project node tests/unit/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | MATCH-01 | — | N/A | unit | `npx vitest run --project node tests/unit/matcher.test.ts` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | MATCH-01, MATCH-03 | — | N/A | unit+type | `npm run typecheck && npx vitest run --project node tests/unit/matcher.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/matcher.test.ts` — stubs/shells for MATCH-01, MATCH-02, MATCH-03 (runtime dispatch tests + `@ts-expect-error` exhaustiveness checks)

*Note: Compile-time tests (`@ts-expect-error`) live in the same test file and are validated by `npm run typecheck` (tsc --noEmit includes `tests/**`). No separate tsd dependency needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Adding a new `ResponseMap` entry causes type error at `Send.match()` call sites | MATCH-02 | Requires adding an entry and observing compile error at existing call sites — automation via `@ts-expect-error` at a dedicated test site | Run `npm run typecheck` after adding `"404": { decoder: Decode.none(), tag: "notFound" as const }` to test ResponseMap; verify error reported at `Send.match()` call site lacking `notFound` handler |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
