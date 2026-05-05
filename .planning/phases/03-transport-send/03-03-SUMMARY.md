# Plan 03-03 Summary: readBodyPreview() + Complete Test Suite

**Commit:** e79d779
**Status:** ✅ Complete

## What was done

### Task 1: readBodyPreview() in src/send.ts
- Added `readBodyPreview(response, maxBytes)` async function before `performSend()`
- **Peek-read truncation detection (D-15)**: when `bytesRead === maxBytes`, reads one extra chunk to distinguish "exactly full" from "more data pending" — prevents incorrect `truncated: true` for exact-N-byte bodies
- **Uint8Array assembly**: `for...of` + `Uint8Array.set()` pattern (safe under `noUncheckedIndexedAccess`)
- **TextDecoder('utf-8', { fatal: false })** with outer try/catch — decode errors swallowed, `text: ""` fallback (D-17)
- **`reader.cancel()` in `finally`** — always releases TCP socket, swallows cancel errors (T-03-13)
- **D-12 re-throw**: `reader.read()` errors propagate through to `performSend()` outer catch → `classifyTransportError()` classifies correctly ("timeout" not "network")
- **`response.body === null` fast path**: returns `{ text: "", bytesRead: 0, truncated: false }` immediately
- Replaced placeholder `{ text: "", bytesRead: 0, truncated: false }` in `performSend()` with `await readBodyPreview(response, maxBytes)`
- `clientSpec.diagnostics?.bodyPreviewBytes ?? 8192` default (D-15)

### Task 2: Complete test suite
**send.test.ts** — all 21 remaining `it.todo` stubs replaced:
- Added `import { createClient }` at top
- SEND-01: `createClient()` returns `Client` with `send()` method
- SEND-02 "never throws": 4 tests (200, 404, network error, arbitrary TypeError)
- SEND-02 pre-abort guard: 3 tests (aborted immediately, fetch NOT called, consume() NOT called)
- SEND-03 header merge: 4 tests (request wins, client-only, key lowercasing, undefined filtered)
- SEND-04 stub: 1 test (Phase 3 always returns unhandledStatus)
- SEND-06 body-read abort (D-12): ReadableStream test wired to signal — deadline → "timeout"
- SEND-06 body preview: 6 tests (bytesRead, truncated=false short, truncated=false exact via peek, truncated=true over, text decoded, null body)

**client.test.ts** — added SEND-01 Phase 3 describe block (2 tests)

## Test counts
- Before: 48 passing + 21 todo
- After: 70 passing + 0 todo

## Key insight: mock fetch signal propagation
Mock fetch functions that need to simulate abort must listen to `init.signal`:
```typescript
const mockFetch = (_url, init) => {
  const signal = init?.signal;
  return new Promise((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason));
    setTimeout(resolve, 500);
  });
};
```
Without this, abort signals fire but the mock Promise stays pending → classified as "network" instead of "timeout"/"aborted".
