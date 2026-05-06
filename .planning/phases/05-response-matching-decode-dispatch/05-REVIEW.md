# Phase 05 Code Review

**Reviewed:** 2026-05-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

---

## [MEDIUM] `previewFromBytes` mishandles `maxBytes < 0` — returns wrong bytes

**File:** `src/preview.ts:88-100`

**Issue:**
`readBodyPreview` explicitly guards `maxBytes <= 0` with an early-return that cancels the stream and returns `{ text: "", bytesRead: 0, truncated: true }`. `previewFromBytes` has no equivalent guard. For `maxBytes < 0`, JavaScript's `Uint8Array.slice(0, maxBytes)` treats the negative end as `length + maxBytes`, returning `length - |maxBytes|` bytes instead of zero bytes. For example, with a 20-byte buffer and `maxBytes = -1`, `slice(0, -1)` returns 19 bytes and `bytesRead` is 19, while `readBodyPreview` for the same maxBytes would have returned `{ bytesRead: 0, truncated: true }`.

`maxBytes` flows in from `clientSpec.diagnostics?.bodyPreviewBytes ?? 8192`. There is no validation that `bodyPreviewBytes` is positive. If a caller passes `{ diagnostics: { bodyPreviewBytes: -1 } }` or `0`, the two code paths produce inconsistent results: the `unhandledStatus` path (uses `readBodyPreview`) returns empty, but the `decodeError` path (uses `previewFromBytes`) returns wrong bytes.

**Fix:**
Add the same `maxBytes <= 0` guard at the top of `previewFromBytes`:

```ts
export function previewFromBytes(bytes: Uint8Array, maxBytes: number): BodyPreview {
  if (maxBytes <= 0) {
    return { text: "", bytesRead: 0, truncated: bytes.length > 0 };
  }
  const truncated = bytes.length > maxBytes;
  const sliced = bytes.slice(0, maxBytes);
  // ...
}
```

---

## [MEDIUM] `preview.truncated: false` is semantically wrong when `readBytes` fails

**File:** `src/send.ts:204-213`

**Issue:**
When `readBytes(response)` returns `{ kind: "bodyReadFailed" }` (which only occurs when `response.body` is non-null but the stream throws), the returned preview is:

```ts
preview: { text: "", bytesRead: 0, truncated: false }
```

`truncated: false` with `bytesRead: 0` semantically asserts "we read the body to completion and it was empty." But `readBytes` only returns `bodyReadFailed` when the body was non-null and the stream threw an error — the body was never empty. `truncated: false` is therefore incorrect; the read was cut short, which is precisely what `truncated: true` represents in the `BodyPreview` contract.

A caller processing the preview without first checking `error.kind` would misinterpret the body as empty (0 bytes, not truncated) when in fact the stream errored partway through.

**Fix:**

```ts
if ("kind" in bytes) {
  // bodyReadFailed: body was non-null but stream errored; preview is unavailable.
  // truncated: true because we could not read the full body.
  return {
    kind: "decodeError",
    status: response.status,
    headers: response.headers,
    error: bytes,
    preview: { text: "", bytesRead: 0, truncated: true },
  };
}
```

---

## [MEDIUM] No test for the matched-status `readBytes` bodyReadFailed dispatch path

**File:** `tests/unit/send.test.ts`

**Issue:**
The `send.ts` dispatch path at lines 203–213 — where a status IS matched but `readBytes(response)` itself returns `{ kind: "bodyReadFailed" }` (stream errors during buffering) — has no test coverage. This is a distinct code path from "decoder returns DecodeError" and "decoder throws," both of which are tested in SEND-10. The bodyReadFailed path from readBytes produces `preview: { truncated: false }` (the bug documented above), but because the path is untested, the error cannot be caught by the test suite.

**Fix:**
Add a test to SEND-10 that simulates a stream error after the response headers are received but before the body is fully buffered:

```ts
it("readBytes() bodyReadFailed → { kind: 'decodeError', error.kind: 'bodyReadFailed' }", async () => {
  const erroringStream = new ReadableStream({
    start(controller) {
      controller.error(new Error("stream exploded mid-read"));
    },
  });
  const mockFetch: typeof globalThis.fetch = async () =>
    new Response(erroringStream, { status: 200 });
  const req = Request.create({
    method: "GET",
    path: [],
    responses: { 200: Decode.json().as("data") },
  });
  const result = await performSend(req, {
    baseUrl: "https://api.example.com/",
    fetch: mockFetch,
  });
  expect(result.kind).toBe("decodeError");
  if (result.kind === "decodeError") {
    expect(result.error.kind).toBe("bodyReadFailed");
    // truncated should be true — stream was non-null but errored
    expect(result.preview.truncated).toBe(true);
  }
});
```

---

_Reviewed: 2026-05-07T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
