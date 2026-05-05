---
status: all_fixed
phase: "03"
findings_in_scope: 3
fixed: 3
skipped: 0
iteration: 1
fixed_at: 2025-07-24T00:00:00Z
review_path: .planning/phases/03-transport-send/03-REVIEW.md
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2025-07-24T00:00:00Z
**Source review:** `.planning/phases/03-transport-send/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Deadline timer leaks when URL construction throws

**Files modified:** `src/send.ts`
**Commit:** `a5ba066`
**Applied fix:** Moved `buildEffectiveUrl(spec, clientSpec)` and `mergeEffectiveHeaders(...)` calls to execute **before** the `deadlineController`/`deadlineTimer` setup block. Previously these calls were placed after `setTimeout(...)`, so any `TypeError` thrown by invalid URL construction would escape before the `try/finally` that calls `clearTimeout`. With the reorder, a throw on URL construction happens before any timer is allocated — no leak is possible.

### WR-02: `readBodyPreview` returns `truncated: false` when `maxBytes === 0`

**Files modified:** `src/send.ts`
**Commit:** `a5ba066`
**Applied fix:** Added an early-return guard immediately after the `response.body === null` check:

```typescript
if (maxBytes <= 0) {
  const reader = response.body.getReader();
  await reader.cancel().catch(() => {});
  return { text: "", bytesRead: 0, truncated: true };
}
```

When `maxBytes` is `0` (or negative), no bytes are read but the stream must still be cancelled to release the TCP connection. `truncated: true` correctly reflects that the body had content that was not read.

### WR-03: Duplicate `describe` suite IDs in send.test.ts

**Files modified:** `tests/unit/send.test.ts`
**Commit:** `843118e`
**Applied fix:** Assigned unique sequential IDs to all 9 `describe` blocks. The reviewer's suggested renames (SEND-03, SEND-04, SEND-07) conflicted with pre-existing blocks at lines 155 and 237. A comprehensive sequential renumber was applied:

| Before | After | Block content |
|--------|-------|---------------|
| SEND-02 (line 73) | SEND-03 | performSend() pre-abort guard (D-05) |
| SEND-02 (line 118) | SEND-04 | deadlineMs validation (D-07) |
| SEND-03 (line 155) | SEND-05 | Header merge (D-19) |
| SEND-04 (line 237) | SEND-06 | responses map stub (D-13) |
| SEND-05 (line 255) | SEND-07 | effectiveDeadlineMs (D-20) |
| SEND-06 (line 306) | SEND-08 | AbortSignal.any() composition (D-09, D-10) |
| SEND-06 (line 408) | SEND-09 | body preview reading (D-15, D-16, D-17) |

All suite IDs are now unique and sequential (SEND-01 through SEND-09).

---

_Fixed: 2025-07-24T00:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
