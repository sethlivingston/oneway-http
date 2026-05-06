# Phase 4: Body Producers + Decoders — Research

**Researched:** 2026-05-05
**Domain:** TypeScript HTTP body serialization, ReadableStream consumption, strict-mode type engineering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** All decoders have the uniform external signature `(response: Response) => Promise<T | DecodeError>`. Decoders receive the raw `Response`, not a pre-buffered `Uint8Array`.
- **D-02:** Internal `readBytes(response: Response): Promise<Uint8Array>` handles null-body normalization: `null` body → `new Uint8Array(0)`. Normal decoders (`text`, `json`, `bytes`) call this. `discard()` and `none()` bypass it.
- **D-03:** `Decode.discard()` calls `response.body?.cancel()` directly. The `?.` null-guard handles 204/304. No chunks read, no memory allocated.
- **D-04:** `Decode.none()` reads exactly one chunk via `response.body?.getReader().read()`. `done: true` or `body === null` → pass. `done: false` → cancel stream, return `{ kind: "unexpectedBody" }`.
- **D-05:** `Decode.optional(inner)` calls `readBytes(response)` first. Zero bytes → `undefined`. Non-zero → `inner(new Response(bytes))`.
- **D-06:** `Body` is opaque. `serializeBody(body: Body)` is internal-only (not exported from package). Factory functions never throw.
- **D-07:** `Body.json(value)` defers `JSON.stringify` to `serializeBody()` time. On throw → `send.ts` catches and returns `{ kind: "requestError", error: { kind: "bodySerializationFailed", message } }`.
- **D-08:** `Body.formUrlEncoded(entries)` uses `URLSearchParams`. `entries` type: `Record<string, string | readonly string[]>`.
- **D-09:** `SendResult<R>` gains a fifth variant: `{ kind: "requestError"; error: RequestError }`. `RequestError` union lives in `types.ts`. Only `bodySerializationFailed` is wired up in Phase 4.
- **D-10:** `Decode.json(schema)`: duck-typed `Schema<T>` interface with `safeParse()`. Zod errors detected by `.issues` duck-type (not `instanceof`).
- **D-11:** `readBodyPreview()` moves from `send.ts` → `preview.ts` as a pure refactor. No behavior change.
- **D-12:** Canonical prior art: undici `lib/web/fetch/body.js`, ky `#cancelResponseBody`, reqwest `do_bytes()`.

### the agent's Discretion
- Internal structure of `Body` sealed object (field names, kind enum vs. union)
- Whether `Decoder<T>` is a class or a branded function-wrapper object
- Internal helper naming (e.g., `readBytes` vs. `consumeBody`)
- Test file naming and helper extraction patterns

### Deferred Ideas (OUT OF SCOPE)
- Retrofitting `requestConsumed`, `missingBaseUrl`, `duplicateResponseTag`, `invalidSpec` into `SendResult.requestError`
- Connection pool keep-alive threshold heuristic for `discard()`
- `Body.formData()` multipart support
- Valibot schema adapter
- Streaming request/response bodies
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BODY-01 | `Body.none()` — no request body | Simple opaque constructor; `serializeBody` returns `{ init: undefined }` |
| BODY-02 | `Body.json(value)` — `JSON.stringify` + UTF-8 + `content-type: application/json` | Defer stringify to `serializeBody`; `JSON.stringify` throws for circular/BigInt/toJSON errors |
| BODY-03 | `Body.text(value, contentType?)` — UTF-8, defaults to `text/plain; charset=utf-8` | String is already UTF-8 in JS engine; pass as `BodyInit` string directly |
| BODY-04 | `Body.formUrlEncoded(entries)` — `application/x-www-form-urlencoded`, repeated keys | `URLSearchParams.append()` handles repeated keys natively |
| BODY-05 | `Body.bytes(bytes, contentType?)` — raw `Uint8Array` with caller-supplied content-type | Pass `Uint8Array` directly as `BodyInit` |
| DEC-01 | `Decode.none()` — any bytes → `unexpectedBody`; null + empty-stream normalized | D-04: peek one chunk via `getReader().read()` |
| DEC-02 | `Decode.discard()` — safe body disposal; reader cancelled in `finally` | D-03: `response.body?.cancel()` — null-guard, no allocation |
| DEC-03 | `Decode.text()` — returns `string`; empty body → `""` | `readBytes` + `new TextDecoder().decode(bytes)` |
| DEC-04 | `Decode.json()` — parses JSON; empty body → `emptyBody` | `readBytes` + `JSON.parse`; catch `SyntaxError` → `invalidJson` |
| DEC-05 | `Decode.json(schema)` — validates via `Schema<T>`; errors → `DecodeIssue[]` | Duck-typed `safeParse`; `.issues` duck-type for Zod errors |
| DEC-06 | `Decode.bytes()` — returns `Uint8Array` | `readBytes` + return bytes directly |
| DEC-07 | `Decode.optional(inner)` — zero bytes → `undefined`, else delegate to `inner` | D-05: synthetic `new Response(bytes)` |
| DEC-08 | `null` body and empty-stream body both normalize to zero bytes | D-02: `readBytes` handles both; `Decode.none()` handles both in D-04 |
| PREV-01 | `BodyPreview` reads from `response.body` ReadableStream, not `Response.clone()` | Existing `readBodyPreview()` in `send.ts` already correct; move to `preview.ts` |
| PREV-02 | `bodyPreviewBytes` configurable via `client.diagnostics`; defaults to `8192` | Already implemented in Phase 3; pure refactor |
| PREV-03 | `BodyPreview.text` decoded as UTF-8 with `TextDecoder` | Already implemented in Phase 3; pure refactor |
</phase_requirements>

---

## Summary

