# Phase 4: Body Producers + Decoders — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 9 (6 source, 3 test)
**Analogs found:** 7 / 9 (2 new files have no direct analog; RESEARCH.md patterns used)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/body.ts` | utility | request-response | `src/request.ts` | role-match (opaque-class + namespace pattern) |
| `src/decode.ts` | utility | request-response | `src/send.ts` (readBodyPreview) | partial (stream-reading pattern) |
| `src/preview.ts` | utility | request-response | `src/send.ts` lines 83–161 | **exact** (pure extract) |
| `src/types.ts` (MODIFY) | type definitions | — | `src/types.ts` itself | exact (extend existing union patterns) |
| `src/send.ts` (MODIFY) | service | request-response | `src/send.ts` itself | exact (extend existing) |
| `src/index.ts` (MODIFY) | entrypoint | — | `src/index.ts` itself | exact (add named re-exports) |
| `tests/unit/body.test.ts` | test | — | `tests/unit/request.test.ts` | role-match |
| `tests/unit/decode.test.ts` | test | — | `tests/unit/send.test.ts` | role-match (mockFetch + stream) |
| `tests/unit/preview.test.ts` | test | — | `tests/unit/send.test.ts` | role-match (mockFetch + stream) |

---

## Pattern Assignments

---

### `src/body.ts` (NEW — utility, request-response)

**Analog:** `src/request.ts` for the opaque-class pattern; `src/send.ts` for exactOptionalPropertyTypes conditional property pattern.

**Imports pattern** — copy from `src/request.ts` lines 1–6:
```typescript
import type {
  QueryValue,
  RequestSpec,
  ResponseMap,
  InferResponseUnion,
} from "./types.js";
```
→ Adapt for `body.ts`:
```typescript
import type { Body } from "./types.js";
```

**Opaque class + cast pattern** — copy from `src/request.ts` lines 28–51 (private constructor) adapted for Body:
```typescript
// src/request.ts lines 28–43 (Private constructor + static factory — the opaque pattern)
export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;

  private constructor(spec: RequestSpec) {
    this.#spec = spec;
  }

  static create<M extends ResponseMap>(
    input: RequestSpec<M>,
  ): Request<InferResponseUnion<M>> {
    return new Request(input);
  }
  // ...
}
```
→ In `body.ts`, there is no exported class. Instead, internal objects are cast to the opaque `Body` declared in `types.ts`. The pattern:
```typescript
// Cast internal representation to the opaque declared-class type
// Never instantiated via the declaration — types.ts declares, body.ts implements
function toBody(internal: BodyInternal): Body {
  return internal as unknown as Body;
}
function fromBody(body: Body): BodyInternal {
  return body as unknown as BodyInternal;
}
```

**Namespace object pattern** (from RESEARCH.md Pattern 6 — no existing codebase analog):
```typescript
export const Body = {
  none(): Body { ... },
  json(value: unknown): Body { ... },
  text(value: string, contentType?: string): Body { ... },
  formUrlEncoded(entries: Record<string, string | readonly string[]>): Body { ... },
  bytes(bytes: Uint8Array, contentType?: string): Body { ... },
} as const;
```
Factory functions NEVER throw; serialization deferred to `serializeBody()` (D-06).

**`exactOptionalPropertyTypes` conditional spread** — copy from `src/send.ts` lines 218–220:
```typescript
// src/send.ts lines 218–220 — conditional property assignment for exactOptionalPropertyTypes
const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
if (spec.body !== undefined) fetchInit.body = spec.body;
if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;
```
→ In `serializeBody()` return values, use conditional return (not conditional spread) per RESEARCH.md Pattern 9:
```typescript
// exactOptionalPropertyTypes: never return { contentType: undefined }
// Correct:
case "bytes":
  return internal.contentType !== undefined
    ? { init: internal.bytes, contentType: internal.contentType }
    : { init: internal.bytes };
