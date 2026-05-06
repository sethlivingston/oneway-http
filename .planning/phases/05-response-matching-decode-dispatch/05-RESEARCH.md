# Phase 5: Response Matching + Decode Dispatch + Body Preview Integration — Research

**Researched:** 2026-05-06
**Domain:** TypeScript HTTP client — response matching, decode dispatch, preview integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: `DecoderLike` interface instead of `decode: unknown` cast**
- `TaggedEntry.decode` changes from `unknown` to `DecoderLike` — a structural interface defined in `types.ts`:
  ```ts
  export interface DecoderLike {
    fn(response: Response): Promise<unknown | DecodeError>;
  }
  ```
- `Decoder<T>` is structurally assignable to `DecoderLike` without any cast at the definition site.
- At dispatch, `entry.decode.fn(response)` returns `Promise<unknown | DecodeError>` — no cast required, no lint violations.
- `types.ts` must stay import-free. `Response` is a browser global; `DecodeError` is already in `types.ts`. ✓

**D-02: Keep `InferResponseUnion<M>` shape as `{ tag, body }` — no changes to types.ts for this decision**
- `InferResponseUnion<M>` → `{ tag: Tag; body: T }` is the correct shape; retained as-is.
- Phase 7's `Send.match()` is built directly on `tag` discrimination.

**D-03: `previewFromBytes()` in `preview.ts`**
- Add a second export:
  ```ts
  export function previewFromBytes(bytes: Uint8Array, maxBytes: number): BodyPreview
  ```
- Pure function — no I/O, no stream access. Derives preview from an already-buffered `Uint8Array`.

**D-04: `matchResponse()` — pure function, two maps, no pre-merge**
- Signature: `matchResponse(status: number, requestMap: ResponseMap | undefined, clientMap: ResponseMap | undefined): TaggedEntry | null`
- Four-step lookup (first match wins): `requestMap[status]` → `requestMap[classOf(status)]` → `clientMap[status]` → `clientMap[classOf(status)]`
- Returns `null` for `unhandledStatus`.
- `classOf(status: number): string` — `Math.floor(status / 100) + "xx"` — lives in same file, not exported.
- Maps are **never pre-merged**. Hard constraint.

**D-05: `unhandledStatus` preview — stream still available, use `readBodyPreview()`**
- When `matchResponse()` returns `null`, stream is not yet read. Use existing `readBodyPreview(response, maxBytes)`.

**D-06: `decodeError` — duck-type on `"kind"` field, not instanceof**
- `entry.decode.fn(response)` returns `Promise<T | DecodeError>`. Duck-type on `"kind"` to distinguish.
- If `decode.fn()` itself throws (unexpected), wrap in `{ kind: "bodyReadFailed", message: String(e) }`.

**D-07: Wiring in `send.ts` — replace Phase 3 stub (lines 168–174)**
- See dispatch pseudocode in CONTEXT.md. The `as R` cast is `as unknown as R` (double-cast through unknown).

**D-08: Export `readBytes` from `decode.ts`, import in `send.ts`**
- Dependency direction: `send.ts → decode.ts → types.ts` — no circular import. ✓

### the agent's Discretion

None specified — all implementation decisions are locked via D-01 through D-08.

### Deferred Ideas (OUT OF SCOPE)

- Retry loop → Phase 6
- `Send.match()` / `Send.Matcher<R,T>` helper → Phase 7
- Streaming request bodies → explicitly excluded from v1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESP-01 | `ResponseMap` matched in 4-step precedence: request exact → request class → client exact → client class | `matchResponse()` pure function in `response-matching.ts` implements the four-step lookup with two separate maps |
| RESP-02 | No `default` matcher — unmatched statuses always surface as `unhandledStatus` | `matchResponse()` returns `null` for no-match; dispatch branch returns `unhandledStatus` |
| RESP-03 | `unhandledStatus` result includes `{ status, headers, preview: BodyPreview }` | Existing `readBodyPreview()` called on the unread stream; `response.headers` and `response.status` forwarded |
| RESP-04 | `decodeError` result includes `{ status, headers, error: DecodeError, preview: BodyPreview }` | `previewFromBytes()` called on already-buffered bytes; `isDecodeError()` duck-type check |
| PREV-01 | `BodyPreview` reads from `response.body` ReadableStream with byte cap — NOT via `Response.clone()`; reader cancelled in `finally` | Already implemented in `readBodyPreview()` (Phase 3); `previewFromBytes()` is pure (no stream) — applies only on decode-error path |
| PREV-02 | `bodyPreviewBytes` configurable via `client.diagnostics`; defaults to `8192` | `maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192` already in send.ts; passed through to both `readBodyPreview()` and `previewFromBytes()` |
| PREV-03 | `BodyPreview.text` decoded from bytes as UTF-8 with `TextDecoder` in streaming mode (no split codepoints) | `readBodyPreview()` already uses `new TextDecoder("utf-8", { fatal: false })`; `previewFromBytes()` must use same pattern |
</phase_requirements>