Phase 4 adds four new source files and modifies two existing ones. The work divides cleanly into three independent tracks: (1) opaque `Body` producers + `serializeBody` integration into `send.ts`, (2) the two-tier decoder architecture in `decode.ts` + `Decoder<T>` class with `.as()` for Phase 5 compatibility, and (3) a pure refactor of `readBodyPreview()` from `send.ts` → `preview.ts`. A fourth task — adding `RequestError` to `types.ts` and `SendResult<R>` — is required by the body serialization failure path.

The highest-risk area is the `Body` opaque type in `types.ts`: because `types.ts` has zero imports, `Body` must be declared there (as a branded type or `declare class`) so that `RequestSpecBase.body?: Body` compiles without importing from `body.ts`. The `Decoder<T>` class in `decode.ts` similarly needs to be designed for Phase 5's cast-and-call pattern before `TaggedEntry._decode` (typed as `unknown`) is useful.

All 16 requirements are implementable using existing established project patterns. The test infrastructure is fully in place — Vitest with `mockFetch` injection is the correct approach, matching the Phase 3 test patterns exactly.

**Primary recommendation:** Implement in this order — `types.ts` changes first (unblocks everything), then `body.ts` (simple), then `preview.ts` (pure refactor), then `send.ts` integration, then `decode.ts` (most complex). Each step builds on the previous.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Body serialization (`Body.*`) | Request/build time (client library) | — | Serialization defers to `serializeBody()` at `send()` time; factory fns are pure value constructors |
| Body deserialization (`Decode.*`) | Response processing (client library) | — | Decoders receive the live `Response` object, consume its body stream, return typed values |
| Body preview streaming | Response processing (client library) | — | Already in `send.ts`; moving to `preview.ts` is a pure refactor keeping it in the same tier |
| `RequestError` surfacing | `send()` function (client library) | `types.ts` (type def) | `bodySerializationFailed` is caught in `send.ts` and returned as `SendResult.requestError` |
| Stream cancellation | `decode.ts` + `preview.ts` | `send.ts` (for preview) | Each consumer that opens a reader is responsible for cancellation in `finally` |

---

## Standard Stack

### Core (verified in codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.3 | Language; strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | Locked in `tsconfig.json` [VERIFIED: tsconfig.json] |
| Vitest | 4.1.5 | Test runner; `describe`/`it`/`expect` | Locked in `package.json` [VERIFIED: package.json] |
| `URLSearchParams` | (built-in) | `application/x-www-form-urlencoded` encoding | Web standard; no dep needed [VERIFIED: MDN spec] |
| `TextDecoder` | (built-in) | UTF-8 decoding for `Decode.text()` | Web standard; no dep needed [VERIFIED: MDN spec] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod (peer) | `^3.25.0` | Schema validation via `Decode.json(schema)` | Only referenced via duck-type; `instanceof ZodError` explicitly forbidden [ASSUMED] |

**No new packages to install.** All functionality uses built-in browser/Node.js APIs.

---

## Architecture Patterns

### System Architecture Diagram

```
         Caller
           │
   Request.create({ body: Body.json(value), responses: { 200: Decode.json(schema).as("ok") } })
           │
    send(request, client)
           │
    ┌──────▼──────────────────────────────────────────────┐
    │                    performSend()                     │
    │                                                      │
    │  serializeBody(spec.body)                           │
    │    ├─ throws → requestError.bodySerializationFailed │
    │    └─ ok → { init: BodyInit, contentType? }         │
    │                                                      │
    │  Set content-type header if not present             │
    │                                                      │
    │  fetch(url, { method, headers, body: init, signal }) │
    │    ├─ throws → classifyTransportError()             │
    │    └─ Response                                       │
    │         │                                           │
    │         │ [Phase 5 inserts dispatch here]           │
    │         ▼                                           │
    │  readBodyPreview(response, maxBytes) [preview.ts]   │
    │    ├─ getReader() → collect chunks → reader.cancel()│
    │    └─ { text, bytesRead, truncated }               │
    │         │                                           │
    │         └─ return unhandledStatus (Phase 3 stub)   │
    └──────────────────────────────────────────────────────┘

         When Phase 5 dispatches to a decoder:
         entry.decode → Decoder<T> (cast from unknown)
              │
         decoder.fn(response)     [decode.ts]
              │
         ┌────▼────────────────────────────────────┐
         │            readBytes(response)           │
         │  body === null → Uint8Array(0)           │
         │  getReader() → collect → reader.cancel() │
         │  → Uint8Array                            │
         └────────────────────────────────────────┘
              │
         decode / parse / validate → T | DecodeError
```

### Recommended Project Structure
```
src/
├── types.ts        # Body opaque type + RequestError + updated SendResult<R>
├── body.ts         # Body producers + serializeBody() internal
├── decode.ts       # Decoder<T> class + readBytes() + Decode.* implementations
├── preview.ts      # readBodyPreview() extracted from send.ts (pure refactor)
├── send.ts         # Updated: imports serializeBody + readBodyPreview
├── request.ts      # Unchanged
└── client.ts       # Unchanged

tests/unit/
├── body.test.ts    # BODY-01 through BODY-05
├── decode.test.ts  # DEC-01 through DEC-08
└── preview.test.ts # PREV-01 through PREV-03 (extract from send.test.ts if needed)
```

### Pattern 1: Opaque `Body` type in `types.ts` (zero-import requirement)

`types.ts` has zero imports. `Body` must therefore be defined there. The cleanest approach is a `declare class` — a pure declaration with no logic and no imports that creates a nominal type.

```typescript
// src/types.ts
// Opaque Body — implementation in body.ts; declared here so RequestSpecBase can reference it
// without introducing an import. declare class creates a nominal type, never instantiated via
// this declaration.
export declare class Body {
  private constructor();          // prevents direct construction outside body.ts
  private readonly _kind: string; // structural discriminant — never accessed at runtime
}
```

Then in `body.ts`, cast internal objects to `Body`:

```typescript
// src/body.ts
import type { Body } from "./types.js";

// Internal representation (not exported)
type BodyInternal =
  | { kind: "none" }
  | { kind: "json"; value: unknown }
  | { kind: "text"; value: string; contentType?: string }
  | { kind: "formUrlEncoded"; entries: Record<string, string | readonly string[]> }
  | { kind: "bytes"; bytes: Uint8Array; contentType?: string };

// Cast internal object to opaque Body — safe because Body is only read via serializeBody()
function toBody(internal: BodyInternal): Body {
  return internal as unknown as Body;
}

// Accessor for internal use only
function fromBody(body: Body): BodyInternal {
  return body as unknown as BodyInternal;
}
```

**Why `declare class` over branded type:** `declare class` is idiomatic for opaque types — it creates a true nominal type that prevents structural aliasing. A brand (`{ readonly _brand: unique symbol }`) requires a top-level `declare const`, which is slightly more verbose. Both work under strict mode.

[VERIFIED: tsconfig.json — `types.ts` has zero imports today; confirm compatibility]
[ASSUMED: `declare class` in a `.ts` file with `noEmit: true` does not generate any runtime output]

### Pattern 2: `Decoder<T>` class for Phase 5 dispatch

`Decoder<T>` wraps a decoder function and provides the `.as(tag)` method that creates a `TaggedEntry`. Phase 5 will cast `entry.decode as Decoder<unknown>` and call `decoder.fn(response)`.

```typescript
// src/decode.ts
import type { TaggedEntry, DecodeError } from "./types.js";

// Public-facing decoder function type
type DecoderFn<T> = (response: Response) => Promise<T | DecodeError>;

export class Decoder<T> {
  /** @internal — Phase 5 accesses this after casting entry.decode */
  readonly fn: DecoderFn<T>;

  constructor(fn: DecoderFn<T>) {
    this.fn = fn;
  }

  as<Tag extends string>(tag: Tag): TaggedEntry<T, Tag> {
    // exactOptionalPropertyTypes: phantom is declared as `phantom?: T` — omit it entirely
    // rather than setting to undefined
    return { tag, decode: this };
  }
}
```

**Phase 5 usage (preview of downstream contract):**
```typescript
// In Phase 5 dispatch code (decode.ts or send.ts)
import { Decoder } from "./decode.js";
// ...
const entry = responseMap[status];
if (entry !== undefined) {
  const decoder = entry.decode as Decoder<unknown>;
  const result = await decoder.fn(response);
  // ...
}
```

[VERIFIED: types.ts — `TaggedEntry.decode` is `readonly decode: unknown`; cast is safe]

### Pattern 3: `readBytes()` internal helper — null-body normalization

```typescript
// src/decode.ts — internal, not exported
// Source: undici lib/web/fetch/body.js consumeBody() pattern + WHATWG Fetch spec
// "If body is null, call successSteps with empty byte sequence"
async function readBytes(response: Response): Promise<Uint8Array> {
  if (response.body === null) {
    // 204 No Content, 304 Not Modified, 205 Reset Content, HEAD responses
    return new Uint8Array(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
  } finally {
    // Non-negotiable: cancel to release TCP connection
    await reader.cancel().catch(() => {
      // Swallow — stream may already be errored/closed
    });
  }

  // noUncheckedIndexedAccess: use for...of + Uint8Array.set() (see send.ts established pattern)
  const all = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}
```

[VERIFIED: src/send.ts lines 139–145 — identical `for...of` + `set()` pattern already established]

### Pattern 4: `Decode.discard()` — cancel without reading

```typescript
// Source: ky source/core/Ky.ts #cancelResponseBody pattern
// WHATWG Streams spec §cancel: cancel() is on ReadableStream, not the Body mixin
export const Decode = {
  discard(): Decoder<void> {
    return new Decoder(async (response) => {
      // D-03: ?.cancel() handles null body (204/304/205)
      // No allocation, no chunks read — stream is signalled to abort
      await response.body?.cancel().catch(() => {
        // Swallow — stream may already be errored
      });
    });
  },
  // ...
};
```

[VERIFIED: src/types.ts — `DecodeError` union confirms `void` return is valid for discard]
[ASSUMED: `response.body?.cancel()` returns `Promise<void>` in both undici and browser — confirmed by WHATWG Streams spec `cancel()` signature]

### Pattern 5: `Decode.none()` — peek one chunk

```typescript
none(): Decoder<void> {
  return new Decoder(async (response) => {
    if (response.body === null) {
      // null body is definitionally empty — pass
      return;
    }
    const reader = response.body.getReader();
    try {
      const { done } = await reader.read();
      if (!done) {
        // Body has content — unexpected
        return { kind: "unexpectedBody" } satisfies DecodeError;
      }
      // done === true → empty stream — pass
    } finally {
      await reader.cancel().catch(() => {});
    }
  });
},
```

**Key:** `done: true` on the first read means the stream was already exhausted (empty stream, e.g., `Content-Length: 0`). Both `null` body and empty-stream body satisfy `Decode.none()`. [VERIFIED: DEC-08 requirement]

### Pattern 6: `Body.formUrlEncoded()` with URLSearchParams

```typescript
// Source: MDN URLSearchParams + WHATWG URL spec
formUrlEncoded(
  entries: Record<string, string | readonly string[]>
): Body {
  return toBody({ kind: "formUrlEncoded", entries });
}

// In serializeBody():
case "formUrlEncoded": {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(internal.entries)) {
    if (Array.isArray(values)) {
      for (const v of values) {
        params.append(key, v);
      }
    } else {
      params.append(key, values as string);
    }
  }
  return { init: params.toString(), contentType: "application/x-www-form-urlencoded" };
}
```

**Encoding specifics:** `URLSearchParams.toString()` produces RFC 3986 `application/x-www-form-urlencoded` encoding — spaces become `+`, special chars are percent-encoded. This is the correct encoding for form bodies. [VERIFIED: MDN URLSearchParams docs]

### Pattern 7: `Decode.json(schema)` overloads + Zod duck-typing