```

**`serializeBody()` export pattern** — internal to the package, not re-exported from `index.ts`:
```typescript
// Only send.ts imports this — not public API (D-06)
export function serializeBody(body: Body): { init: BodyInit; contentType?: string } {
  const internal = fromBody(body);
  switch (internal.kind) { ... }
}
```

**Error handling** — none in factory functions (never throw). `serializeBody()` lets `JSON.stringify` throw; `send.ts` catches.

---

### `src/decode.ts` (NEW — utility, request-response)

**Analog:** `src/send.ts` lines 83–161 for the ReadableStream reading pattern; `src/request.ts` for the class+method pattern.

**Imports pattern** — copy structure from `src/send.ts` lines 5–14:
```typescript
// src/send.ts lines 5–14
import type {
  ClientSpec,
  QueryValue,
  RequestSpec,
  SendResult,
  BodyPreview,
  SendOptions,
} from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";
```
→ Adapt for `decode.ts`:
```typescript
import type { DecodeError, DecodeIssue, Schema, TaggedEntry } from "./types.js";
```

**Class with method pattern** — copy from `src/request.ts` lines 28–51:
```typescript
// src/request.ts lines 28–51 — class with private fields and public methods
export class Request<R> {
  #consumed = false;
  readonly #spec: RequestSpec;
  private constructor(spec: RequestSpec) { ... }
  static create<M extends ResponseMap>(...): Request<InferResponseUnion<M>> { ... }
  consume(): RequestSpec { ... }
}
```
→ Adapt for `Decoder<T>`:
```typescript
export class Decoder<T> {
  /** @internal — Phase 5 accesses this after casting entry.decode */
  readonly fn: DecoderFn<T>;
  constructor(fn: DecoderFn<T>) { this.fn = fn; }
  as<Tag extends string>(tag: Tag): TaggedEntry<T, Tag> {
    return { tag, decode: this };
  }
}
```

**Stream-reading with try/finally cancel** — copy from `src/send.ts` lines 102–137:
```typescript
// src/send.ts lines 102–137 — getReader() + try/finally cancel (non-negotiable cleanup)
const reader = response.body.getReader();
const chunks: Uint8Array[] = [];
let bytesRead = 0;
// ...
try {
  while (bytesRead < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    // ...
  }
} finally {
  // Non-negotiable: cancel the reader to release the TCP connection
  await reader.cancel().catch(() => {
    // Swallow cancel errors — they indicate the stream was already errored/closed
  });
}
```

**Byte buffer assembly (noUncheckedIndexedAccess)** — copy from `src/send.ts` lines 139–145:
```typescript
// src/send.ts lines 139–145 — for...of + set() avoids noUncheckedIndexedAccess pitfall
const all = new Uint8Array(bytesRead);
let offset = 0;
for (const chunk of chunks) {
  all.set(chunk, offset);
  offset += chunk.length;
}
```
Use the SAME `for...of` + `Uint8Array.set()` pattern in `readBytes()` inside `decode.ts`. Never use `chunks[i]`.

**Duck-type error detection** — copy from `src/send.ts` lines 64–76:
```typescript
// src/send.ts lines 64–76 — duck-type .name check; never instanceof across module boundaries
function classifyTransportError(error: unknown): SendResult<never> {
  let name = "";
  if (error !== null && typeof error === "object" && "name" in error) {
    const n = error.name;
    if (typeof n === "string") name = n;
  }
  // ...
}
```
→ Apply same duck-type pattern to Zod `.issues` detection in `normalizeSchemaError()`:
```typescript
// Never instanceof ZodError — duck-type .issues array (D-10)
if (
  error !== null &&
  typeof error === "object" &&
  "issues" in error &&
  Array.isArray((error as { issues: unknown }).issues)
) { ... }
```

**Null-body guard** — copy from `src/send.ts` lines 87–89:
```typescript
// src/send.ts lines 87–89 — null body = 204/304/HEAD — return empty immediately
if (response.body === null) {
  return { text: "", bytesRead: 0, truncated: false };
}
```
→ Adapt for `readBytes()`:
```typescript
if (response.body === null) {
  return new Uint8Array(0);
}
```

**Optional-cancel with null-guard** — copy from `src/send.ts` lines 95–99:
```typescript
// src/send.ts lines 95–99 — cancel with null-guard and swallowed error
const reader = response.body.getReader();
await reader.cancel().catch(() => {
  // Swallow cancel errors — stream may already be errored/closed
});
```
→ For `Decode.discard()` skip the reader entirely:
```typescript
// D-03: response.body?.cancel() — null-guard, no reader, no allocation
await response.body?.cancel().catch(() => {});
```

**`satisfies DecodeError` pattern** (from RESEARCH.md — no codebase analog yet):
```typescript
return { kind: "unexpectedBody" } satisfies DecodeError;
return { kind: "emptyBody" } satisfies DecodeError;
return { kind: "invalidJson", message } satisfies DecodeError;
return { kind: "schemaMismatch", issues } satisfies DecodeError;
```
Use `satisfies` for all discriminated-union literal returns so TypeScript narrows correctly.

**Function overloads pattern** — no existing codebase analog. Follow TypeScript standard:
```typescript
function json(): Decoder<unknown>;
function json<T>(schema: Schema<T>): Decoder<T>;
function json<T>(schema?: Schema<T>): Decoder<unknown> | Decoder<T> {
  // implementation
}
```

**Namespace export** — same as `Body` namespace above:
```typescript
export const Decode = {
  none(): Decoder<void> { ... },
  discard(): Decoder<void> { ... },
  text(): Decoder<string> { ... },
  json(): Decoder<unknown>;
  json<T>(schema: Schema<T>): Decoder<T>;
  bytes(): Decoder<Uint8Array> { ... },
  optional<T>(inner: Decoder<T>): Decoder<T | undefined> { ... },
} as const;
```

---

### `src/preview.ts` (NEW — utility, request-response)

**Analog:** `src/send.ts` lines 79–161 — **exact extract with no behavior change** (D-11).

**Complete function to move** (copy `src/send.ts` lines 79–161 verbatim):
```typescript
// src/send.ts lines 79–81 — file header comment pattern
// D-15, D-16, D-17: Body preview streaming with correct truncation detection
// Signal-aware: combinedSignal governs the body stream in Node 24+ native fetch (undici).
// When signal fires during reader.read(), the read rejects with signal.reason.
// D-12: We re-throw on error — the outer performSend() catch calls classifyTransportError().
// This ensures "deadline fires during body reading → timeout" (not network or decodeError).
async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> { ... }
```

**Imports for preview.ts** — adapt from `src/send.ts` lines 5–12:
```typescript
import type { BodyPreview } from "./types.js";
```
That is the only import needed. The function references only `globalThis.Response` (no import needed) and `BodyPreview` from types.

**Export** — export the function (was unexported/module-private in send.ts):
```typescript
export async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> { ... }
```

**File header comment** — follow `src/send.ts` line 1–3 pattern:
```typescript
// src/preview.ts — body preview streaming; extracted from send.ts (D-11)
// Dependency direction: send.ts → preview.ts → types.ts
```

---

### `src/types.ts` (MODIFY — type definitions)

**Analog:** Itself. Follow the established union patterns already in the file.

**Existing union pattern to copy** (lines 43–46 for new `RequestError` union):
```typescript
// src/types.ts lines 43–46 — TransportError union pattern to copy
export type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };
```
→ New `RequestError` union follows identical structure:
```typescript
export type RequestError =
  | { kind: "bodySerializationFailed"; message: string }
  | { kind: "requestConsumed" }
  | { kind: "missingBaseUrl" }
  | { kind: "duplicateResponseTag"; tag: string }
  | { kind: "invalidSpec"; message: string };