---

## Summary

Phase 5 connects four existing pieces — `ResponseMap`, `Decoder<T>`, `readBodyPreview()`, and the Phase 3 stub in `send.ts` — into a complete request → match → decode → typed result pipeline. The work is primarily surgical edits to existing files plus one new file (`response-matching.ts`).

The locked decisions from CONTEXT.md define the implementation precisely. The main technical challenge is TypeScript correctness: `noUncheckedIndexedAccess` means every `map[key]` lookup returns `T | undefined` and requires an explicit guard; `no-unsafe-type-assertion` means the success-path cast must use the `as unknown as R` double-cast pattern; `classOf()` must return a `StatusMatcher`-compatible type to be usable as a map key.

The biggest non-obvious pitfall is that `readBytes()` can return `{ kind: "bodyReadFailed" }` (not just `Uint8Array`) — the dispatch path in send.ts must handle this before constructing the synthetic `Response`. The CONTEXT.md D-07 pseudocode elides this guard; the plan must make it explicit.

**Primary recommendation:** Implement in three sequential plans — (1) foundational type additions/exports, (2) `response-matching.ts` with pure-function tests, (3) replace the Phase 3 stub in `send.ts` and extend the existing test file.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Response map lookup algorithm | Library core (`response-matching.ts`) | — | Pure function, testable in isolation, no HTTP concerns |
| Decode dispatch + result shaping | Transport core (`send.ts`) | `decode.ts`, `preview.ts` | Orchestrates after fetch; owns the `SendResult<R>` shape |
| `BodyPreview` for decode errors | `preview.ts` (previewFromBytes) | `send.ts` (caller) | Preview logic isolated in preview.ts; send.ts holds the bytes |
| `BodyPreview` for unhandled statuses | `preview.ts` (readBodyPreview) | `send.ts` (caller) | Stream still open; existing stream-reading function applies |
| `DecoderLike` structural seam | `types.ts` | `decode.ts` | Keeps dependency direction intact; types.ts stays import-free |

---

## Standard Stack

No new packages are needed. Phase 5 uses only the existing project dependencies.

[VERIFIED: codebase grep] — All required APIs (`Response`, `Uint8Array`, `TextDecoder`) are browser/Node globals available in both runtime targets.

### Key Existing Assets

| Asset | Location | Phase 5 Role |
|-------|----------|-------------|
| `Decoder<T>` class with `.fn` property | `src/decode.ts` | Structurally satisfies new `DecoderLike` interface |
| `readBytes()` | `src/decode.ts:19` (currently unexported) | Called in send.ts dispatch to buffer the body before decoding |
| `readBodyPreview()` | `src/preview.ts` | Used on `unhandledStatus` path (stream not yet consumed) |
| `InferResponseUnion<M>` | `src/types.ts:86` | Already produces `{ tag: Tag; body: T }` — no changes needed |
| `SendResult<R>` | `src/types.ts:60` | Already has all four fixed variants + response variant — no changes needed |
| `TaggedEntry<T, Tag>` | `src/types.ts:78` | `decode` field changes from `unknown` → `DecoderLike` |

---

## Architecture Patterns

### System Architecture Diagram (Phase 5 additions)