```typescript
// TypeScript function overloads (D-10)
function json(): Decoder<unknown>;
function json<T>(schema: Schema<T>): Decoder<T>;
function json<T>(schema?: Schema<T>): Decoder<unknown> | Decoder<T> {
  return new Decoder(async (response) => {
    const bytes = await readBytes(response);
    if (bytes.length === 0) {
      return { kind: "emptyBody" } satisfies DecodeError;
    }
    const text = new TextDecoder().decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { kind: "invalidJson", message } satisfies DecodeError;
    }
    if (schema === undefined) {
      return parsed;
    }
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    // Duck-type Zod error detection — never use instanceof across module boundaries
    return {
      kind: "schemaMismatch",
      issues: normalizeSchemaError(result.error),
    } satisfies DecodeError;
  });
}

function normalizeSchemaError(error: unknown): DecodeIssue[] {
  // Duck-type: Zod errors have .issues array with { path, message, code }
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    return ((error as { issues: Array<{ path: (string | number)[]; message: string; code?: string }> }).issues).map(
      (issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      })
    );
  }
  // Fallback for non-Zod schema libraries
  return [{ path: [], message: String(error) }];
}
```

[VERIFIED: types.ts — `Schema<T>` interface, `DecodeIssue` type, `DecodeError` union all present]

### Pattern 8: `Decode.optional(inner)` — synthetic Response

```typescript
optional<T>(inner: Decoder<T>): Decoder<T | undefined> {
  return new Decoder(async (response) => {
    const bytes = await readBytes(response);
    if (bytes.length === 0) {
      return undefined;
    }
    // Create synthetic Response from already-read bytes
    // new Response(Uint8Array) is valid BodyInit in both Node.js (undici) and browser
    const synthetic = new Response(bytes);
    return inner.fn(synthetic);
  });
},
```

[VERIFIED: WHATWG Fetch spec — `BodyInit` includes `BufferSource`, which `Uint8Array` satisfies]
[ASSUMED: Node.js 24 undici `Response` constructor accepts `Uint8Array` as body — consistent with undici spec-faithful implementation; verified indirectly by existing `new Response("hello world", { status: 200 })` pattern in tests]

### Pattern 9: `serializeBody()` with `exactOptionalPropertyTypes`

```typescript
// src/body.ts — internal, imported only by send.ts
export function serializeBody(
  body: Body
): { init: BodyInit; contentType?: string } {
  const internal = fromBody(body);
  switch (internal.kind) {
    case "none":
      return { init: "" }; // or return { init: new Uint8Array(0) }
      // NOTE: fetch ignores body when Content-Length: 0; Body.none() means no body
      // Better: don't call serializeBody for none — return undefined in send.ts
    case "json": {
      // May throw for circular refs, BigInt, throwing .toJSON()
      const json = JSON.stringify(internal.value);
      return { init: json, contentType: "application/json" };
    }
    case "text":
      return {
        init: internal.value,
        // exactOptionalPropertyTypes: don't return { contentType: undefined }
        ...(internal.contentType !== undefined
          ? { contentType: internal.contentType }
          : { contentType: "text/plain; charset=utf-8" }),
      };
    case "formUrlEncoded": {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(internal.entries)) {
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, v);
        } else {
          params.append(key, value as string);
        }
      }
      return { init: params.toString(), contentType: "application/x-www-form-urlencoded" };
    }
    case "bytes":
      return internal.contentType !== undefined
        ? { init: internal.bytes, contentType: internal.contentType }
        : { init: internal.bytes };
  }
}
```

**`exactOptionalPropertyTypes` gotcha:** Returning `{ init: x, contentType: undefined }` would fail type-checking for a return type of `{ init: BodyInit; contentType?: string }` — the `undefined` value is not assignable to the optional property. Use conditional spreading or conditional return. [VERIFIED: tsconfig.json — `exactOptionalPropertyTypes: true`]

**`Body.none()` special case in `send.ts`:** Rather than returning an empty string from `serializeBody()`, `send.ts` should simply not set `fetchInit.body` when `spec.body` is `undefined` or is a `Body.none()`. The cleanest way: `Body.none()` serializes to `{ init: undefined }` but `send.ts` guards with `if (spec.body !== undefined)` before calling `serializeBody()`. Actually, `Body.none()` can return `{ init: undefined }` and send.ts skips `fetchInit.body` assignment when `init` is undefined. Or treat none as "don't call serializeBody at all" — both work.

### Pattern 10: `send.ts` integration — body serialization failure path

```typescript
// In performSend(), before building fetchInit:
let serialized: { init: BodyInit; contentType?: string } | undefined;
if (spec.body !== undefined) {
  try {
    serialized = serializeBody(spec.body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      kind: "requestError",
      error: { kind: "bodySerializationFailed", message },
    };
  }
}

// Build fetchInit:
const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
if (serialized?.init !== undefined) fetchInit.body = serialized.init;
if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;

// Set content-type from body if not overridden in headers:
if (serialized?.contentType !== undefined && headers["content-type"] === undefined) {
  headers["content-type"] = serialized.contentType;
}
```

[VERIFIED: src/send.ts — `fetchInit.body` conditional assignment already established at line 219]
[VERIFIED: types.ts — `RequestError` union needs `bodySerializationFailed: { kind: string; message: string }` per SPEC §Request errors]

### Pattern 11: `preview.ts` — extract from `send.ts`

This is a pure file move. Create `src/preview.ts` with exactly the existing `readBodyPreview()` function from `send.ts`. Update `send.ts` to:
```typescript
import { readBodyPreview } from "./preview.js";
// Remove the inline function
```

No behavior changes, no signature changes. [VERIFIED: src/send.ts lines 83–161 — function is self-contained with no closure references]

### Anti-Patterns to Avoid