```

**Existing `SendResult<R>` variant pattern to copy** (lines 48–63):
```typescript
// src/types.ts lines 48–63 — discriminated union variant pattern
export type SendResult<R> =
  | { kind: "response"; response: R }
  | { kind: "transportError"; error: TransportError }
  | {
      kind: "decodeError";
      status: number;
      headers: Headers;
      error: DecodeError;
      preview: BodyPreview;
    }
  | {
      kind: "unhandledStatus";
      status: number;
      headers: Headers;
      preview: BodyPreview;
    };
```
→ Add fifth variant following the same inline style:
```typescript
  | { kind: "requestError"; error: RequestError }
```

**`declare class` pattern for opaque Body** — no existing codebase analog; declared in types.ts to avoid circular imports. From RESEARCH.md Pattern 1:
```typescript
// Opaque Body — implementation in body.ts; declared here so RequestSpecBase can reference it
// without introducing an import. declare class creates a nominal type, never instantiated via
// this declaration.
export declare class Body {
  private constructor();
  private readonly _kind: string;
}
```
Place BEFORE `RequestSpecBase` (which references `Body` in `body?: Body`).

**`RequestSpecBase.body` field change** (line 90 of types.ts):
```typescript
// BEFORE (line 90):
readonly body?: BodyInit;
// AFTER:
readonly body?: Body;
```

**Zero-imports invariant** — `types.ts` MUST keep zero imports (tested in `tests/unit/types.test.ts` line 16–24). `declare class` and all new types require zero imports. This is a hard constraint.

---

### `src/send.ts` (MODIFY — service, request-response)

**Analog:** Itself. All patterns already established — additions only.

**Import block additions** — copy structure from `src/send.ts` lines 5–14:
```typescript
// src/send.ts lines 5–14 — existing imports block
import type {
  ClientSpec,
  QueryValue,
  RequestSpec,
  SendResult,
  BodyPreview,
  SendOptions,
} from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";
```
→ Add two new imports:
```typescript
import { serializeBody } from "./body.js";
import { readBodyPreview } from "./preview.js";
```
And remove the inline `readBodyPreview` function (lines 79–161).

**Body serialization failure path** — copy `classifyTransportError` catch pattern (lines 238–240):
```typescript
// src/send.ts lines 238–240 — existing catch → structured result pattern
  } catch (error) {
    return classifyTransportError(error);
  }