```
HTTP Response
      │
      ▼
matchResponse(status, requestMap, clientMap)
      │
  ┌───┴──────────────┐
  │ null              │ TaggedEntry
  ▼                  ▼
readBodyPreview()  readBytes(response)
  │                  │
  │              ┌───┴─────────────────────┐
  │              │ bodyReadFailed           │ Uint8Array
  │              ▼                         ▼
  │         decodeError result     new Response(bytes)
  │              ▲                         │
  │              │                   decode.fn(syntheticResponse)
  │              │                         │
  │         ┌────┴───────────────┐         ├─ isDecodeError? ──► previewFromBytes()
  │         │                   │                                       │
  │    DecodeError          success value                               ▼
  │         └────────────────────┘                              decodeError result
  ▼
unhandledStatus result                                     ◄── response result { tag, body }
```

### Recommended Project Structure (Phase 5 additions)

```
src/
├── types.ts             # + DecoderLike interface; TaggedEntry.decode: DecoderLike
├── decode.ts            # + export readBytes
├── preview.ts           # + export previewFromBytes()
├── response-matching.ts # NEW: matchResponse() + classOf() (unexported)
└── send.ts              # Replace Phase 3 stub (lines 168-174) with dispatch
tests/unit/
├── response-matching.test.ts   # NEW: pure-function tests for matchResponse()
└── send.test.ts                # EXTEND: add response/decodeError/unhandledStatus tests
```

---

## Pattern 1: `DecoderLike` structural interface

**What:** A minimal interface in `types.ts` that `Decoder<T>` satisfies structurally — allowing `TaggedEntry.decode` to be callable without importing `Decoder<T>` into `types.ts`.

**Why it must be in `types.ts`:** `types.ts` has zero imports (architectural constraint). `Response` is a browser global (not imported). `DecodeError` is already defined in `types.ts`. `DecoderLike` only needs those two, so it stays import-free.

```typescript
// src/types.ts — add after DecodeError definition
export interface DecoderLike {
  fn(response: Response): Promise<unknown | DecodeError>;
}

// In TaggedEntry — change decode field:
export interface TaggedEntry<T = unknown, Tag extends string = string> {
  readonly tag: Tag;
  readonly phantom?: T;
  readonly decode: DecoderLike;  // was: unknown
}
```

[VERIFIED: codebase — types.ts line 78-82, decode.ts Decoder class line 8-16]

---

## Pattern 2: `classOf()` return type — must be `StatusMatcher`, not `string`

**The problem:** `classOf(200)` uses template literal arithmetic: `` `${Math.floor(200 / 100)}xx` `` which TypeScript infers as `string`. But `ResponseMap` is `Partial<Record<StatusMatcher, TaggedEntry>>` — indexing with a `string` key fails the `noUncheckedIndexedAccess` constraint at the type level.

**The solution:** Declare `classOf()` to return `StatusMatcher` and use an `as` cast on the template literal (acceptable single-location narrowing):

```typescript
// src/response-matching.ts
import type { ResponseMap, StatusMatcher, TaggedEntry } from "./types.js";

function classOf(status: number): StatusMatcher {
  return `${Math.floor(status / 100)}xx` as StatusMatcher;
}

export function matchResponse(
  status: number,
  requestMap: ResponseMap | undefined,
  clientMap: ResponseMap | undefined,
): TaggedEntry | null {
  // Step 1: request exact
  const r1 = requestMap?.[status as StatusMatcher];
  if (r1 !== undefined) return r1;
  // Step 2: request class
  const r2 = requestMap?.[classOf(status)];
  if (r2 !== undefined) return r2;
  // Step 3: client exact
  const c1 = clientMap?.[status as StatusMatcher];
  if (c1 !== undefined) return c1;
  // Step 4: client class
  const c2 = clientMap?.[classOf(status)];
  if (c2 !== undefined) return c2;
  return null;
}
```

**Why `status as StatusMatcher`:** `status` is `number`, and `StatusMatcher` includes `number`, so this is a narrowing-compatible cast. The `@sethlivingston/eslint-plugin-typescript-narrows` lint preset permits narrowing casts (number → StatusMatcher); this is narrower, not wider.

[VERIFIED: codebase — types.ts line 15 `StatusMatcher = number | "1xx" | "2xx" | "3xx" | "4xx" | "5xx"`, types.ts line 84 `ResponseMap = Partial<Record<StatusMatcher, TaggedEntry>>`]

---

## Pattern 3: `readBytes` failure handling in dispatch path

