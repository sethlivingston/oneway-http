# Phase 5: Response Matching + Decode Dispatch + Body Preview Integration — Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 6 (4 modified, 2 created)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types.ts` | model | — | `src/types.ts` (self — surgical edit) | exact |
| `src/response-matching.ts` | utility | request-response | `src/decode.ts` (pure utility, imports only from `types.ts`) | role-match |
| `src/preview.ts` | utility | transform / file-I/O | `src/preview.ts` (self — add pure overload alongside streaming fn) | exact |
| `src/decode.ts` | utility | file-I/O | `src/decode.ts` (self — export visibility change only) | exact |
| `src/send.ts` | service | request-response | `src/send.ts` (self — replace stub at lines 168–174) | exact |
| `tests/unit/response-matching.test.ts` | test | — | `tests/unit/decode.test.ts` (pure function unit tests) | exact |

---

## Pattern Assignments

### `src/types.ts` (model — surgical edit)

**Analog:** `src/types.ts` (self)

**Current `TaggedEntry` definition** (lines 78–83):
```typescript
export interface TaggedEntry<T = unknown, Tag extends string = string> {
  readonly tag: Tag;
  readonly phantom?: T; // type-only phantom field; never set at runtime
  readonly decode: unknown;
}
```

**Target pattern — add `DecoderLike` and change `decode` field:**
```typescript
// Add BEFORE TaggedEntry (types.ts must stay import-free; Response and DecodeError are both globals/local)
export interface DecoderLike {
  fn(response: Response): Promise<unknown | DecodeError>;
}

export interface TaggedEntry<T = unknown, Tag extends string = string> {
  readonly tag: Tag;
  readonly phantom?: T; // type-only phantom field; never set at runtime
  readonly decode: DecoderLike;
}
```

**Key constraints:**
- `types.ts` has zero imports (line 1 confirms: no import statements). `Response` is a browser global. `DecodeError` is already defined in the same file (lines 34–41).
- `Decoder<T>` in `decode.ts` has `readonly fn: DecoderFn<T>` where `DecoderFn<T> = (response: Response) => Promise<T | DecodeError>` — structurally assignable to `DecoderLike` with no cast needed.

---

### `src/response-matching.ts` (utility, request-response) — CREATE

**Analog:** `src/decode.ts`

**Imports pattern** (copy from `src/decode.ts` lines 1–4, adapted):
```typescript
// src/response-matching.ts — response map lookup; pure function, no I/O
// Dependency direction: (consumers) → response-matching.ts → types.ts

import type { ResponseMap, TaggedEntry } from "./types.js";
```

**Core pattern — `classOf()` helper (not exported) + `matchResponse()` pure function:**
```typescript
// classOf: must return a value that is a valid ResponseMap key (StatusMatcher)
// "1xx" | "2xx" | "3xx" | "4xx" | "5xx" — all of which are StatusMatcher union members
function classOf(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

// matchResponse: four-step lookup, first match wins, never pre-merges the two maps
// noUncheckedIndexedAccess: map[key] returns TaggedEntry | undefined — explicit guard required
export function matchResponse(
  status: number,
  requestMap: ResponseMap | undefined,
  clientMap: ResponseMap | undefined,
): TaggedEntry | null {
  const classKey = classOf(status);

  if (requestMap !== undefined) {
    const byExact = requestMap[status];
    if (byExact !== undefined) return byExact;
    const byClass = requestMap[classKey];
    if (byClass !== undefined) return byClass;
  }

  if (clientMap !== undefined) {
    const byExact = clientMap[status];
    if (byExact !== undefined) return byExact;
    const byClass = clientMap[classKey];
    if (byClass !== undefined) return byClass;
  }

  return null;
}
```

**Key constraints (from CONTEXT.md D-04 and RESEARCH.md):**
- Maps are **never pre-merged** — passing both separately is the only way to enforce two-tier precedence.
- `classOf()` is not exported (lives in same file only).
- `noUncheckedIndexedAccess` means `map[status]` returns `TaggedEntry | undefined`; must guard before use.
- Pure function — no HTTP calls, no mocks needed in tests.

---

### `src/preview.ts` (utility, transform) — MODIFY: add `previewFromBytes()`

**Analog:** `src/preview.ts` → `readBodyPreview()` (lines 9–83)