```
→ Add body serialization try/catch BEFORE the `fetchInit` build, using the same "return structured result" pattern:
```typescript
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
```

**Conditional fetchInit.body assignment** — copy from `src/send.ts` lines 218–219:
```typescript
// src/send.ts lines 218–219 — exactOptionalPropertyTypes conditional assignment
const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
if (spec.body !== undefined) fetchInit.body = spec.body;
```
→ Replace with serialized body:
```typescript
const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
if (serialized?.init !== undefined) fetchInit.body = serialized.init;
if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;
// Set content-type from body if not caller-overridden:
if (serialized?.contentType !== undefined && headers["content-type"] === undefined) {
  headers["content-type"] = serialized.contentType;
}
```

**Dependency comment update** — copy from `src/send.ts` line 2:
```typescript
// src/send.ts line 1–3 — dependency direction comment pattern
// src/send.ts — single-attempt transport core
// Dependency direction: client.ts → send.ts → types.ts, request.ts
```
→ Update to:
```typescript
// Dependency direction: client.ts → send.ts → body.ts, preview.ts, types.ts, request.ts
```

---

### `src/index.ts` (MODIFY — entrypoint)

**Analog:** Itself. Current file re-exports from `shared.js`.

**Current export pattern** (`src/index.ts` lines 1–12):
```typescript
import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
  type RuntimeTarget,
} from "./shared.js";
// ...
export const runtimeTarget: RuntimeTarget = rootSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = rootSurface.describe;
```

**New re-exports to add** — follow the ESM re-export convention seen across the file:
```typescript
// Named type re-exports (types only, no runtime cost)
export type { Body, RequestError, BodyPreview, RequestSpec, SendResult, DecodeError } from "./types.js";
// Value re-exports
export { Decoder } from "./decode.js";
export { Decode } from "./decode.js";
// Body namespace (value)
export { Body as _Body } from "./body.js"; // if Body collides; or merge carefully
```
Note: `Body` is declared as a `declare class` in `types.ts` — it is both a type AND a namespace value. Export the `Body` namespace from `body.ts` as the value, and re-export the declared type from `types.ts` as the type. The names must not collide. The planner should resolve the precise export structure based on the final implementation.

---

### `tests/unit/body.test.ts` (NEW — test)

**Analog:** `tests/unit/request.test.ts` — pure function/factory tests with no async, no mocks.

**Imports pattern** — copy from `tests/unit/request.test.ts` lines 1–3:
```typescript
import { describe, it, expect } from "vitest";
import { Request, buildPath, buildQuery } from "../../src/request.js";
```
→ Adapt:
```typescript
import { describe, it, expect } from "vitest";
import { Body, serializeBody } from "../../src/body.js";
```

**Test structure** — copy from `tests/unit/request.test.ts` lines 4–24 (describe → it → expect):
```typescript
describe("REQ-01: Request.create() builds RequestSpec", () => {
  it("stores method and responses", () => {
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const spec = req.consume();
    expect(spec.method).toBe("GET");
  });
});
```
→ Body tests follow same synchronous assert pattern (factories never throw):
```typescript
describe("BODY-01: Body.none() — no request body", () => {
  it("serializeBody(Body.none()) returns no BodyInit", () => {
    const body = Body.none();
    const result = serializeBody(body);
    expect(result.init).toBeUndefined(); // or check special none sentinel
  });
});
```

---

### `tests/unit/decode.test.ts` (NEW — test)

**Analog:** `tests/unit/send.test.ts` — async tests with Response mocks and structured result assertions.

**Imports pattern** — copy from `tests/unit/send.test.ts` lines 1–4:
```typescript
import { describe, it, expect } from "vitest";
import { performSend } from "../../src/send.js";
import { createClient } from "../../src/client.js";
import { Request } from "../../src/request.js";
```
→ Adapt:
```typescript
import { describe, it, expect } from "vitest";
import { Decode, Decoder } from "../../src/decode.js";
```

**Async test + Response mock pattern** — copy from `tests/unit/send.test.ts` lines 14–28:
```typescript
it("returns { kind: 'unhandledStatus' } for HTTP 200 with body", async () => {
  const mockFetch: typeof globalThis.fetch = async () =>
    new Response("hello world", { status: 200 });
  // ...
});
```
→ Adapt for decoder tests:
```typescript
it("Decode.text() returns string for non-empty body", async () => {
  const response = new Response("hello world", { status: 200 });
  const decoder = Decode.text();
  const result = await decoder.fn(response);
  expect(result).toBe("hello world");
});
```

**Structured result narrowing pattern** — copy from `tests/unit/send.test.ts` lines 22–28:
```typescript
expect(result.kind).toBe("unhandledStatus");
if (result.kind === "unhandledStatus") {
  expect(result.status).toBe(200);
  expect(result.preview.text).toBe("hello world");
}
```
→ Adapt for DecodeError narrowing:
```typescript
expect((result as { kind: string }).kind).toBe("emptyBody");
```

**Null-body Response pattern** — copy from `tests/unit/send.test.ts` line 113:
```typescript
fetch: async () => new Response(null, { status: 200 }),
```
→ Use directly in decode tests:
```typescript
const emptyResponse = new Response(null, { status: 204 });
```

---

### `tests/unit/preview.test.ts` (NEW — test)

**Analog:** `tests/unit/send.test.ts` — async tests using `new Response(...)` mocks.

**Imports pattern** — copy from `tests/unit/send.test.ts` line 2, adapt:
```typescript
import { describe, it, expect } from "vitest";
import { readBodyPreview } from "../../src/preview.js";
```

**Response mock + async assertion** — copy from `tests/unit/send.test.ts` lines 14–28:
```typescript
const mockFetch: typeof globalThis.fetch = async () =>
  new Response("hello world", { status: 200 });