**Critical non-obvious behavior:** `readBytes()` returns `Uint8Array<ArrayBuffer> | { kind: "bodyReadFailed"; message: string }`. The D-07 pseudocode in CONTEXT.md shows passing `bytes` to `new Response(bytes)` without first guarding against the failure case. **This guard is required.**

```typescript
// In send.ts dispatch — after matchResponse returns non-null:
const bytes = await readBytes(response);
if ("kind" in bytes) {
  // Stream read failed; stream already consumed — preview unavailable
  return {
    kind: "decodeError",
    status: response.status,
    headers: response.headers,
    error: bytes,  // { kind: "bodyReadFailed", message }
    preview: { text: "", bytesRead: 0, truncated: false },
  };
}
// bytes is Uint8Array from here
const syntheticResponse = new Response(bytes);
```

[VERIFIED: codebase — decode.ts lines 19-48 shows readBytes() return type includes `{ kind: "bodyReadFailed"; message: string }`]

---

## Pattern 4: `isDecodeError()` duck-type helper

**What:** A private helper in `send.ts` that checks whether a value returned by `decode.fn()` is a `DecodeError` (rather than a successfully decoded value).

**Why duck-typing:** Per the no-instanceof-across-modules rule and the no-throw contract. `DecodeError` is a union of plain object literals, not a class.

```typescript
// In send.ts — private helper, not exported
const DECODE_ERROR_KINDS = new Set([
  "unexpectedBody",
  "emptyBody",
  "invalidJson",
  "schemaMismatch",
  "bodyReadFailed",
  "custom",
] as const);

function isDecodeError(v: unknown): v is DecodeError {
  return (
    typeof v === "object" &&
    v !== null &&
    "kind" in v &&
    typeof (v as Record<string, unknown>)["kind"] === "string" &&
    DECODE_ERROR_KINDS.has((v as Record<string, unknown>)["kind"] as string)
  );
}
```

**Why enumerate known kinds:** A check of `"kind" in v` alone would match any response value that happens to have a `kind` field (e.g., a successfully decoded `{ kind: "user" }` object). Enumerating the exhaustive `DecodeError` kind set prevents false positives. The set must stay synchronized with the `DecodeError` union in `types.ts`.

[VERIFIED: codebase — types.ts lines 34-40 enumerates all 6 DecodeError kinds]

---

## Pattern 5: `previewFromBytes()` — pure synchronous preview from buffer

```typescript
// src/preview.ts — add as second export
export function previewFromBytes(bytes: Uint8Array, maxBytes: number): BodyPreview {
  if (maxBytes <= 0) {
    return { text: "", bytesRead: 0, truncated: bytes.length > 0 };
  }
  const sliced = bytes.length > maxBytes ? bytes.slice(0, maxBytes) : bytes;
  const truncated = bytes.length > maxBytes;
  let text = "";
  try {
    // PREV-03: fatal:false — preview bytes may be truncated mid-sequence; never throw
    text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  } catch {
    // Swallow — preview text is best-effort
  }
  return { text, bytesRead: sliced.length, truncated };
}
```

**Why synchronous:** No stream, no I/O — bytes are already in memory. `BodyPreview` can be returned synchronously.

**`fatal: false`:** Required by PREV-03. Matches the existing pattern in `readBodyPreview()` (preview.ts line 77).

[VERIFIED: codebase — preview.ts line 77 `new TextDecoder("utf-8", { fatal: false })`]

---

## Pattern 6: The `as unknown as R` cast — success path in dispatch

**What:** When decoding succeeds, `send.ts` must return `{ kind: "response", response: { tag: match.tag, body: decoded } }`. TypeScript cannot prove `{ tag: string, body: unknown }` satisfies the generic `R` (which is `InferResponseUnion<M>`), so a cast is required.

**The rule:** Per `no-unsafe-type-assertion`, a direct `as R` is a "widening assertion" — forbidden. The required pattern is `as unknown as R` (double-cast through `unknown`).

```typescript
return {
  kind: "response",
  response: { tag: match.tag, body: decoded } as unknown as R,
};
```

**Why it's principled:** The only code path that reaches this return is one where `match` is a `TaggedEntry<T, Tag>` whose `T` IS the `R` union component for this particular `tag`. TypeScript cannot prove this statically because `R` is erased, but the invariant holds structurally. This is the single intentional cast in the dispatch path — it must NOT be expanded into a pattern.

