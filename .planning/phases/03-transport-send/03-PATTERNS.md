# Phase 3: Transport + Send — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 5 (2 new, 3 modified)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/send.ts` | service | request-response | `src/request.ts` | role-match (module structure, strict TS, ESM conventions) |
| `src/client.ts` | service | request-response | `src/client.ts` (itself — additive modification) | exact |
| `src/types.ts` | model | transform | `src/types.ts` (itself — additive modification) | exact |
| `tests/unit/send.test.ts` | test | request-response | `tests/unit/request.test.ts` | exact |
| `tests/unit/client.test.ts` | test | request-response | `tests/unit/client.test.ts` (itself — additive modification) | exact |

---

## Pattern Assignments

### `src/send.ts` (new file — service, request-response)

**Analog:** `src/request.ts` (module-level exports, zero-default-export, strict TypeScript, `.js` ESM extensions)

**Imports pattern** (`src/request.ts` lines 1–6):
```typescript
import type {
  QueryValue,
  RequestSpec,
  ResponseMap,
  InferResponseUnion,
} from "./types.js";
```

For `src/send.ts`, the import block should be:
```typescript
import type { ClientSpec, SendResult, BodyPreview, SendOptions } from "./types.js";
import type { Request } from "./request.js";
import { buildPath, buildQuery } from "./request.js";
```

**Constraints: verbatimModuleSyntax** — use `import type` for all type-only imports, `import { ... }` only for values used at runtime (functions called, not just types). Source: `tsconfig.json` + `src/request.ts` line 1 demonstrates the split.

**Core pattern — performSend skeleton** (RESEARCH.md Pattern 1, lines 174–228):
```typescript
export async function performSend<R>(
  request: Request<R>,
  clientSpec: ClientSpec,
  options?: SendOptions,
): Promise<SendResult<R>> {
  // D-05: Pre-abort guard — BEFORE request.consume()
  if (options?.signal?.aborted === true) {
    return { kind: "transportError", error: { kind: "aborted" } };
  }

  const spec = request.consume(); // TypeError on re-use — intentional propagation (D-06)

  const effectiveDeadlineMs = spec.deadlineMs ?? clientSpec.deadlineMs;
  if (effectiveDeadlineMs !== undefined && effectiveDeadlineMs <= 0) {
    throw new RangeError("deadlineMs must be a positive integer"); // D-07
  }

  let deadlineController: AbortController | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const callerSignal = options?.signal;

  if (effectiveDeadlineMs !== undefined) {
    deadlineController = new AbortController();
    deadlineTimer = setTimeout(
      () =>
        deadlineController!.abort(
          new DOMException("Deadline exceeded", "TimeoutError"), // D-10: MUST use "TimeoutError"
        ),
      effectiveDeadlineMs,
    );
  }

  // D-09: four signal composition cases
  const combinedSignal: AbortSignal | undefined =
    callerSignal !== undefined && deadlineController !== undefined
      ? AbortSignal.any([callerSignal, deadlineController.signal])
      : deadlineController !== undefined
        ? deadlineController.signal
        : callerSignal;

  try {
    // ... fetch call (see fetch init pattern below)
    // ... body preview read (see body preview pattern below)
    // ... Phase 3 stub: return { kind: "unhandledStatus", ... }
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer); // D-08
  }
}
```

**Transport error classification pattern** (RESEARCH.md Pattern 2, lines 232–243):
```typescript
function classifyTransportError(error: unknown): SendResult<never> {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") {
    return { kind: "transportError", error: { kind: "timeout" } };
  }
  if (name === "AbortError") {
    return { kind: "transportError", error: { kind: "aborted" } };
  }
  return { kind: "transportError", error: { kind: "network", cause: error } };
}
```
Apply to BOTH the `fetch()` catch block AND the body-read catch block (D-11, D-12).

**fetch init construction — exactOptionalPropertyTypes guard** (RESEARCH.md Pitfall 6):
```typescript
// WRONG under exactOptionalPropertyTypes:
//   { signal: combinedSignal }  — rejects if combinedSignal can be undefined
// CORRECT: conditional assignment
const fetchInit: RequestInit = { method: spec.method, headers, redirect: "follow" };
if (spec.body !== undefined) fetchInit.body = spec.body as BodyInit;
if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;
```