```
→ In preview tests, construct Response directly:
```typescript
it("reads up to maxBytes from response body", async () => {
  const response = new Response("hello world");
  const preview = await readBodyPreview(response, 5);
  expect(preview.bytesRead).toBe(5);
  expect(preview.truncated).toBe(true);
  expect(preview.text).toBe("hello");
});
```

**Null-body test** — copy `new Response(null, ...)` pattern:
```typescript
it("returns empty preview for null body (204)", async () => {
  const response = new Response(null, { status: 204 });
  const preview = await readBodyPreview(response, 8192);
  expect(preview.text).toBe("");
  expect(preview.bytesRead).toBe(0);
  expect(preview.truncated).toBe(false);
});
```

---

## Shared Patterns

### TypeScript Strict Mode Guards

**Source:** `src/send.ts` throughout; `tsconfig.json`
**Apply to:** All new/modified source files

Three recurring strict-mode patterns to copy everywhere:

1. **`exactOptionalPropertyTypes` — never return `{ prop: undefined }`; omit the key or use conditional return:**
   ```typescript
   // src/send.ts lines 218–220
   if (spec.body !== undefined) fetchInit.body = spec.body;
   ```

2. **`noUncheckedIndexedAccess` — never use `arr[i]`; use `for...of`:**
   ```typescript
   // src/send.ts lines 141–145
   for (const chunk of chunks) {
     all.set(chunk, offset);
     offset += chunk.length;
   }
   ```

3. **`?.` null-guard on `response.body`:**
   ```typescript
   // src/send.ts lines 87–89, 95–99
   if (response.body === null) { ... }
   await response.body?.cancel().catch(() => {});
   ```

---

### Duck-Type Error Detection (never instanceof)

**Source:** `src/send.ts` lines 64–76
**Apply to:** `src/decode.ts` (`normalizeSchemaError`), `src/send.ts` (existing), `src/body.ts` (serializeBody error message extraction)

```typescript
// src/send.ts lines 64–76 — canonical duck-type pattern
function classifyTransportError(error: unknown): SendResult<never> {
  let name = "";
  if (error !== null && typeof error === "object" && "name" in error) {
    const n = error.name;
    if (typeof n === "string") name = n;
  }
  // ...
}
```
For Zod errors in `decode.ts`:
```typescript
// Duck-type .issues; never instanceof ZodError (D-10)
if (
  error !== null &&
  typeof error === "object" &&
  "issues" in error &&
  Array.isArray((error as { issues: unknown }).issues)
) { ... }
```
For error message extraction in `send.ts` body failure path:
```typescript
const message = e instanceof Error ? e.message : String(e);
```
(Using `instanceof Error` is safe here — it's within the same module for a standard Error.)

---

### Try/Finally Reader Cancel (connection hygiene)

**Source:** `src/send.ts` lines 107–137
**Apply to:** `src/decode.ts` (`readBytes`, `Decode.none()`), `src/preview.ts` (preserved from send.ts)

```typescript
// src/send.ts lines 132–137 — non-negotiable cleanup in finally
} finally {
  // Non-negotiable: cancel the reader to release the TCP connection
  await reader.cancel().catch(() => {
    // Swallow cancel errors — they indicate the stream was already errored/closed
  });
}
```
Every `getReader()` call MUST have this `finally` block. The `catch(() => {})` swallow is intentional.

---

### Discriminated Union Result Returns

**Source:** `src/types.ts` + `src/send.ts` lines 70–76
**Apply to:** `src/decode.ts` (return `DecodeError` variants), `src/send.ts` (return `requestError` variant)

```typescript
// src/send.ts lines 70–76 — return structured result, never throw
if (name === "TimeoutError") {
  return { kind: "transportError", error: { kind: "timeout" } };
}
if (name === "AbortError") {
  return { kind: "transportError", error: { kind: "aborted" } };
}
return { kind: "transportError", error: { kind: "network", cause: error } };
```
Use `satisfies DecodeError` to let TypeScript verify the variant:
```typescript
return { kind: "emptyBody" } satisfies DecodeError;
```

---

### File Header Comment Convention

**Source:** `src/send.ts` lines 1–3, `src/types.ts` line 1
**Apply to:** All new source files

```typescript
// src/send.ts lines 1–3
// src/send.ts — single-attempt transport core
// Dependency direction: client.ts → send.ts → types.ts, request.ts
// send.ts NEVER imports from client.ts (D-03: no circular imports)
```
```typescript
// src/types.ts line 1
// src/types.ts — shared type definitions; zero imports, zero logic
```
New files:
```typescript
// src/body.ts — opaque Body producers + serializeBody() internal helper
// Dependency direction: send.ts → body.ts → types.ts