**Existing imports** (lines 1–4 — no change needed):
```typescript
// src/preview.ts — body preview streaming; extracted from send.ts (D-11)
// Dependency direction: send.ts → preview.ts → types.ts

import type { BodyPreview } from "./types.js";
```

**Existing streaming function signature** (lines 9–12):
```typescript
export async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> {
```

**TextDecoder pattern to copy** (lines 74–80 of `preview.ts`):
```typescript
// D-17: Use fatal:false — preview bytes may be truncated mid-sequence; never throw on preview.
// Replacement characters (U+FFFD) appear for incomplete/invalid sequences; still readable.
let text = "";
try {
  text = new TextDecoder("utf-8", { fatal: false }).decode(all);
} catch {
  // Swallow — preview text is best-effort
}

return { text, bytesRead, truncated };
```

**New `previewFromBytes()` — pure, no I/O, append after `readBodyPreview()`:**
```typescript
// previewFromBytes: pure function — derives BodyPreview from an already-buffered Uint8Array.
// Used in the decodeError path where the stream is already consumed by readBytes().
// PREV-03: TextDecoder must use { fatal: false } — same as readBodyPreview()
export function previewFromBytes(bytes: Uint8Array, maxBytes: number): BodyPreview {
  const truncated = bytes.length > maxBytes;
  const sliced = truncated ? bytes.slice(0, maxBytes) : bytes;
  const bytesRead = sliced.length;

  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  } catch {
    // Swallow — preview text is best-effort
  }

  return { text, bytesRead, truncated };
}
```

**Key constraints:**
- Must use `{ fatal: false }` on `TextDecoder` (PREV-03) — same as `readBodyPreview()`.
- Pure (no `async`, no stream access).
- `truncated` is `bytes.length > maxBytes`, not `sliced.length === maxBytes`.

---

### `src/decode.ts` (utility — export visibility change only)

**Analog:** `src/decode.ts` (self)

**Current `readBytes` declaration** (lines 19–21):
```typescript
async function readBytes(
  response: Response,
): Promise<Uint8Array<ArrayBuffer> | { kind: "bodyReadFailed"; message: string }> {
```

**Change:** Add `export` keyword only:
```typescript
export async function readBytes(
  response: Response,
): Promise<Uint8Array<ArrayBuffer> | { kind: "bodyReadFailed"; message: string }> {
```

**Return type guard pattern to note for callers** (lines 87–88 of `decode.ts`):
```typescript
const bytes = await readBytes(response);
if ("kind" in bytes) return bytes;   // ← guard for bodyReadFailed before using as Uint8Array
```

This guard pattern **must** be applied in `send.ts` after calling `readBytes()` before constructing `new Response(bytes)`.

---

### `src/send.ts` (service, request-response — replace stub)

**Analog:** `src/send.ts` (self — existing transport error classification + existing imports block)

**Existing imports** (lines 5–16) — pattern to extend:
```typescript
import type {
  ClientSpec,
  QueryValue,
  RequestSpec,
  SendResult,
  SendOptions,
  RequestError,
} from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";
import { serializeBody } from "./body.js";
import { readBodyPreview } from "./preview.js";
```

**Add these imports:**
```typescript
import { readBytes } from "./decode.js";
import { matchResponse } from "./response-matching.js";
import { previewFromBytes } from "./preview.js";
```
> Note: `previewFromBytes` and `readBodyPreview` are both from `"./preview.js"` — combine into one import statement.

**Transport error classification pattern to mirror** (lines 65–78 — duck-type on `.name`, not `instanceof`):
```typescript
function classifyTransportError(error: unknown): SendResult<never> {
  let name = "";
  if (error !== null && typeof error === "object" && "name" in error) {
    const n = error.name;
    if (typeof n === "string") name = n;
  }
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  if (name === "AbortError") {
    return { kind: "transportError", error: { kind: "aborted" } };
  }
  return { kind: "transportError", error: { kind: "network", cause: error } };
}
```

**Duck-type `isDecodeError()` helper — same file, not exported (mirrors `classifyTransportError` pattern):**
```typescript
// D-06: Duck-type on "kind" — never instanceof. All DecodeError variants have a string "kind".
// A valid decoded value will never be an object with a "kind" string matching a DecodeError variant.
const DECODE_ERROR_KINDS = new Set([
  "unexpectedBody", "emptyBody", "invalidJson",
  "schemaMismatch", "bodyReadFailed", "custom",
] as const);

function isDecodeError(v: unknown): v is import("./types.js").DecodeError {
  return (
    typeof v === "object" &&
    v !== null &&
    "kind" in v &&
    typeof (v as Record<string, unknown>)["kind"] === "string" &&
    DECODE_ERROR_KINDS.has((v as Record<string, unknown>)["kind"] as never)
  );
}
```