- **`instanceof ZodError` check:** Fails when Zod is installed at different module paths or versions. Always duck-type `.issues`. [VERIFIED: D-10]
- **`{ ...base, contentType: undefined }` spread in `serializeBody` return:** Violates `exactOptionalPropertyTypes`. Use conditional spread or omit the key entirely.
- **`chunks[i]` byte indexing:** `noUncheckedIndexedAccess` adds `| undefined` to the result. Use `for...of` iteration instead. [VERIFIED: send.ts lines 139–145 established pattern]
- **`response.body.cancel()` without `?.`:** Will throw on 204/304/205 where `body === null`. Always use `response.body?.cancel()`. [VERIFIED: D-03]
- **`TextDecoder` with `{ fatal: true }` in `Decode.text()`:** `fatal: true` throws on invalid UTF-8. Use default `{ fatal: false }` for text decoding — lossy is better than crashing for a text decoder. Use `fatal: true` only when you want to detect encoding issues (like the preview fallback logic).
- **Calling `getReader()` more than once on the same response:** After `readBytes()` or any `getReader()` call, the stream is locked. Never call `getReader()` twice on the same Response. `Decode.optional(inner)` avoids this by forwarding a *synthetic* `new Response(bytes)` to `inner`.
- **Not cancelling reader in `finally`:** Connection leaks. Every `getReader()` call MUST have a corresponding `reader.cancel()` in `finally`. [VERIFIED: D-03, D-04, all decoder patterns]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `application/x-www-form-urlencoded` encoding | Custom percent-encoding | `URLSearchParams.append()` | Handles `+` for spaces, all special chars, repeated keys, RFC-compliant |
| UTF-8 text decoding | Manual byte-to-char conversion | `new TextDecoder("utf-8", { fatal: false })` | Web standard; handles multi-byte sequences; no split codepoints |
| Schema validation normalization | Custom Zod type walker | Duck-type `.issues` array | Simple, works across Zod versions, never leaks Zod types |
| Byte buffer assembly from stream chunks | Custom linked-list buffer | `Uint8Array` + `for...of` + `set()` | Established pattern; `noUncheckedIndexedAccess`-safe; no extra deps |

**Key insight:** `URLSearchParams` is the only correct choice for form encoding — hand-rolling percent-encoding misses the `+` for spaces, `%20` vs `+` context-dependency, and repeated key semantics. Always use the built-in.

---

## Common Pitfalls

### Pitfall 1: `Body` in `types.ts` — import-free constraint
**What goes wrong:** Placing `Body` in `body.ts` and importing it into `types.ts` would create a circular dependency (`body.ts → types.ts → body.ts`). The existing rule is `types.ts` has zero imports.
**Why it happens:** `RequestSpecBase.body?: Body` requires `Body` to be known at `types.ts` compile time.
**How to avoid:** Declare `Body` in `types.ts` itself as a `declare class` (opaque nominal type) or a branded type. `body.ts` uses `as unknown as Body` casts internally.
**Warning signs:** TypeScript error "Module has circular dependency" or "Cannot find type 'Body'"

### Pitfall 2: `null` body vs. empty-stream body (DEC-08)
**What goes wrong:** Treating `response.body === null` and `response.body` with no bytes as different cases — some decoders handle one but not the other.
**Why it happens:** `204 No Content` sets `body = null`; `200` with `Content-Length: 0` may have an empty (but non-null) ReadableStream.
**How to avoid:** `readBytes()` normalizes both: `null` → `Uint8Array(0)`; empty stream → `done: true` on first `read()` → `Uint8Array(0)`. All decoders using `readBytes()` automatically handle both.
**Warning signs:** `Decode.none()` fails for one case but not the other; `Decode.text()` returning `""` vs. `emptyBody` inconsistently

### Pitfall 3: Reader not cancelled = connection leak (P3)
**What goes wrong:** Acquiring a reader with `getReader()` but not cancelling it in `finally`.
**Why it happens:** Exception paths skip cleanup; early returns from decode functions.
**How to avoid:** Every `getReader()` MUST be paired with `reader.cancel()` in a `finally` block. The `catch(() => {})` swallow inside cancel is intentional — the stream may already be errored.
**Warning signs:** TCP connections accumulating; tests hanging; undici pool exhaustion in test suites with many requests

### Pitfall 4: `cancel()` vs. drain for `Decode.discard()` (P4)
**What goes wrong:** Using `getReader()` + read loop to drain the body for keep-alive, then calling `cancel()`.
**Why it happens:** Confusion about connection pool semantics.
**How to avoid:** `Decode.discard()` calls `response.body?.cancel()` directly — no reader, no drain. In undici, this aborts the connection rather than pooling it for reuse. For v1 this is correct; the connection cost is acceptable. [VERIFIED: D-03, SPEC §Decode.discard()]
**Warning signs:** Unnecessarily large memory allocation for large bodies being discarded

### Pitfall 5: `noUncheckedIndexedAccess` with byte arrays (P8)
**What goes wrong:** `chunks[i]` returns `Uint8Array | undefined` under strict indexing; TypeScript errors or runtime `undefined` access.
**Why it happens:** Implicit assumption that array indices are always valid.
**How to avoid:** Use `for...of` iteration on the `chunks` array — no index access needed. Use `all.set(chunk, offset)` + manual `offset` counter. [VERIFIED: send.ts lines 139–145 — exact pattern already in codebase]
**Warning signs:** TypeScript error "Type 'Uint8Array | undefined' is not assignable to type 'Uint8Array'"

### Pitfall 6: `exactOptionalPropertyTypes` in `serializeBody` return value
**What goes wrong:** Returning `{ init: x, contentType: undefined }` from a function typed to return `{ init: BodyInit; contentType?: string }` fails strict optional property checks.
**Why it happens:** `contentType?: string` means "may be absent" not "may be `undefined`" under `exactOptionalPropertyTypes`.
**How to avoid:** Use conditional return: `internal.contentType !== undefined ? { init, contentType: internal.contentType } : { init }`. Never spread `undefined` values into optional property slots.
**Warning signs:** TypeScript error "Type 'undefined' is not assignable to type 'string'"

