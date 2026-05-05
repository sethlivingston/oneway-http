---
phase: "04"
phase_name: "body-producers-decoders"
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/body.ts
  - src/decode.ts
  - src/index.ts
  - src/preview.ts
  - src/send.ts
  - src/types.ts
  - tests/unit/body.test.ts
  - tests/unit/decode.test.ts
  - tests/unit/types.test.ts
status: issues_found
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
---

# Code Review: Phase 04 — Body Producers + Decoders

## Summary

The body producers (`Body.*`), decoders (`Decode.*`), preview streaming, and send plumbing are well-structured overall. Three findings require attention: a critical contract violation in the decoder stream-error path, an explicit architectural rule violation in `preview.ts`, and a missing type export that will confuse library consumers.

---

## Findings

### CR-01: `readBytes()` rejects on stream error instead of returning `DecodeError { kind: "bodyReadFailed" }`  [CRITICAL]

**File:** `src/decode.ts:26-45`

**Issue:** `readBytes()` wraps the `reader.read()` loop in a `try/finally`, not a `try/catch`. When the underlying `ReadableStream` errors (e.g., mid-body network interruption), `reader.read()` rejects and the error propagates out of `readBytes()` as a rejected `Promise` — confirmed by direct runtime test. Every decoder that calls `readBytes()` (`Decode.text()`, `Decode.json()`, `Decode.bytes()`, `Decode.optional()`) consequently rejects their outer `Promise` instead of returning `{ kind: "bodyReadFailed" }`.

The type contract for all decoders is `DecoderFn<T>`:

```typescript
type DecoderFn<T> = (response: Response) => Promise<T | DecodeError>;
```

A rejected `Promise` does not satisfy this contract. The `{ kind: "bodyReadFailed"; message: string }` variant in `types.ts` line 38–39 exists precisely for this case and is never reachable.

**Impact:** When Phase 5 integrates decoders into `send.ts`, the outer `try/catch` in `performSend` will catch the rejection and call `classifyTransportError`, returning `{ kind: "transportError", error: { kind: "network" } }`. A body read failure during decoding is semantically a decode-time event, not a transport event — the HTTP connection was established successfully. Callers matching on `transportError` will see spurious network errors; the `decodeError` variant will never fire for stream read failures.

`Decode.none()` (`decode.ts:100`) has the same problem — its `try/finally` doesn't catch `reader.read()` rejections either.

**Fix:** Catch stream errors in `readBytes` and propagate a typed sentinel, or add a catch in each decoder. The cleanest approach is a typed wrapper:

```typescript
// Option A — typed return from readBytes
async function readBytes(
  response: Response,
): Promise<Uint8Array<ArrayBuffer> | { kind: "bodyReadFailed"; message: string }> {
  if (response.body === null) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytesRead += value.length;
    }
  } catch (e) {
    return { kind: "bodyReadFailed", message: e instanceof Error ? e.message : String(e) };
  } finally {
    await reader.cancel().catch(() => {});
  }
  const all = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}
```

Each caller then checks `if ("kind" in bytes) return bytes;` before proceeding. `Decode.none()`'s inline `reader.read()` needs the same treatment:

```typescript
try {
  const { done } = await reader.read();
  if (done) return undefined;
  return { kind: "unexpectedBody" } satisfies DecodeError;
} catch (e) {
  return { kind: "bodyReadFailed", message: e instanceof Error ? e.message : String(e) };
} finally {
  await reader.cancel().catch(() => {});
}
```

---

### WR-01: `preview.ts` uses `{ fatal: true }` on the UTF-8 `TextDecoder`, violating the explicit architectural rule  [WARNING]

**File:** `src/preview.ts:77`

**Issue:** The architectural rule is unambiguous:

> **TextDecoder for preview** — always `{ fatal: false }`; `{ fatal: true }` throws on truncated UTF-8.

The code does:

```typescript
text = new TextDecoder("utf-8", { fatal: true }).decode(all);
```

The rationale given in the inline comment is that `fatal: true` "lets us detect invalid sequences and fall back" to ISO-8859-1. But body previews are **always** potentially truncated — the preview reads at most `maxBytes` bytes, and a multi-byte UTF-8 sequence may be split across the truncation boundary. `{ fatal: true }` will reliably throw in that common case.