[VERIFIED: codebase — types.ts lines 60-76 `SendResult<R>` shape; CONTEXT.md D-07 "the `as R` cast is safe here"]

---

## Pattern 7: Full dispatch replacement in `send.ts`

Replace lines 168–174 (Phase 3 stub) with:

```typescript
// src/send.ts — REPLACE Phase 3 stub
const match = matchResponse(response.status, spec.responses, clientSpec.responses);
const maxBytes = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192;

if (match === null) {
  const preview = await readBodyPreview(response, maxBytes);
  return {
    kind: "unhandledStatus",
    status: response.status,
    headers: response.headers,
    preview,
  };
}

const bytes = await readBytes(response);
if ("kind" in bytes) {
  // bodyReadFailed: stream consumed, preview unavailable
  return {
    kind: "decodeError",
    status: response.status,
    headers: response.headers,
    error: bytes,
    preview: { text: "", bytesRead: 0, truncated: false },
  };
}

const syntheticResponse = new Response(bytes);
let decoded: unknown;
try {
  decoded = await match.decode.fn(syntheticResponse);
} catch (e) {
  const preview = previewFromBytes(bytes, maxBytes);
  return {
    kind: "decodeError",
    status: response.status,
    headers: response.headers,
    error: { kind: "bodyReadFailed", message: String(e) },
    preview,
  };
}

if (isDecodeError(decoded)) {
  const preview = previewFromBytes(bytes, maxBytes);
  return {
    kind: "decodeError",
    status: response.status,
    headers: response.headers,
    error: decoded,
    preview,
  };
}

return {
  kind: "response",
  response: { tag: match.tag, body: decoded } as unknown as R,
};
```

**Note on `maxBytes` relocation:** The existing Phase 3 stub computes `maxBytes` on line 165 before `readBodyPreview`. After replacement, `maxBytes` is needed for both paths. Move the `const maxBytes = ...` line to just before the `matchResponse()` call (removing the existing line 165 `const maxBytes` and existing line 166 `const preview = await readBodyPreview(...)` which are part of the stub).

[VERIFIED: codebase — send.ts lines 159-181 full context]

---

## Pattern 8: New imports in `send.ts`

```typescript
// Add to existing imports in src/send.ts
import { readBytes } from "./decode.js";
import { readBodyPreview, previewFromBytes } from "./preview.js";
import { matchResponse } from "./response-matching.js";
import type { DecodeError } from "./types.js";
```

**Note:** `readBodyPreview` is already imported (line 16). The import needs to be extended to also import `previewFromBytes`. `readBytes` and `matchResponse` are new. `DecodeError` is needed for the `isDecodeError` type guard.

[VERIFIED: codebase — send.ts lines 5-16 existing imports]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status class computation | A lookup table or switch statement | `Math.floor(status / 100) + "xx"` (one line) | No complexity warranted |
| Body buffering | Custom stream accumulation | `readBytes()` from `decode.ts` (already implemented) | Already handles chunking, cancellation, error cases |
| Preview from stream | Any new stream reader | `readBodyPreview()` from `preview.ts` | Already handles truncation detection, UTF-8 decode, signal wiring |
| Preview from buffer | Stream clone or re-read | `previewFromBytes()` (new, pure) | Avoids double-reading; pure function is simpler and testable |

---

## Common Pitfalls

### Pitfall 1: `readBytes` failure not guarded before `new Response(bytes)`

**What goes wrong:** If `readBytes()` returns `{ kind: "bodyReadFailed" }`, passing it to `new Response(bytes)` constructs a Response with a plain object as body — `decode.fn()` will then read garbage bytes.

**Why it happens:** The D-07 pseudocode in CONTEXT.md elides this check for brevity.

**How to avoid:** Check `"kind" in bytes` immediately after `await readBytes()` and return a `decodeError` early. Pattern 3 above shows the guard.

**Warning signs:** Tests decode with garbage bytes; `Decode.json()` returns `invalidJson` when the HTTP body was valid JSON.

---

### Pitfall 2: `classOf()` returns `string` — not directly usable as `ResponseMap` key