### Pitfall 7: `Decode.optional(inner)` calling `inner.fn(response)` on the original response
**What goes wrong:** Calling the inner decoder on the original `response` after `readBytes()` has consumed the body. The stream is now locked/exhausted; the inner decoder's `getReader()` call throws "ReadableStream is locked" or returns no bytes.
**Why it happens:** Forgetting that `readBytes()` consumes the stream.
**How to avoid:** Always pass a *synthetic* `new Response(bytes)` to the inner decoder — this is the D-05 decision. [VERIFIED: D-05]
**Warning signs:** Inner decoder always returns `emptyBody` or `unexpectedBody`; "ReadableStream is locked" runtime error

### Pitfall 8: Zod `instanceof` across module boundaries (P14)
**What goes wrong:** `error instanceof ZodError` returns `false` when Zod is installed in multiple locations in `node_modules` (monorepos, peer dependency resolution quirks).
**Why it happens:** `instanceof` checks the prototype chain by object identity; different module instances have different `ZodError` classes.
**How to avoid:** Duck-type on `.issues`: `"issues" in error && Array.isArray(error.issues)`. [VERIFIED: D-10]
**Warning signs:** Schema validation failures not normalized correctly; `.kind: "schemaMismatch"` never returned even when schema fails

### Pitfall 9: `TextDecoder` `fatal` mode in `Decode.text()` (P10)
**What goes wrong:** Using `{ fatal: true }` in `Decode.text()` causes a `TypeError` for responses with binary content or non-UTF-8 encodings. This propagates as an unhandled rejection.
**Why it happens:** `fatal: true` throws on any invalid UTF-8 byte sequence.
**How to avoid:** Use `new TextDecoder()` (default `fatal: false`) for `Decode.text()`. The preview (in `preview.ts`) intentionally uses `fatal: true` + ISO-8859-1 fallback to detect encoding — that pattern is ONLY for preview, not for decoders.
**Warning signs:** `Decode.text()` returning `bodyReadFailed` for binary responses that happen to be text-adjacent

---

## Code Examples

### Full `body.ts` internal shape

```typescript
// Source: D-06, D-07, D-08 from CONTEXT.md
// src/body.ts

import type { Body } from "./types.js";

type BodyInternal =
  | { readonly kind: "none" }
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "text"; readonly value: string; readonly contentType?: string }
  | { readonly kind: "formUrlEncoded"; readonly entries: Record<string, string | readonly string[]> }
  | { readonly kind: "bytes"; readonly bytes: Uint8Array; readonly contentType?: string };

function toBody(internal: BodyInternal): Body {
  return internal as unknown as Body;
}

function fromBody(body: Body): BodyInternal {
  return body as unknown as BodyInternal;
}

export const Body = {
  none: (): Body => toBody({ kind: "none" }),
  json: (value: unknown): Body => toBody({ kind: "json", value }),
  text: (value: string, contentType?: string): Body =>
    contentType !== undefined
      ? toBody({ kind: "text", value, contentType })
      : toBody({ kind: "text", value }),
  formUrlEncoded: (entries: Record<string, string | readonly string[]>): Body =>
    toBody({ kind: "formUrlEncoded", entries }),
  bytes: (bytes: Uint8Array, contentType?: string): Body =>
    contentType !== undefined
      ? toBody({ kind: "bytes", bytes, contentType })
      : toBody({ kind: "bytes", bytes }),
} as const;

// Internal: imported only by send.ts
export function serializeBody(body: Body): { init: BodyInit } | { init: BodyInit; contentType: string } {
  const internal = fromBody(body);
  switch (internal.kind) {
    case "none":
      return { init: new Uint8Array(0) }; // send.ts skips body assignment for none
    case "json":
      return { init: JSON.stringify(internal.value), contentType: "application/json" };
    case "text":
      return {
        init: internal.value,
        contentType: internal.contentType ?? "text/plain; charset=utf-8",
      };
    case "formUrlEncoded": {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(internal.entries)) {
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, v);
        } else {
          params.append(key, value as string);
        }
      }
      return { init: params.toString(), contentType: "application/x-www-form-urlencoded" };
    }
    case "bytes":
      return internal.contentType !== undefined
        ? { init: internal.bytes, contentType: internal.contentType }
        : { init: internal.bytes };
  }
}
```

### `types.ts` additions for Phase 4

```typescript
// src/types.ts — ADDITIONS ONLY (no logic, no imports)

// Opaque Body — declared here so RequestSpecBase.body can reference it without importing body.ts
export declare class Body {
  private constructor();
  private readonly _kind: string;
}

// RequestError union — Phase 4 wires bodySerializationFailed; others remain thrown errors
export type RequestError =
  | { kind: "bodySerializationFailed"; message: string }
  | { kind: "requestConsumed" }
  | { kind: "missingBaseUrl" }
  | { kind: "duplicateResponseTag"; tag: string }
  | { kind: "invalidSpec"; message: string };

// Update SendResult<R> — add requestError as 5th variant
export type SendResult<R> =
  | { kind: "response"; response: R }
  | { kind: "requestError"; error: RequestError }   // ← NEW in Phase 4
  | { kind: "transportError"; error: TransportError }
  | { kind: "decodeError"; status: number; headers: Headers; error: DecodeError; preview: BodyPreview }
  | { kind: "unhandledStatus"; status: number; headers: Headers; preview: BodyPreview };

// Update RequestSpecBase — body is now Body, not BodyInit
// (BodyInit was a placeholder; callers now use Body.* producers)
export interface RequestSpecBase<Responses extends ResponseMap = ResponseMap> {
  readonly method: Method;
  readonly query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: Body;   // ← changed from BodyInit
  readonly responses: Responses;
  readonly retry?: RetryPolicy;
  readonly deadlineMs?: number;
}
```