The nested try/catch is a partial mitigation (Latin-1 fallback), but it introduces a silent-failure path: if the ISO-8859-1 `TextDecoder` also throws for any reason, both catches swallow the error and `text` silently remains `""`. A `BodyPreview` with `text: ""` but `bytesRead > 0` is misleading.

With `{ fatal: false }`, the UTF-8 decoder replaces invalid/incomplete sequences with U+FFFD replacement characters — still readable, clearly UTF-8-encoded content, and never throws. The ISO-8859-1 fallback and its silent-failure risk are unnecessary.

**Fix:**

```typescript
// D-17: Use fatal:false — preview bytes may be truncated mid-sequence; never throw on preview.
let text = "";
try {
  text = new TextDecoder("utf-8", { fatal: false }).decode(all);
} catch {
  // Swallow — preview text is best-effort
}
```

Remove the nested ISO-8859-1 try/catch entirely. The `{ fatal: false }` decoder handles all byte sequences without throwing.

---

### WR-02: `index.ts` comment falsely claims the `Body` opaque class type is re-exported; it is not  [WARNING]

**File:** `src/index.ts:23`

**Issue:** The comment reads:

```typescript
// Body type (declare class) is re-exported via body.ts which body.js's export { Body } carries
```

This is incorrect. In `body.ts`, the opaque `Body` class from `types.ts` is imported under the alias `BodyOpaque`:

```typescript
import type { Body as BodyOpaque } from "./types.js";
```

The name `Body` in `body.ts`'s export namespace is exclusively the factory `const` (value). When `index.ts` does `export { Body } from "./body.js"`, it re-exports the factory const and the **type of that const** (the factory namespace shape) — not the `declare class Body` from `types.ts`.

A consumer who writes:

```typescript
import type { Body } from "@sethlivingston/oneway-http";
```

receives the type of the factory namespace (`{ none(): ...; json(): ...; ... }`), not the opaque class. They cannot annotate a variable `let b: Body` where `Body` means "an opaque body instance" without a workaround such as `type Body = ReturnType<typeof Body.json>`.

This is a public API gap. `RequestSpec.body` is typed as `Body` (the opaque class), and consumers writing libraries or typed wrappers around `RequestSpec` need to name that type.

**Fix:** Add an explicit type re-export to `index.ts`:

```typescript
// Body value (factory methods: Body.none(), Body.json(), etc.)
export { Body } from "./body.js";

// Body opaque class type — needed for explicit annotations: body?: Body
export type { Body } from "./types.js";
```

TypeScript handles the value/type duality for the same name correctly under `verbatimModuleSyntax`.

---

### IR-01: `DecodeError { kind: "bodyReadFailed" }` is defined but never produced — dead type variant  [INFO]

**File:** `src/types.ts:38-39`

**Issue:**

```typescript
| { kind: "bodyReadFailed"; message: string }
```

This variant appears in `DecodeError` but no code path in `decode.ts` ever returns it. All stream errors escape as rejected promises (see CR-01). Until CR-01 is fixed, this variant is unreachable and will mislead Phase 5 integrators who may write exhaustive switch statements over `DecodeError.kind`.

**Fix:** Resolve by fixing CR-01 (at which point `bodyReadFailed` will be reachable) or, if intentionally deferred, add a `// TODO:` comment explaining it requires CR-01 first. Do not remove the variant — it belongs in the type.

---

## Files Reviewed

| File | Status |
|------|--------|
| `src/body.ts` | ✓ No issues |
| `src/decode.ts` | ⚠ CR-01, IR-01 |
| `src/index.ts` | ⚠ WR-02 |
| `src/preview.ts` | ⚠ WR-01 |
| `src/send.ts` | ✓ No issues |
| `src/types.ts` | ✓ No issues (IR-01 is a downstream symptom) |
| `tests/unit/body.test.ts` | ✓ No issues |
| `tests/unit/decode.test.ts` | ✓ No issues (stream-error path is not tested — `.todo` at line 197 acknowledges the gap) |
| `tests/unit/types.test.ts` | ✓ No issues |

---

_Reviewed: 2025-07-23T00:00:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