**URL construction pattern** (RESEARCH.md Pattern 4, lines 316–336):
```typescript
function buildUrl(spec: RequestSpec, clientSpec: ClientSpec): URL {
  if (spec.absoluteUrl !== undefined) {
    return new URL(String(spec.absoluteUrl));
  }
  const path = spec.path !== undefined ? buildPath(spec.path) : "";
  const base = String(clientSpec.baseUrl ?? "");
  // CRITICAL: baseUrl must end with "/" or last segment is replaced (Pitfall 5)
  const url = new URL(path, base);
  const params = buildQuery(spec.query ?? {});
  const paramStr = params.toString();
  if (paramStr.length > 0) url.search = paramStr;
  return url;
}
```

**Body preview reading pattern** (RESEARCH.md Pattern 3, lines 252–306):
```typescript
async function readBodyPreview(
  response: globalThis.Response,
  maxBytes: number,
): Promise<BodyPreview> {
  if (response.body === null) {
    return { text: "", bytesRead: 0, truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      if (value.length <= remaining) {
        chunks.push(value);
        bytesRead += value.length;
        if (bytesRead === maxBytes) {
          // D-15: Peek one extra read to verify stream exhaustion (Pitfall 4)
          const { done: isDone } = await reader.read();
          if (!isDone) truncated = true;
          break;
        }
      } else {
        chunks.push(value.slice(0, remaining));
        bytesRead += remaining;
        truncated = true;
        break;
      }
    }
  } catch (e) {
    // D-12: classify abort/timeout — caller must handle this return
    await reader.cancel().catch(() => { /* swallow cancel errors */ });
    return classifyTransportError(e) as never;
  } finally {
    await reader.cancel().catch(() => { /* swallow cancel errors */ });
  }

  const all = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }

  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(all); // D-17
  } catch { /* swallow — text remains "" */ }

  return { text, bytesRead, truncated };
}
```

**Phase 3 HTTP response stub** (CONTEXT.md D-13, D-14):
```typescript
// Phase 3 stub: ALL HTTP responses return unhandledStatus
// Phase 5 replaces this block with matching + decode dispatch
const preview = await readBodyPreview(
  response,
  clientSpec.diagnostics?.bodyPreviewBytes ?? 8192,
);
return {
  kind: "unhandledStatus",
  status: response.status,
  headers: response.headers,
  preview,
};
```

**Named exports only** (`src/request.ts` lines 8–51, `src/client.ts` throughout):
```typescript
// All exports are named — no default export
export async function performSend<R>(...) { ... }
// performSend is NOT re-exported from entrypoints (D-04)
```

---

### `src/client.ts` (modified — service, request-response)

**Analog:** `src/client.ts` itself (additive modification)

**Existing imports** (`src/client.ts` lines 1):
```typescript
import type { ClientSpec, QueryValue } from "./types.js";
```

**New imports to add** (RESEARCH.md Pattern 5, lines 347–349):
```typescript
import type { ClientSpec, QueryValue, SendOptions, SendResult } from "./types.js";
import type { Request } from "./request.js";
import { performSend } from "./send.js";
```

**Existing merge utilities stay unchanged** (`src/client.ts` lines 3–29):
```typescript
export function mergeHeaders(
  base: Record<string, string | undefined> | undefined,
  override: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value;
  }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value;
  }
  return result;
}
// mergeQuery follows same pattern — keep as-is
```

**Client interface + createClient refactor** (RESEARCH.md Pattern 5, lines 351–359):
```typescript
export interface Client {
  send<R>(request: Request<R>, options?: SendOptions): Promise<SendResult<R>>;
}

// Replace existing createClient (currently returns ClientSpec):
export function createClient(spec: ClientSpec): Client {
  return {
    send: (req, opts) => performSend(req, spec, opts),
  };
}
```

**Critical: no circular import** (CONTEXT.md D-03, RESEARCH.md Pitfall 2):
- `client.ts` imports `performSend` FROM `send.ts` ✓
- `send.ts` NEVER imports from `client.ts` ✓
- `send.ts` imports only from `types.ts` and `request.ts` ✓

---

### `src/types.ts` (modified — model, transform)

**Analog:** `src/types.ts` itself (single additive line)

**Zero-imports constraint** (`types.test.ts` lines 15–24):
```typescript
// The test enforces this invariant — NEVER add an import to types.ts
describe("TYPES-01: types.ts has zero imports", () => {
  it("src/types.ts contains no import statements", () => {
    // Reads types.ts source and asserts importLines.length === 0
  });
});
```