**Impact:** Changing `body?: BodyInit` to `body?: Body` is a breaking change to the public type. All existing test code using `body: "string"` directly will break. Phase 3 test files use `body: undefined` (no body tests), so no test breakage is expected. [VERIFIED: send.test.ts — no test sets `body`]

### Mock pattern for decoder tests

```typescript
// tests/unit/decode.test.ts — established pattern from send.test.ts
import { describe, it, expect } from "vitest";
import { Decode } from "../../src/decode.js";

// Helper: create a mock Response with given body string
function mockResponse(body: string | null, status = 200): Response {
  return body === null
    ? new Response(null, { status })
    : new Response(body, { status });
}

// Helper: create a mock Response from Uint8Array
function mockBytesResponse(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status });
}

describe("DEC-01: Decode.none()", () => {
  it("passes for null body (204)", async () => {
    const decoder = Decode.none();
    const result = await decoder.fn(mockResponse(null, 204));
    expect(result).toBeUndefined();
  });

  it("passes for empty stream body", async () => {
    const decoder = Decode.none();
    const result = await decoder.fn(mockResponse(""));
    expect(result).toBeUndefined();
  });

  it("returns unexpectedBody when body has content", async () => {
    const decoder = Decode.none();
    const result = await decoder.fn(mockResponse("hello"));
    expect(result).toEqual({ kind: "unexpectedBody" });
  });
});
```

---

## Integration Points

### Files modified in Phase 4

| File | Change | Impact |
|------|--------|--------|
| `src/types.ts` | Add `Body` declare class; add `RequestError`; update `SendResult<R>` with `requestError`; change `RequestSpecBase.body` from `BodyInit` to `Body` | All downstream modules that read `RequestSpec.body` now get `Body` type |
| `src/send.ts` | Import `serializeBody` from `./body.js`; import `readBodyPreview` from `./preview.js`; add try/catch for `serializeBody`; set content-type from body | `readBodyPreview` call site unchanged; adds `requestError` return path |
| `src/request.ts` | No changes required | `RequestSpec.body` type change propagates automatically |
| `src/client.ts` | No changes required | |
| `src/index.ts` | Stays as stub per Phase 3 D-22 | Phase 8 exports `Body`, `Decode` |

### New files created in Phase 4

| File | Exports | Purpose |
|------|---------|---------|
| `src/body.ts` | `Body` (re-export of type), `serializeBody` (internal) | `Body.*` producer namespace |
| `src/decode.ts` | `Decoder<T>` class, `Decode` namespace | Two-tier decoder architecture |
| `src/preview.ts` | `readBodyPreview` | Extracted from `send.ts` |

### Dependency graph after Phase 4

```
types.ts          (no imports)
  ↑
body.ts           (imports: types.ts)
decode.ts         (imports: types.ts)
request.ts        (imports: types.ts)
preview.ts        (imports: types.ts)
  ↑
send.ts           (imports: types.ts, request.ts, body.ts, preview.ts)
  ↑
client.ts         (imports: types.ts, request.ts, send.ts)
```

No circular dependencies. [VERIFIED: src/send.ts line 3 — "Dependency direction: client.ts → send.ts → types.ts, request.ts"]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `instanceof ZodError` | Duck-type `.issues` array | Zod v3 moved to modular packaging | Required for peer-dep and monorepo scenarios |
| Drain body for discard | `cancel()` the stream | WHATWG Streams spec matured | Simpler; appropriate for v1; connection not pooled |
| Pre-buffer response then decode | Raw `Response` passed to decoder | WHATWG Fetch spec — cancel requires stream access | Correct separation; `discard()` impossible with pre-buffering |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `declare class Body` in `types.ts` (with `noEmit: true`) generates no runtime output and does not require any special handling | Pattern 1 | Low — `declare class` is standard TypeScript ambient declaration; no runtime artifact |
| A2 | `new Response(Uint8Array)` works in undici (Node.js 24) for synthetic response creation | Pattern 8 | Medium — if undici rejects `Uint8Array` as body, use `new Response(bytes.buffer)` (`ArrayBuffer`) instead; both are valid `BodyInit` |
| A3 | Zod `^3.25.0` will be used as the peer dependency version (per DOC-03 requirement) | Standard Stack | Low — version number is in REQUIREMENTS.md; DOC-03 specifies `"^3.25.0"` |
| A4 | `response.body?.cancel()` returns `Promise<void>` in both browser and Node.js | Pattern 4 | Low — WHATWG Streams spec defines `cancel()` as returning `Promise<void>`; both runtimes are spec-faithful |
| A5 | `Body.none()` should not call `serializeBody()` at all in `send.ts` (guard: `spec.body` is `undefined` or `body.kind === "none"`) | Pattern 9 | Low — `Body.none()` represents "no body"; passing `Uint8Array(0)` as body init would still work functionally but is cleaner to skip |

---

## Open Questions

1. **`Body.none()` implementation choice**
   - What we know: `Body.none()` means no request body; `serializeBody()` needs to handle it
   - What's unclear: Should `send.ts` special-case `body.kind === "none"` before calling `serializeBody()`, or should `serializeBody()` return `{ init: undefined }` for `none` and `send.ts` check `init !== undefined`?
   - Recommendation: Have `serializeBody()` return a discriminated result type or have `send.ts` check `spec.body.kind === "none"`. The simplest: `Body.none()` returns a body with kind `"none"`, `serializeBody()` returns `{ init: undefined }` as a special value, and `send.ts` only sets `fetchInit.body` when `init !== undefined`. This avoids adding a type union to the return — just use `BodyInit | undefined`.