**Phase 3 stub to replace** (lines 168–174 of `send.ts`):
```typescript
// D-13, D-14: Phase 3 stub — ALL HTTP responses return unhandledStatus
return {
  kind: "unhandledStatus",
  status: response.status,
  headers: response.headers,
  preview,
};
```

**Replace with real dispatch (D-07 from CONTEXT.md):**
```typescript
const status = response.status;
const headers = response.headers;
const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192;

const match = matchResponse(status, spec.responses, clientSpec.responses);
if (match === null) {
  const preview = await readBodyPreview(response, maxBytes);
  return { kind: "unhandledStatus", status, headers, preview };
}

const bytes = await readBytes(response);
// readBytes() can return { kind: "bodyReadFailed" } — guard before using as Uint8Array
if ("kind" in bytes) {
  const preview = previewFromBytes(new Uint8Array(0), maxBytes);
  return { kind: "decodeError", status, headers, error: bytes, preview };
}

const syntheticResponse = new Response(bytes);
let decoded: unknown;
try {
  decoded = await match.decode.fn(syntheticResponse);
} catch (e) {
  const preview = previewFromBytes(bytes, maxBytes);
  return {
    kind: "decodeError",
    status,
    headers,
    error: { kind: "bodyReadFailed", message: String(e) },
    preview,
  };
}

if (isDecodeError(decoded)) {
  const preview = previewFromBytes(bytes, maxBytes);
  return { kind: "decodeError", status, headers, error: decoded, preview };
}

// as unknown as R: the single principled cast in the dispatch path (D-07)
// The compiler cannot prove { tag, body } satisfies R (generic phantom), but this branch
// is only reachable via TaggedEntry<T> whose T is R's body. Double-cast required by
// no-unsafe-type-assertion rule.
return { kind: "response", response: { tag: match.tag, body: decoded } as unknown as R };
```

**Key constraints:**
- `maxBytes` line already exists in Phase 3 stub as `const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192` — do NOT re-declare; consolidate.
- Remove the `const preview = await readBodyPreview(response, maxBytes)` line that currently appears at line 166 (before the stub) — it is subsumed into the dispatch logic.
- The outer `catch (error)` block at line 175 (`classifyTransportError(error)`) is retained unchanged — it catches any throw from `readBodyPreview()` or `readBytes()` during transport-level failures.
- No-throw contract: all decoder exceptions caught in the inner `try/catch` and returned as `decodeError`.

---

### `tests/unit/response-matching.test.ts` (test) — CREATE

**Analog:** `tests/unit/decode.test.ts`

**Imports pattern** (lines 1–3 of `decode.test.ts`):
```typescript
import { describe, it, expect } from "vitest";
import { Decode } from "../../src/decode.js";
import type { DecodeError } from "../../src/types.js";
```

**Adapted imports for response-matching tests:**
```typescript
import { describe, it, expect } from "vitest";
import { matchResponse } from "../../src/response-matching.js";
import type { ResponseMap, TaggedEntry } from "../../src/types.js";
```

**Test structure pattern** (from `decode.test.ts` — `describe` blocks keyed to requirement IDs):
```typescript
describe("RESP-01: matchResponse() — request exact match takes priority", () => {
  it("returns requestMap entry on exact status match", () => {
    // arrange
    const entry: TaggedEntry = { tag: "user", decode: { fn: async () => undefined } };
    const requestMap: ResponseMap = { 200: entry };
    // act
    const result = matchResponse(200, requestMap, undefined);
    // assert
    expect(result).toBe(entry);
  });
});
```