**Addition: SendOptions type** (CONTEXT.md D-02, RESEARCH.md Pattern 5 line 344):
```typescript
// Add after existing type exports, before or after ClientSpec
// No import needed — AbortSignal is a global
export type SendOptions = { signal?: AbortSignal };
```

---

### `tests/unit/send.test.ts` (new file — test, request-response)

**Analog:** `tests/unit/request.test.ts` (structure, import style, describe/it/expect pattern)

**Imports pattern** (`tests/unit/request.test.ts` lines 1–2):
```typescript
import { describe, it, expect } from "vitest";
import { Request, buildPath, buildQuery } from "../../src/request.js";
```

For `tests/unit/send.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { performSend } from "../../src/send.js";
import { Request } from "../../src/request.js";
import type { ClientSpec, SendOptions } from "../../src/types.js";
```

**Test structure pattern** (`tests/unit/request.test.ts` lines 4–24):
```typescript
describe("REQ-XX: Description of requirement", () => {
  it("specific behavior being tested", () => {
    // Arrange
    const req = Request.create({ method: "GET", path: [], responses: {} });
    // Act
    const spec = req.consume();
    // Assert
    expect(spec.method).toBe("GET");
  });
});
```

**Async test pattern** (`tests/unit/client.test.ts` lines 4–22):
```typescript
describe("createClient()", () => {
  it("returns baseUrl and deadlineMs from spec", () => {
    const client = createClient({ baseUrl: "https://example.com", deadlineMs: 5000 });
    expect(client.baseUrl).toBe("https://example.com");
  });
});
```

For async send tests:
```typescript
describe("SEND-XX: Description", () => {
  it("behavior description", async () => {
    const mockFetch = async (_url: URL | string, _init?: RequestInit): Promise<Response> =>
      new Response("body", { status: 200 });
    const spec: ClientSpec = { fetch: mockFetch };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, spec);
    expect(result.kind).toBe("unhandledStatus");
  });
});
```

**Error/throw test pattern** (`tests/unit/request.test.ts` lines 70–86):
```typescript
it("throws TypeError with exact message", () => {
  const req = Request.create({ method: "GET", path: [], responses: {} });
  req.consume();
  expect(() => req.consume()).toThrow(TypeError);
  expect(() => {
    const r = Request.create({ method: "GET", path: [], responses: {} });
    r.consume();
    r.consume();
  }).toThrow("Request has already been consumed and cannot be sent again");
});
```

For `RangeError` test (D-07):
```typescript
it("throws RangeError when deadlineMs <= 0", async () => {
  const spec: ClientSpec = { deadlineMs: 0, fetch: async () => new Response() };
  const req = Request.create({ method: "GET", path: [], responses: {} });
  await expect(performSend(req, spec)).rejects.toThrow(RangeError);
});
```

**Injectable fetch as test seam** (CONTEXT.md D-21 — `clientSpec.fetch ?? globalThis.fetch`):
```typescript
// All send.test.ts tests inject a mock fetch via ClientSpec.fetch
// This is the ONLY test seam; never patch globalThis.fetch
const mockFetch: typeof globalThis.fetch = async (_url, _init) => {
  return new Response(null, { status: 200 });
};
const spec: ClientSpec = { fetch: mockFetch };
```

---

### `tests/unit/client.test.ts` (modified — test, request-response)

**Analog:** `tests/unit/client.test.ts` itself (additive modification)

**Existing tests stay unchanged.** Add new describe block for `Client` interface and refactored `createClient()`:

**Pattern for new Client interface tests** (mirroring `tests/unit/client.test.ts` lines 4–22):
```typescript
describe("createClient() — returns Client (Phase 3)", () => {
  it("returns an object with a send() method", () => {
    const client = createClient({ baseUrl: "https://example.com" });
    expect(typeof client.send).toBe("function");
  });
});
```

---

## Shared Patterns

### ESM `.js` Import Extensions
**Source:** `src/request.ts` line 6, `src/client.ts` line 1, `tests/unit/request.test.ts` line 2
**Apply to:** All new/modified `src/*.ts` and `tests/unit/*.ts` files
```typescript
// All relative imports use .js extension in .ts files
import type { ... } from "./types.js";
import { ... } from "../../src/request.js";
```