**What goes wrong:** TypeScript rejects `map[classOf(status)]` because `classOf` returns `string`, but `ResponseMap` keys are `StatusMatcher`.

**Why it happens:** Template literal expressions (`${n}xx`) have type `string`, not the specific union member.

**How to avoid:** Declare `classOf` to return `StatusMatcher` and apply `as StatusMatcher` at the return site. See Pattern 2.

**Warning signs:** TypeScript error on `requestMap?.[classOf(status)]` — type `string` is not assignable to `StatusMatcher`.

---

### Pitfall 3: `isDecodeError` only checks `"kind" in v` — false positive on `{ kind: "user" }`

**What goes wrong:** A successfully decoded API response shaped like `{ kind: "user", ... }` would be misidentified as a `DecodeError`, causing an incorrect `decodeError` result.

**Why it happens:** The spec says decoders return typed values and never objects with `DecodeError` kind strings — but callers may have API responses with `kind` fields.

**How to avoid:** Always enumerate the exhaustive `DecodeError` kind set in `isDecodeError`. See Pattern 4.

**Warning signs:** A test with a `Decode.json()` decoder for a response body `{ "kind": "user" }` returns `{ kind: "decodeError" }` instead of `{ kind: "response" }`.

---

### Pitfall 4: `as R` instead of `as unknown as R` on the success path

**What goes wrong:** ESLint `no-unsafe-type-assertion` rule blocks direct `as R` where `R` is a generic parameter. The build fails with a lint error.

**Why it happens:** Direct generic casts are flagged as unsafe; the double-cast through `unknown` is the established workaround in this codebase.

**How to avoid:** Always use `as unknown as R` at the success path return. See Pattern 6.

**Warning signs:** `npm run lint` fails with an "unsafe type assertion" error on the response return.

---

### Pitfall 5: `maxBytes` line not relocated — produces compile error or stale value

**What goes wrong:** The Phase 3 stub computes `const maxBytes` and immediately calls `readBodyPreview()` on line 165-166. After replacement, the `maxBytes` const must remain but the `readBodyPreview()` call on line 166 is removed. Leaving the original `const preview = await readBodyPreview(...)` line (166) produces an unused variable or duplicate call.

**Why it happens:** The stub calls `readBodyPreview` eagerly for all responses; the new dispatch delays it to specific branches.

**How to avoid:** Remove lines 165-174 entirely and replace with the full dispatch block (Pattern 7). Do not attempt a partial edit of the stub.

---

### Pitfall 6: `noUncheckedIndexedAccess` — forgetting `undefined` guard after map lookup

**What goes wrong:** TypeScript error "Object is possibly undefined" when using `entry.decode.fn(...)` without a preceding `if (entry !== undefined)` guard.

**Why it happens:** `ResponseMap` is `Partial<Record<...>>`. With `noUncheckedIndexedAccess`, every index access returns `T | undefined`.

**How to avoid:** The `matchResponse()` function returns `TaggedEntry | null` — all undefined-ness is resolved inside `matchResponse`. At the call site in `send.ts`, the null check on `match` covers this. Inside `matchResponse` itself, each `r1/r2/c1/c2` lookup must be followed by `if (rN !== undefined) return rN`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:node` |
| Full suite command | `npm run test` (node + chromium + firefox + webkit) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESP-01 | 4-step match precedence | unit | `npm run test:node -- --reporter=verbose tests/unit/response-matching.test.ts` | ❌ Wave 0 |
| RESP-02 | No match → `unhandledStatus` | unit | `npm run test:node -- --reporter=verbose tests/unit/response-matching.test.ts` | ❌ Wave 0 |
| RESP-03 | `unhandledStatus` includes `preview` | unit | `npm run test:node -- --reporter=verbose tests/unit/send.test.ts` | ✅ (extend) |
| RESP-04 | `decodeError` includes `preview` | unit | `npm run test:node -- --reporter=verbose tests/unit/send.test.ts` | ✅ (extend) |
| PREV-01 | Stream-based preview, reader cancelled in `finally` | unit | (covered by existing `readBodyPreview` tests from Phase 3) | ✅ |
| PREV-02 | `bodyPreviewBytes` defaults to 8192 | unit | `npm run test:node -- --reporter=verbose tests/unit/send.test.ts` | ✅ (extend) |
| PREV-03 | UTF-8 `fatal:false` in `previewFromBytes` | unit | `npm run test:node -- --reporter=verbose tests/unit/send.test.ts` | ✅ (extend) |

### Sampling Rate

- **Per task commit:** `npm run test:node`
- **Per wave merge:** `npm run test` (all four browser projects)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/response-matching.test.ts` — covers RESP-01, RESP-02; pure function, no HTTP mocks needed