// src/decode.ts — Decoder<T> class + Decode.* namespace
// Dependency direction: (Phase 5 dispatch) → decode.ts → types.ts

// src/preview.ts — readBodyPreview() extracted from send.ts (D-11, pure refactor)
// Dependency direction: send.ts → preview.ts → types.ts
```

---

### Test mockFetch Injection Pattern

**Source:** `tests/unit/send.test.ts` lines 15–16
**Apply to:** `tests/unit/decode.test.ts`, `tests/unit/preview.test.ts`

```typescript
// tests/unit/send.test.ts lines 15–16 — injectable fetch for test isolation
const mockFetch: typeof globalThis.fetch = async () =>
  new Response("hello world", { status: 200 });
```
Decode and preview tests use `new Response(...)` directly (no fetch injection needed — they test the response-reading layer, not the transport layer).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/body.ts` (Body namespace) | utility | request-response | No namespace-object export pattern exists yet; factory functions are new |
| `src/decode.ts` (Decode namespace) | utility | request-response | No decoder pattern exists yet; two-tier architecture is new to codebase |

These two files should be built directly from RESEARCH.md Patterns 1–10 and the CONTEXT.md decisions. The stream-reading sub-patterns within `decode.ts` have strong analogs in `send.ts` (readBodyPreview).

---

## Metadata

**Analog search scope:** `src/`, `tests/unit/`
**Files scanned:** 8 source files, 4 test files
**Pattern extraction date:** 2026-05-05

**Critical constraints carried forward (from PROJECT.md / copilot-instructions.md):**
- `types.ts` MUST have zero imports (tested; `declare class Body` satisfies this)
- All source files: strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- ESM-only: all imports use `.js` extension (e.g., `"./body.js"`, `"./preview.js"`)
- Zero runtime dependencies — no new packages
- `instanceof` forbidden across module boundaries; duck-type on `.name` / `.issues`