### `import type` for Type-Only Imports
**Source:** `src/request.ts` lines 1–6, `src/client.ts` line 1
**Apply to:** `src/send.ts`, `src/client.ts`, `tests/unit/send.test.ts`
```typescript
// verbatimModuleSyntax requires import type for type-only usage
import type { ClientSpec, SendResult, BodyPreview, SendOptions } from "./types.js";
import type { Request } from "./request.js";   // type-only: used in signatures, not called
import { buildPath, buildQuery } from "./request.js";  // value: functions called at runtime
```

### Named Exports Only (No Default Export)
**Source:** `src/request.ts` lines 8, 12, 28; `src/client.ts` lines 3, 17, 31
**Apply to:** `src/send.ts`, `src/client.ts`
```typescript
// Named exports — never `export default`
export function buildPath(...) { ... }
export class Request<R> { ... }
export function createClient(...) { ... }
```

### `exactOptionalPropertyTypes` — Conditional Property Assignment
**Source:** RESEARCH.md Pitfall 6 (verified against `tsconfig.json`)
**Apply to:** `src/send.ts` (fetch init construction, `combinedSignal`)
```typescript
// WRONG: { signal: undefinedValue } — TypeScript error
// CORRECT: build object then conditionally assign
const fetchInit: RequestInit = { method, headers, redirect: "follow" };
if (combinedSignal !== undefined) fetchInit.signal = combinedSignal;
```

### `noUncheckedIndexedAccess` — Array Access
**Source:** `src/request.ts` lines 16–21 (uses `for...of`, never index access); RESEARCH.md Pitfall 7
**Apply to:** `src/send.ts` (Uint8Array chunk assembly)
```typescript
// Avoid: chunks[i] has type Uint8Array | undefined
// CORRECT: use for...of and Uint8Array.set() with tracked offset
let offset = 0;
for (const chunk of chunks) {
  all.set(chunk, offset);
  offset += chunk.length;
}
```

### Never-Throws Contract for Structured Results
**Source:** `src/request.ts` lines 43–50 (TypeError is intentional for programming errors); CONTEXT.md D-06
**Apply to:** `src/send.ts` (all HTTP/transport outcomes)
```typescript
// Programming errors (re-use, invalid args) MAY throw
// Transport, network, abort, timeout, body-read errors MUST return structured results
try {
  const response = await fetchImpl(url, fetchInit);
  // ... always returns SendResult, never throws
} catch (e) {
  return classifyTransportError(e); // never re-throws
}
```

### Vitest Test Structure
**Source:** `tests/unit/request.test.ts` lines 1–87, `tests/unit/client.test.ts` lines 1–89
**Apply to:** `tests/unit/send.test.ts`, `tests/unit/client.test.ts` additions
```typescript
import { describe, it, expect } from "vitest";
// No beforeEach/afterEach unless shared setup genuinely needed
// Describe label follows "REQID-NN: Short description" convention
// Import directly from ../../src/*.js — never from package entrypoints
```

---

## No Analog Found

All Phase 3 files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

| File | Note |
|------|------|
| `src/send.ts` | No existing transport/fetch module; `src/request.ts` is the closest structural analog for module conventions. RESEARCH.md Patterns 1–4 are verified runtime-tested references for the transport logic itself. |

---

## Critical Anti-Patterns (Do Not Copy These)

These patterns exist in the current codebase but must NOT be carried into Phase 3 files:

| Anti-Pattern | Location | What to Do Instead |
|---|---|---|
| `createClient` returns `ClientSpec` | `src/client.ts` line 31–33 | Replace with `Client` return type per D-01 |
| `{ ...spec }` spread for client creation | `src/client.ts` line 32 | Replace with `{ send: (req, opts) => performSend(req, spec, opts) }` |
| Accessing `client.baseUrl` directly on `createClient()` result | `tests/unit/client.test.ts` lines 6–8 | After refactor, `Client` only exposes `.send()`. Update these tests. |

---

## Metadata

**Analog search scope:** `src/`, `tests/unit/`
**Files scanned:** 6 (`src/request.ts`, `src/client.ts`, `src/types.ts`, `tests/unit/request.test.ts`, `tests/unit/client.test.ts`, `tests/unit/types.test.ts`)
**Pattern extraction date:** 2026-05-05