2. **`TaggedEntry` field name: `decode` vs `_decode`**
   - What we know: `types.ts` currently has `readonly decode: unknown`; CONTEXT.md D-01 references `_decode`
   - What's unclear: CONTEXT.md mentions "opaque `readonly _decode: unknown` slot" but the actual types.ts has `decode` (no underscore). This is inconsistent.
   - Recommendation: Use `decode` as in types.ts (the authoritative source). The CONTEXT.md description may have been slightly off. [VERIFIED: src/types.ts line 67]

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is code/config-only. No new external tools, runtimes, services, or CLI utilities are introduced. All APIs are built-in browser/Node.js globals available in all target environments.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `vitest run --project node` |
| Full suite command | `vitest run` (all 4 projects: node, chromium, firefox, webkit) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BODY-01 | `Body.none()` produces no body; `serializeBody()` reflects this | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 |
| BODY-02 | `Body.json(value)` defers stringify; non-serializable value → `requestError` from `send()` | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 |
| BODY-03 | `Body.text(v)` → UTF-8; default content-type `text/plain; charset=utf-8` | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 |
| BODY-04 | `Body.formUrlEncoded({a: ["1","2"]})` → `a=1&a=2`; special chars encoded | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 |
| BODY-05 | `Body.bytes(u8)` passes `Uint8Array` through; caller-supplied content-type set | unit | `vitest run --project node tests/unit/body.test.ts` | ❌ Wave 0 |
| DEC-01 | `Decode.none()` — null body passes, empty stream passes, non-empty → `unexpectedBody` | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-02 | `Decode.discard()` — cancels body; no value returned; null body handled | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-03 | `Decode.text()` — returns string; empty body → `""` | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-04 | `Decode.json()` — parses JSON; empty body → `emptyBody`; bad JSON → `invalidJson` | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-05 | `Decode.json(schema)` — valid → typed value; invalid → `schemaMismatch` with `DecodeIssue[]` | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-06 | `Decode.bytes()` — returns `Uint8Array` equal to response body bytes | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-07 | `Decode.optional(inner)` — empty body → `undefined`; non-empty → delegates to `inner` | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| DEC-08 | null body and empty-stream both normalize to zero bytes before any decoder | unit | `vitest run --project node tests/unit/decode.test.ts` | ❌ Wave 0 |
| PREV-01 | `readBodyPreview()` reads from `response.body`, not `clone()`; reader cancelled in `finally` | unit | `vitest run --project node tests/unit/send.test.ts` | ✅ (in send.test.ts) |
| PREV-02 | `bodyPreviewBytes` configurable; defaults to `8192` | unit | `vitest run --project node tests/unit/send.test.ts` | ✅ (in send.test.ts) |
| PREV-03 | `BodyPreview.text` decoded as UTF-8 | unit | `vitest run --project node tests/unit/send.test.ts` | ✅ (in send.test.ts) |

**Additional integration test (D-09):** `send.ts` returns `{ kind: "requestError", error: { kind: "bodySerializationFailed" } }` when `Body.json(circular)` is used — add to `send.test.ts`.

### Sampling Rate
- **Per task commit:** `vitest run --project node`
- **Per wave merge:** `vitest run --project node` (browser tests require Playwright install; run full suite only in CI or when browser behavior is under test)
- **Phase gate:** Full suite (`vitest run`) green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/body.test.ts` — covers BODY-01 through BODY-05
- [ ] `tests/unit/decode.test.ts` — covers DEC-01 through DEC-08
- No new framework install needed — Vitest already configured

*(PREV-01, PREV-02, PREV-03 are already covered by existing `send.test.ts` tests that exercise `readBodyPreview` via `performSend`)*

---

## Security Domain

> Phase 4 involves no authentication, sessions, access control, or cryptography. The applicable ASVS categories are limited to input validation.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (partial) | `JSON.parse` is sandboxed; no eval; `URLSearchParams` handles encoding safely |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JSON prototype pollution via `JSON.parse` | Tampering | Node.js 24 `JSON.parse` is not vulnerable to prototype pollution by default; no `__proto__` object key injection risk in modern runtimes [ASSUMED] |
| `URLSearchParams` injection via special chars | Tampering | `URLSearchParams` percent-encodes all special characters; no injection risk |
| Arbitrary `JSON.stringify` serialization of caller-provided values | Information Disclosure | Body value is caller-controlled; library serializes what caller provides; no library-added secrets |

---

## Sources

### Primary (HIGH confidence)
- `src/types.ts` — verified all type definitions present in codebase
- `src/send.ts` — verified `readBodyPreview`, `noUncheckedIndexedAccess` pattern, `for...of` + `set()` byte assembly
- `src/client.ts` — verified dependency graph, no circular imports
- `.planning/phases/04-body-producers-decoders/04-CONTEXT.md` — all D-01 through D-12 locked decisions
- `.planning/REQUIREMENTS.md` — all BODY, DEC, PREV requirements
- `docs/SPEC.md` — §Request body contract, §Response decode contract, §Decode semantics, §RequestError
- `tsconfig.json` — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` all active
- `vitest.config.ts` — test runner configuration, project names, includes
- `tests/unit/send.test.ts` — established `mockFetch`, `new Response()` test patterns

### Secondary (MEDIUM confidence)
- MDN URLSearchParams — `append()` repeated key behavior, RFC 3986 encoding [ASSUMED — not fetched in this session but universally consistent]
- MDN TextDecoder — `fatal: false` default, `decode()` signature [ASSUMED — matches established send.ts usage]
- WHATWG Fetch spec — `BodyInit` includes `BufferSource` (covers `Uint8Array`) [ASSUMED — universally implemented]
- WHATWG Streams spec — `cancel()` on `ReadableStream` returns `Promise<void>` [ASSUMED — consistent with send.ts existing implementation]

### Tertiary (LOW confidence)
- None — no unverified claims require user confirmation beyond the Assumptions Log

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all verified from codebase and config files
- Architecture: HIGH — locked decisions from CONTEXT.md + verified from types.ts/send.ts structure
- Pitfalls: HIGH — P2/P3/P4/P8/P10/P14 all verified against codebase patterns or CONTEXT.md decisions
- Integration points: HIGH — verified from src/ file listing and import chains

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (stable API; 30-day horizon)