---

## Code Examples

### Complete `matchResponse()` implementation

```typescript
// src/response-matching.ts
// Source: CONTEXT.md D-04, verified against types.ts ResponseMap + StatusMatcher

import type { ResponseMap, StatusMatcher, TaggedEntry } from "./types.js";

function classOf(status: number): StatusMatcher {
  return `${Math.floor(status / 100)}xx` as StatusMatcher;
}

export function matchResponse(
  status: number,
  requestMap: ResponseMap | undefined,
  clientMap: ResponseMap | undefined,
): TaggedEntry | null {
  const r1 = requestMap?.[status as StatusMatcher];
  if (r1 !== undefined) return r1;
  const r2 = requestMap?.[classOf(status)];
  if (r2 !== undefined) return r2;
  const c1 = clientMap?.[status as StatusMatcher];
  if (c1 !== undefined) return c1;
  const c2 = clientMap?.[classOf(status)];
  if (c2 !== undefined) return c2;
  return null;
}
```

### Minimal `previewFromBytes()` implementation

```typescript
// src/preview.ts — second export
// Source: CONTEXT.md D-03, preview.ts pattern for readBodyPreview

export function previewFromBytes(bytes: Uint8Array, maxBytes: number): BodyPreview {
  if (maxBytes <= 0) {
    return { text: "", bytesRead: 0, truncated: bytes.length > 0 };
  }
  const limited = bytes.length > maxBytes;
  const sliced = limited ? bytes.slice(0, maxBytes) : bytes;
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  } catch {
    // Swallow — preview text is best-effort
  }
  return { text, bytesRead: sliced.length, truncated: limited };
}
```

### `response-matching.test.ts` skeleton

```typescript
// tests/unit/response-matching.test.ts
import { describe, it, expect } from "vitest";
import { matchResponse } from "../../src/response-matching.js";
import { Decode } from "../../src/decode.js";

describe("RESP-01: matchResponse() 4-step precedence", () => {
  it("prefers requestMap exact over requestMap class", () => {
    const entry200 = Decode.json().as("exact");
    const entry2xx = Decode.json().as("class");
    const result = matchResponse(200, { 200: entry200, "2xx": entry2xx }, undefined);
    expect(result?.tag).toBe("exact");
  });

  it("prefers requestMap class over clientMap exact", () => {
    const req2xx = Decode.json().as("reqClass");
    const cli200 = Decode.json().as("cliExact");
    const result = matchResponse(200, { "2xx": req2xx }, { 200: cli200 });
    expect(result?.tag).toBe("reqClass");
  });

  it("prefers clientMap exact over clientMap class", () => {
    const cli200 = Decode.json().as("cliExact");
    const cli2xx = Decode.json().as("cliClass");
    const result = matchResponse(200, undefined, { 200: cli200, "2xx": cli2xx });
    expect(result?.tag).toBe("cliExact");
  });

  it("returns null when no map has a match", () => {
    const result = matchResponse(404, { 200: Decode.json().as("ok") }, undefined);
    expect(result).toBeNull();
  });
});

describe("RESP-02: matchResponse() unhandledStatus cases", () => {
  it("returns null for empty maps", () => {
    expect(matchResponse(200, {}, {})).toBeNull();
  });

  it("returns null for undefined maps", () => {
    expect(matchResponse(200, undefined, undefined)).toBeNull();
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 3 stub: ALL responses → `unhandledStatus` | Real dispatch: match → decode → typed result | Phase 5 | First working end-to-end path |
| `TaggedEntry.decode: unknown` (requires cast at use site) | `TaggedEntry.decode: DecoderLike` (callable directly) | Phase 5 | Eliminates all casts from dispatch; lint-clean |
| `readBytes` unexported | `export function readBytes` | Phase 5 | Enables `send.ts` to buffer body for decode |

**Deprecated/outdated after Phase 5:**
- Phase 3 comment `// D-13, D-14: Phase 3 stub — ALL HTTP responses return unhandledStatus` is removed with the stub.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `classOf(status)` with `as StatusMatcher` is accepted by `@sethlivingston/eslint-plugin-typescript-narrows` as a permissible narrowing cast (not an "unsafe" assertion) | Pattern 2 | Lint failure — would need to use a Map/switch lookup instead |
| A2 | `new Response(bytes)` where `bytes` is `Uint8Array` creates a valid body for decoders — consistent across Node 24 + all browser targets | Pattern 3/7 | Decoder reads empty or corrupt body — would need different synthetic Response construction |