**Pattern for testing two-tier precedence (hard constraint from D-04):**
```typescript
describe("RESP-01: two-tier precedence — requestMap always wins over clientMap", () => {
  it("requestMap exact beats clientMap exact for same status", () => {
    const reqEntry: TaggedEntry = { tag: "fromRequest", decode: { fn: async () => undefined } };
    const cliEntry: TaggedEntry = { tag: "fromClient", decode: { fn: async () => undefined } };
    const result = matchResponse(200, { 200: reqEntry }, { 200: cliEntry });
    expect(result).toBe(reqEntry);
  });

  it("requestMap class beats clientMap exact for same status", () => {
    const reqEntry: TaggedEntry = { tag: "fromRequest", decode: { fn: async () => undefined } };
    const cliEntry: TaggedEntry = { tag: "fromClient", decode: { fn: async () => undefined } };
    const result = matchResponse(201, { "2xx": reqEntry }, { 201: cliEntry });
    expect(result).toBe(reqEntry);
  });
});
```

**Pattern for null return (RESP-02):**
```typescript
describe("RESP-02: matchResponse() — returns null for unmatched status", () => {
  it("returns null when no map has the status or its class", () => {
    const result = matchResponse(418, { 200: { tag: "ok", decode: { fn: async () => undefined } } }, undefined);
    expect(result).toBeNull();
  });

  it("returns null when both maps are undefined", () => {
    expect(matchResponse(200, undefined, undefined)).toBeNull();
  });
});
```

**Test file structure rules (from decode.test.ts pattern):**
- No `beforeEach` / `afterEach` — pure function tests need no setup/teardown.
- `describe` label format: `"RESP-NN: brief description"` — matches requirement IDs from RESEARCH.md.
- Each `it` is synchronous (pure functions, no `async` needed unless testing the decode fn itself).
- Use `expect(result).toBe(entry)` (reference equality) to confirm the exact `TaggedEntry` object is returned, not a copy.

---

## Shared Patterns

### `noUncheckedIndexedAccess` Guard
**Source:** `src/decode.ts` lines 87–88 and `src/send.ts` pattern
**Apply to:** `src/response-matching.ts` (all `map[key]` access), `src/send.ts` (`readBytes` result)
```typescript
// Pattern: never use the indexed value without an undefined check
const entry = map[key];
if (entry !== undefined) return entry;

// For readBytes:
const bytes = await readBytes(response);
if ("kind" in bytes) return bytes; // guard before treating as Uint8Array
```

### Duck-Type Checks (not instanceof)
**Source:** `src/send.ts` lines 66–69 (`classifyTransportError`), `src/decode.ts` line 55 comment
**Apply to:** `isDecodeError()` helper in `src/send.ts`, any DecodeError discrimination
```typescript
// CRITICAL: duck-type .name — do NOT use instanceof Error, which fails across VM realms
// Same principle applies to DecodeError — duck-type on "kind", not instanceof
if (typeof v === "object" && v !== null && "kind" in v && ...) { ... }
```

### Synthetic Response Pattern
**Source:** `src/decode.ts` lines 160–161 (`Decode.optional`)
**Apply to:** decode dispatch in `src/send.ts`
```typescript
// Already used in decode.ts for the optional() decoder:
const syntheticResponse = new Response(bytes);
return await inner.fn(syntheticResponse);
```

### Import Path Convention
**Source:** All `src/*.ts` files
**Apply to:** All new files
```typescript
// Always use ".js" extension in imports (NodeNext module resolution)
import type { TaggedEntry, ResponseMap } from "./types.js";
import { readBytes } from "./decode.js";
import { matchResponse } from "./response-matching.js";
import { previewFromBytes, readBodyPreview } from "./preview.js";
```

### TextDecoder for Preview
**Source:** `src/preview.ts` lines 74–80
**Apply to:** `previewFromBytes()` in `src/preview.ts`
```typescript
// Always fatal: false — preview bytes may be truncated mid-UTF-8 sequence
text = new TextDecoder("utf-8", { fatal: false }).decode(all);
```

### Reader `.cancel()` in `finally`
**Source:** `src/preview.ts` lines 58–63, `src/decode.ts` lines 37–40
**Apply to:** Any new stream-reading code (not needed in Phase 5 new code — `previewFromBytes` is pure)
```typescript
} finally {
  await reader.cancel().catch(() => {
    // Swallow cancel errors — stream may already be errored/closed
  });
}
```

---

## No Analog Found

All files have close analogs in the codebase. No entries in this section.

---

## Metadata

**Analog search scope:** `src/`, `tests/unit/`
**Files scanned:** `src/types.ts`, `src/decode.ts`, `src/preview.ts`, `src/send.ts`, `tests/unit/decode.test.ts`, `tests/unit/send.test.ts`
**Pattern extraction date:** 2026-05-06