[A1 is ASSUMED based on the CONTEXT.md D-07 which uses this cast without concern; the lint plugin name suggests it permits valid narrowing]
[A2 is ASSUMED based on the existing `Decode.optional()` which uses `new Response(bytes)` in decode.ts line 161 — same pattern, already tested in Phase 4]

---

## Open Questions

1. **`Decode.discard()` in the dispatch path**
   - What we know: `Decode.discard()` calls `response.body?.cancel()` — it doesn't call `readBytes()`.
   - What's unclear: After `readBytes(response)` buffers the body, passing `new Response(bytes)` to `Decode.discard().fn()` means the discard decoder will try to cancel a synthetic Response's body (a `Uint8Array` BodyInit — its `body` stream is non-null). This is harmless but slightly wasteful.
   - Recommendation: No action needed — `Decode.discard()` is idempotent and the synthetic Response body is a small in-memory stream. Document in a test if needed.

2. **`Decode.none()` unexpected body case**
   - What we know: `Decode.none()` reads one chunk and checks if the stream is non-empty, returning `unexpectedBody` if so. With a synthetic `new Response(bytes)` where bytes is non-empty, it will correctly return `unexpectedBody`.
   - What's unclear: Whether the SPEC intends `Decode.none()` to work on HEAD responses matched via `send()`. HEAD responses have `response.body === null` (no body after `readBytes`). The `readBytes()` function handles `body === null` → returns `new Uint8Array(0)`. A synthetic `new Response(new Uint8Array(0))` has an empty body. `Decode.none()` returns `undefined` for empty → correct.
   - Recommendation: No action needed; behavior is correct by construction. Include a test case in send.test.ts for documentation.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this phase is pure code/type changes within the existing project).

---

## Security Domain

Step 2.6 security note: This phase adds no new security surfaces. The decode dispatch path:
- Does not execute user-supplied code (decoders are functions defined at call-site)
- Does not emit to external services
- Does not expose new APIs

No additional ASVS coverage required beyond what Phase 3 established.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `src/types.ts` — `TaggedEntry`, `ResponseMap`, `StatusMatcher`, `DecodeError`, `SendResult`, `BodyPreview`, `InferResponseUnion`
- [VERIFIED: codebase] `src/decode.ts` — `Decoder<T>`, `readBytes()` signature and return type
- [VERIFIED: codebase] `src/preview.ts` — `readBodyPreview()` pattern, `TextDecoder { fatal: false }`
- [VERIFIED: codebase] `src/send.ts` — Phase 3 stub location (lines 168-174), existing imports, `maxBytes` line 165
- [VERIFIED: codebase] `tests/unit/send.test.ts` — existing test structure, mock fetch pattern
- [CITED: .planning/phases/05-response-matching-decode-dispatch/05-CONTEXT.md] — All D-01 through D-08 locked decisions

### Secondary (MEDIUM confidence)
- [CITED: docs/SPEC.md lines 261-271] — 4-step matching precedence (layer-first, then specificity-first)
- [CITED: docs/SPEC.md lines 280-308] — `SendResult<R>` shape, variant meanings
- [CITED: .planning/REQUIREMENTS.md lines 62-71] — RESP-01 through PREV-03 requirement text

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all assets verified in codebase
- Architecture: HIGH — dependency graph, import paths, file locations all verified
- Pitfalls: HIGH — all pitfalls derived from verified TypeScript compiler constraints and codebase patterns
- TypeScript patterns: HIGH — `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `no-unsafe-type-assertion` all verified from tsconfig.json and copilot-instructions.md

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable codebase; no external dependencies to track)
