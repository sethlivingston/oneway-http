# Pitfalls Research

**Domain:** TypeScript ESM HTTP client library (browser + Node.js)
**Researched:** 2026-05-04
**Confidence:** HIGH — all critical findings verified by live Node.js 24 execution; Zod findings verified against official Zod library-author docs; TypeScript strict mode findings verified against TypeScript source and wiki.

---

## Critical Pitfalls

### Pitfall 1: `AbortSignal.any()` — Wrong reason.name breaks error classification

**What goes wrong:**
`fetch()` throws `signal.reason` **directly** — not a wrapper around it. If both the caller's signal and the deadline controller fire, `AbortSignal.any()` returns the reason from whichever signal aborted first. If the deadline controller was initialized with `AbortError` instead of `TimeoutError`, the library cannot tell whether the operation timed out or the caller cancelled. The result: every deadline expiry surfaces as `{ kind: "aborted" }` instead of `{ kind: "timeout" }`, permanently misclassifying the most important transport error.

The same problem appears during body reading: if the abort signal fires while `response.text()` or `response.arrayBuffer()` is in progress, `fetch` throws `signal.reason` directly — same shape, same classification requirement.

**Why it happens:**
Developers reach for `new AbortController()` for everything and call `controller.abort()` with no argument or with a generic Error. Both produce `reason.name === "AbortError"`. The deadline case requires `reason.name === "TimeoutError"` to distinguish.

**How to avoid:**
- Abort the deadline controller with a `DOMException` that has `name: "TimeoutError"`:
  ```ts
  deadlineController.abort(new DOMException("operation deadline exceeded", "TimeoutError"));
  ```
- Classify transport errors by inspecting `error.name`:
  - `"AbortError"` → `{ kind: "aborted" }`
  - `"TimeoutError"` → `{ kind: "timeout" }`
  - anything else → `{ kind: "network", cause: error }`
- Apply identical classification in the catch block for both `fetch()` and body-reading calls — the signal fires the same way in both phases.
- **Do not** use `AbortSignal.timeout()` for the deadline controller — it creates its own internal timer that you cannot `clearTimeout()`. Use `new AbortController()` + `setTimeout()` + `clearTimeout()` in a `finally` block so the deadline timer is always cleaned up.

**Warning signs:**
- `SendResult` returned as `{ kind: "transportError", error: { kind: "aborted" } }` when a deadline is configured and the operation clearly ran past `deadlineMs`.
- Callers who cancel via their own signal cannot distinguish their abort from a library-internal timeout.

**Phase to address:** Transport & Core Send (initial `send()` implementation)

---

### Pitfall 2: Response body `null` vs empty stream — silent `Decode.none()` failures

**What goes wrong:**
`204 No Content`, `304 Not Modified`, and `205 Reset Content` all return `response.body === null` in the Fetch API. A `200 OK` with `Content-Length: 0` returns a non-null `ReadableStream` that immediately signals `done: true` on the first read. These two cases look different at the stream level but mean the same thing: zero bytes of body.

`Decode.none()` — which must fail if any bytes are present — needs to handle both. If it only checks `response.body === null`, it incorrectly passes a `200` with `Content-Length: 0` when it shouldn't, or vice versa.

`Decode.discard()` and `Decode.optional(inner)` have the same exposure: they must handle `null` body gracefully without attempting to read from it.

**Why it happens:**
Developers check the null case in tests against `204` but forget to test `200` with an empty body. The spec says "zero bytes after transfer/content decoding" — both cases must produce the same behavior.

**How to avoid:**
- Normalize early: before any decoder runs, resolve `body === null` and an immediately-done stream to the same `Uint8Array` of length 0.
- All decoders receive a `Uint8Array`, never a raw `ReadableStream`. The stream-to-bytes step is a single shared function.
- Test `Decode.none()`, `Decode.optional(inner)`, and `Decode.bytes()` against both `body === null` and `body` that reads 0 bytes.

**Warning signs:**
- `Decode.none()` passes silently for `200` responses with empty bodies when it should produce `decodeError.unexpectedBody`.
- `Decode.optional(inner)` returns `undefined` for `200` with non-empty body because `body.locked` was checked instead of byte count.

**Phase to address:** Body Decoders

---

### Pitfall 3: Partial body read leaks the connection when reader is not cancelled

**What goes wrong:**
Body preview (`BodyPreview`) reads the first N bytes via `ReadableStream.getReader()`. If after collecting N bytes the reader is not explicitly cancelled (`reader.cancel()`), the underlying TCP connection stays open, locked to this stream, until GC eventually collects it. Under load — or in tests that fire many requests — uncancelled partial readers silently exhaust the connection pool.

Confirmed by live test: abandoning a reader without calling `reader.cancel()` leaves the stream and socket open until GC. The `bodyUsed` property does not become `true` until `cancel()` or full consumption.

**Why it happens:**
`getReader()` is familiar from tutorials that always read to completion. Preview logic that breaks early never reaches the natural EOF, so it has no natural place to release unless explicitly coded.

**How to avoid:**
```ts
const reader = response.body.getReader();
const chunks: Uint8Array[] = [];
let totalBytes = 0;
let truncated = false;
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - totalBytes;
    if (value.length >= remaining) {
      chunks.push(value.slice(0, remaining));
      totalBytes += remaining;
      truncated = true;
      break;
    }
    chunks.push(value);
    totalBytes += value.length;
  }
} finally {
  reader.cancel(); // ALWAYS — even if the read threw
}
```
The `finally` block is non-negotiable. Also works identically in browsers.

**Warning signs:**
- Connection pool exhaustion under test load.
- `response.bodyUsed` is `false` after a preview operation (means cancel was not called).

**Phase to address:** Body Preview / `BodyPreview` implementation; also affects `Decode.discard()`.

---

### Pitfall 4: `Decode.discard()` — cancel vs drain trade-off

**What goes wrong:**
`Decode.discard()` must consume the body safely. Two strategies exist:
- **Cancel** (`response.body.cancel()`): immediately signals the stream is no longer needed. Fast, but may close the underlying TCP connection even when `Connection: keep-alive` is in play, preventing connection reuse for the next request.
- **Drain** (read all bytes and discard): allows keep-alive connection reuse but wastes CPU/memory for large bodies.

Choosing drain unconditionally blows memory for large payloads (e.g., a misconfigured `Decode.discard()` on a 50 MB response). Choosing cancel unconditionally may kill keep-alive efficiency.

**Why it happens:**
Both options look equivalent for unit tests (both set `bodyUsed = true`). The performance difference only appears at scale or with large responses.

**How to avoid:**
- Use `response.body.cancel()` as the default — it is correct and safe for a library where the caller has already told you the body is to be discarded.
- The spec explicitly says "disposal strategy is implementation-defined: cancel or drain". **Cancel** is the correct choice for `Decode.discard()`.
- Handle `body === null` (204/304/205) as a no-op before attempting cancel.

**Warning signs:**
- Keep-alive connections not being reused (observable via `server.on('connection')` counters in tests).
- Memory spikes when `Decode.discard()` is used on large-body error responses.

**Phase to address:** Body Decoders

---

### Pitfall 5: Retry off-by-one — `maxAttempts` vs `maxRetries` confusion

**What goes wrong:**
The most common retry bug: a loop using `retry <= maxAttempts` (inclusive) sends `maxAttempts + 1` requests instead of `maxAttempts`. If the spec says "retry up to N times", developers often write `maxAttempts = N` meaning total sends, but the loop iterates N+1 times.

Confirmed by live test:
```ts
// Bug: sends 4 times with maxAttempts=3
for (let retry = 0; retry <= maxAttempts; retry++) { ... }

// Correct: sends 3 times
for (let attempt = 0; attempt < maxAttempts; attempt++) { ... }
```

**Why it happens:**
Conflating "number of retries" (re-sends after first failure) with "total attempts" (includes the first send). The variable name `maxRetries` suggests re-sends; `maxAttempts` suggests total. Using either name inconsistently in logic produces off-by-one.

**How to avoid:**
- Use `maxAttempts` consistently to mean total sends (first attempt + retries).
- Loop: `for (let attempt = 0; attempt < maxAttempts; attempt++)`.
- Retry check: `if (attempt < maxAttempts - 1 && shouldRetry(...))`.
- Write a test that counts actual HTTP requests received by the mock server for each configured `maxAttempts` value.

**Warning signs:**
- Mock server receives one more request than the configured maximum.
- Test counting `server.requests.length` fails by exactly 1.

**Phase to address:** Retry & Deadline

---

### Pitfall 6: Abort during backoff sleep — retry loop ignores cancellation

**What goes wrong:**
After a failed attempt, the retry loop sleeps for a backoff duration using `setTimeout`. If the caller aborts or the deadline fires during that sleep, a naïve `await new Promise(r => setTimeout(r, delay))` does not notice the abort until the timer completes. The operation wastes the entire backoff window before detecting the signal.

Confirmed by live test: with a 500 ms backoff and abort at 200 ms, the loop notices the abort 300 ms late.

**Why it happens:**
`setTimeout` has no built-in `AbortSignal` support. Developers forget to wire the signal into the sleep utility, because they only test abort during the `fetch()` call itself.

**How to avoid:**
```ts
function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}
```
Use `sleepWithAbort` in all retry backoff delays. The combined `AbortSignal.any([callerSignal, deadlineSignal])` signal should be passed here — same signal used for `fetch()`.

**Warning signs:**
- Test: abort after first failure but before first backoff completes; operation should resolve in `< backoffMs` but takes the full backoff duration.
- Deadline expiry during backoff does not produce `{ kind: "timeout" }` promptly.

**Phase to address:** Retry & Deadline

---

### Pitfall 7: Jitter backoff without a cap — unbounded sleep and potential overflow

**What goes wrong:**
Exponential backoff without a cap (`Math.random() * base * 2^attempt`) grows without bound. At attempt 10 with `base = 100 ms`, the max sleep is 102 seconds. At attempt 60, `2^60 = 1.15e18` — JavaScript represents this as a valid (huge) number, not `Infinity`, so no automatic protection. `setTimeout(callback, 1.15e18)` effectively never fires.

**Why it happens:**
The AWS jitter article shows the formula without always showing cap handling. Developers copy the formula without the `Math.min(cap, ...)` guard.

**How to avoid:**
```ts
function jitterDelay(attempt: number, base = 200, cap = 30_000): number {
  // Guard: min(cap, base * 2^attempt) before applying random
  // Prevents both overflow and unbounded sleep
  const maxDelay = Math.min(cap, base * Math.pow(2, attempt));
  return Math.floor(Math.random() * maxDelay);
}
```
- `cap` defaults to 30 seconds (reasonable for HTTP retries).
- Always apply `Math.min(cap, ...)` **before** multiplying by `Math.random()`.
- Use `attempt` starting at 0 (first retry): `jitterDelay(0)` = up to `base * 1`, `jitterDelay(1)` = up to `base * 2`, etc.

**Warning signs:**
- Backoff delay exceeds configured `deadlineMs` even on early attempts.
- Tests with large `maxAttempts` hang unexpectedly.

**Phase to address:** Retry & Deadline

---

### Pitfall 8: `noUncheckedIndexedAccess` — `Uint8Array[i]` is `number | undefined`, length checks don't help

**What goes wrong:**
With `noUncheckedIndexedAccess: true`, array indexing returns `T | undefined`. For `Uint8Array`, `arr[0]` has type `number | undefined` even inside `if (arr.length > 0)`. TypeScript's FAQ explicitly documents that length checks **do not narrow** indexed access because array mutation can occur between the check and the access.

This bites in byte-reading loops where you write `const byte = arr[i]; if (byte === 0xFF)` — TypeScript errors because `byte` is `number | undefined`.

**Why it happens:**
Developers expect narrowing to work via length checks (as it would for optional properties or union types), but `noUncheckedIndexedAccess` doesn't grant that. The compiler sees mutation risk.

**How to avoid:**
Preferred patterns:
```ts
// 1. Use .at() with a fallback — clean, no assertion
const byte = arr.at(i) ?? 0;

// 2. Non-null assertion for hot loops where you've already checked length
const byte = arr[i]!;  // acceptable with explicit prior length guard

// 3. Structural: keep byte values as chunks (never index raw bytes unless necessary)
```
Avoid converting `Uint8Array` to `Array<number>` just to escape the type error — it defeats the purpose of `Uint8Array`.

**Warning signs:**
- TypeScript errors: `Type 'number | undefined' is not assignable to type 'number'` in byte-manipulation code.
- Developers adding `as number` casts liberally throughout buffer-reading code (masks the real safety issue).

**Phase to address:** Body Decoders (`Decode.bytes()`, `Decode.none()` byte-presence check, body preview chunk assembly)

---

### Pitfall 9: `exactOptionalPropertyTypes` — header/query spread with `undefined` does not delete keys

**What goes wrong:**
The spec says `undefined` in `headers` or `query` means "not specified at this layer" — not deletion. But if you merge layers with object spread:
```ts
const merged = { ...clientHeaders, ...requestHeaders };
```
Any `undefined` value in `requestHeaders` **overrides** the client value with `undefined`. The key is not deleted — it becomes `{ "accept": undefined }`. When passed to `fetch()`, this may stringify as `"accept: undefined"` or be silently dropped depending on the runtime, either way producing incorrect behavior.

Confirmed by live test: `{ ...{ accept: "json" }, ...{ accept: undefined } }` produces `{ accept: undefined }` — the key survives with an `undefined` value.

**Why it happens:**
Spread-based merging looks correct and is familiar. The `undefined`-means-inherit semantic requires explicit filtering, which is easy to forget.

**How to avoid:**
```ts
// Correct merge: skip undefined values from the overriding layer
function mergeHeaders(
  base: Record<string, string | undefined>,
  override: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) result[k.toLowerCase()] = v;
  }
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined) result[k.toLowerCase()] = v;
    // undefined in override = "don't change inherited value"
  }
  return result;
}
```
Case-insensitive header key normalization (`.toLowerCase()`) must happen here too per the spec's merge rules.

**Warning signs:**
- `Authorization` header disappears when a request sets `headers: { authorization: undefined }`.
- `fetch()` receives `undefined` as a header value.
- Case-sensitive header conflicts: `Content-Type` and `content-type` both appear in outgoing request.

**Phase to address:** Request Model / Merge Rules

---

### Pitfall 10: Zod `instanceof ZodError` fails across module boundaries

**What goes wrong:**
The library normalizes Zod errors to `DecodeIssue[]`. To detect that a `safeParse` failure is a `ZodError`, naive code writes `if (err instanceof ZodError)`. This check fails when the consumer's installed Zod version is different from the version the library imported — each `ZodError` class is a distinct object even if both are named `ZodError`.

This is the "dual package hazard" for class instances: `instanceof` checks require the same class object, not just the same shape.

**Why it happens:**
`instanceof` is the natural TypeScript/JavaScript pattern for discriminating known error types.

**How to avoid:**
Use duck typing to detect ZodError:
```ts
function isZodError(e: unknown): e is { issues: Array<{ path: (string | number)[]; message: string; code?: string }> } {
  return (
    e != null &&
    typeof e === "object" &&
    "issues" in e &&
    Array.isArray((e as { issues: unknown }).issues)
  );
}
```
Both Zod v3 and v4 `ZodError` instances have an `.issues` array with `{ path, message, code }` per issue. The schema adapter interface should accept any object with `.safeParse()`, and error normalization should use duck typing only.

The peer dependency range should be `"zod": "^3.25.0 || ^4.0.0"` — the `zod/v3` subpath was added in 3.25.0 and both v3 and v4 are supported.

**Warning signs:**
- `Decode.json(schema)` returns `{ kind: "decodeError", error: { kind: "custom" } }` instead of `{ kind: "schemaMismatch" }` when validation fails.
- Unit tests pass but consumer with a different Zod version sees incorrect error classification.

**Phase to address:** Schema Adapter (Zod) implementation

---

### Pitfall 11: ESM-only — consumers on CJS toolchains get `MODULE_NOT_FOUND`, not a helpful error

**What goes wrong:**
`require('@sethlivingston/oneway-http')` in a CJS context fails with `MODULE_NOT_FOUND` (not `ERR_REQUIRE_ESM` as might be expected). The error message does not mention ESM. Consumers on older toolchains or Jest configurations (which historically default to CJS) see an opaque error with no guidance.

Confirmed: `require()` from a CJS context produces `MODULE_NOT_FOUND` for an ESM-only package.

**Why it happens:**
Node.js doesn't always produce `ERR_REQUIRE_ESM` when the package uses conditional exports without a CJS fallback — it falls through to "file not found" depending on resolution mode.

**How to avoid:**
- `engines` field is already set to `>=24.0.0` — good guard.
- README must prominently state "ESM-only" and show correct import syntax.
- Do **not** add a CJS dual build — the dual package hazard creates worse problems than the inconvenience of ESM-only.
- Consider a stub `require` error shim if consumer demand warrants it (not needed for v1).

**Warning signs:**
- Consumer issues reporting `MODULE_NOT_FOUND` with no ESM mention.
- Jest test setups failing without clear error.

**Phase to address:** Documentation / README

---

### Pitfall 12: `.js` extension requirement breaks internal imports silently in NodeNext mode

**What goes wrong:**
With `module: "NodeNext"` and `verbatimModuleSyntax: true`, TypeScript requires `.js` extensions on all relative imports in source files. Omitting the extension compiles without error but produces runtime `ERR_MODULE_NOT_FOUND` because the output `.js` file contains `import './utils'` with no extension, which Node.js ESM refuses to resolve.

**Why it happens:**
TypeScript does not add extensions during compilation — it passes imports through verbatim. `import './utils'` in source becomes `import './utils'` in output, which fails at runtime. The TypeScript compiler won't catch this omission by default without `moduleResolution: NodeNext` enforcing it, and even then only when `allowImportingTsExtensions` is not set.

**How to avoid:**
- All relative imports in `src/` must use `.js` extension even though the source file is `.ts`:
  ```ts
  import { buildUrl } from "./url.js"; // ← correct even though file is url.ts
  ```
- Enable the `import-x/extensions` ESLint rule to enforce `.js` extensions on all relative imports.
- The existing `eslint.config.mjs` with `eslint-plugin-import-x` can enforce this — verify the rule is configured.

**Warning signs:**
- `ERR_MODULE_NOT_FOUND` at runtime for a file that definitely exists.
- Tests pass with Vitest (which uses Vite's resolver that handles extensionless imports) but production dist fails.

**Phase to address:** Infrastructure setup (before any `src/internal/` modules are created)

---

### Pitfall 13: Vitest dist dependency — tests fail silently if build is stale

**What goes wrong:**
Tests import via `@sethlivingston/oneway-http` which resolves through `package.json` conditional exports to `dist/`. If `dist/` is stale or missing, Vitest resolves the import to the old built output — not a build error, just silently-wrong behavior. The `pretest` script builds first, but `npx vitest run` directly skips `pretest`.

This is documented in `CONCERNS.md` and is an active tech debt item.

**Why it happens:**
ESM self-referencing in tests requires the package to be built. Without a Vite alias redirecting `@sethlivingston/oneway-http` to source files, the test layer is coupled to the build output.

**How to avoid:**
Add `resolve.alias` in `vitest.config.ts` to map the package name to source entrypoints per project:
```ts
resolve: {
  alias: {
    "@sethlivingston/oneway-http": new URL("./src/index.ts", import.meta.url).pathname,
    "@sethlivingston/oneway-http/browser": new URL("./src/browser.ts", import.meta.url).pathname,
    "@sethlivingston/oneway-http/node": new URL("./src/node.ts", import.meta.url).pathname,
  }
}
```
This removes the dist dependency from the test layer entirely. The `pretest` build is still needed for the final `npm test` run but not for development iteration.

**Warning signs:**
- `vitest run` passes but tests are exercising stale built code.
- Type changes in source not reflected in test failures.

**Phase to address:** Infrastructure Fixes (early — before behavioral tests are written)

---

### Pitfall 14: Body preview TextDecoder — truncation at byte boundary corrupts UTF-8

**What goes wrong:**
The body preview reads at most N bytes and calls `new TextDecoder().decode(bytes)`. If the truncation point falls mid-sequence (e.g., inside a 4-byte emoji or a 2-byte accented character), the truncated bytes decode to the Unicode replacement character `\uFFFD` (�). This is correct *behavior* per the spec ("best-effort strategy") but can confuse developers who see garbage at the preview boundary.

Using `TextDecoder` with `fatal: true` would throw instead of substituting — crashing the preview for any non-ASCII body truncated at an unfortunate byte. **Do not use `fatal: true`.**

Confirmed by live test: truncating `"Hello 🌍"` mid-emoji at byte 9 produces `"Hello \uFFFD"`.

**Why it happens:**
Using `fatal: true` seems safer but produces exceptions for a component whose entire purpose is best-effort diagnostics.

**How to avoid:**
```ts
// Correct: non-fatal, best-effort
const text = new TextDecoder("utf-8", { fatal: false }).decode(previewBytes);
```
This is the only correct option. Document in code comments that `truncated: true` plus replacement characters at end of `text` is expected and by spec.

**Warning signs:**
- Preview throws during decode for binary or multi-byte content.
- `bodyPreviewBytes` default of 8192 sometimes produces garbled endings — expected and acceptable per spec.

**Phase to address:** Body Preview implementation

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `instanceof ZodError` instead of duck-typing | Simple, readable | Breaks silently when consumer has different Zod version | Never |
| Object spread for header/query merge | Concise | Spreads `undefined` as a value, corrupts inherited headers | Never |
| Naïve `setTimeout` in retry backoff | Obvious | Doesn't respect abort signal — wastes full backoff window | Never |
| Skip `reader.cancel()` after partial read | Simpler preview code | Connection leak under load | Never |
| Skipping `.js` on relative imports | Less typing | Runtime `ERR_MODULE_NOT_FOUND` in production | Never |
| `response.body?.cancel()` without null check | Short | Throws if body is null (204/304) | Never |
| Using `<=` in retry loop | Natural loop idiom | Off-by-one: sends one extra request | Never |
| `new TextDecoder('utf-8', { fatal: true })` in preview | Seems safer | Crashes preview on any truncated multi-byte body | Never |
| `AbortError` for deadline controller | Familiar API | Cannot distinguish timeout from caller abort | Never |
| Treating `deadlineMs` as per-attempt timeout | Simpler sleep math | Violates spec: deadline must cover all attempts + backoff + body read | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `AbortSignal.any()` | Combining signals without thinking about `reason.name` | Mark deadline abort with `DOMException("...", "TimeoutError")`; use caller's raw signal for abort detection |
| `fetch()` + signals | Assuming fetch throws a wrapper — not the raw reason | Catch block receives `signal.reason` directly; check `.name` on the caught error |
| Zod schema adapter | Importing from `"zod"` in library code | Never import Zod in library runtime code; receive schema as opaque value; duck-type errors |
| `Headers` object | Using plain object indexing for header access | `headers.get(name)` returns `string \| null`; plain object indexing needs `noUncheckedIndexedAccess` handling |
| `ReadableStream` | Calling `getReader()` twice | Stream is locked after first `getReader()`; must `releaseLock()` before acquiring a new reader |
| 204/304/205 responses | Calling `.body.cancel()` unconditionally | Check `response.body !== null` before any stream operation |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Draining body in `Decode.discard()` instead of cancelling | CPU + memory waste on large error bodies | Use `response.body.cancel()` | Any response with >1 KB body discarded |
| No jitter cap on exponential backoff | Occasional multi-second sleeps on attempt 5+ | `Math.min(cap, base * 2^attempt)` | Attempt 4+ with base 200ms and no cap |
| No connection reuse (cancel vs drain) | More TCP handshakes than expected | Prefer cancel for discard; accept keep-alive trade-off | High-throughput clients making many requests |
| Repeated `new TextDecoder()` per preview | Minor allocation churn | Single decoder instance per `send()` call | High request volume |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full body preview for auth responses | Secrets (tokens, passwords) in log output | Never log `preview.text` without consumer opt-in; preview is for debugging, not logging |
| Propagating full `Headers` object in `unhandledStatus` / `decodeError` | `Authorization`, `Set-Cookie` etc. exposed in result union | This is by design (spec requires it) but document that results should not be logged verbatim |
| No timeout on first attempt | Requests hang indefinitely without `deadlineMs` | Strongly recommend a default `deadlineMs` in client defaults; document risk of omission |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `decodeError` with no preview when body is large | Developer cannot debug — no hint what the server sent | Preview always included in `decodeError` and `unhandledStatus` per spec; enforce max N bytes, never skip |
| `unhandledStatus` for every redirect if 3xx not in `responses` | Developer sees surprising `unhandledStatus` for 301 | Document that `fetch()` follows redirects by default; 3xx `unhandledStatus` means a redirect was not followed (unusual) |
| `Send.match()` TypeScript exhaustiveness failing silently | Developer misses a variant, runtime undefined | Exhaustiveness must be a compile-time error, not runtime; verify `satisfies Send.Matcher<...>` enforces all variants |
| Re-using a consumed `Request` | Second `send()` call throws instead of sending | Error message must name the consumed request clearly; recommend factory function pattern in docs |

---

## "Looks Done But Isn't" Checklist

- [ ] **`AbortSignal.any()` error classification:** Verify that deadline expiry produces `{ kind: "timeout" }` — not `{ kind: "aborted" }`. Test by setting a short `deadlineMs` and no caller signal.
- [ ] **Body reading after abort:** Verify that an abort fired during `response.text()` / body preview is classified correctly (same classification as abort during fetch).
- [ ] **Retry count:** Run a mock server that counts requests. With `maxAttempts: 3`, exactly 3 HTTP requests must arrive.
- [ ] **Abort during backoff:** Abort at 50 ms into a 500 ms backoff; the operation must resolve in <100 ms (not after the full 500 ms).
- [ ] **`Decode.discard()` with null body:** 204 response must not throw; `bodyUsed` semantics correct.
- [ ] **Header merge with `undefined`:** Request-layer `{ "accept": undefined }` must not wipe the client-layer `"accept"` header.
- [ ] **`noUncheckedIndexedAccess` in chunk assembly:** No `as number` casts hiding type errors; use `.at()` or `!` with explicit guard.
- [ ] **Zod version mismatch:** Test the schema adapter with a Zod object — verify it works with both v3 and v4 error shapes via duck-typing.
- [ ] **`reader.cancel()` in preview:** After any body preview, verify `response.bodyUsed === true` and no socket is left open.
- [ ] **TextDecoder mode:** Confirm preview uses `{ fatal: false }` (no throw on truncated multi-byte sequences).
- [ ] **Jitter cap:** Log backoff delay values across 10 attempts; none should exceed `cap` (default 30 seconds).
- [ ] **`.js` extension on imports:** `dist/` output must have no extensionless relative imports; check with `grep -r "from '\\./" dist/`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong abort reason classification | LOW | Change `deadlineController.abort(...)` argument; update classification switch; no API change |
| Missing `reader.cancel()` in preview | LOW | Add `finally { reader.cancel() }` to preview function; no API change |
| Off-by-one in retry loop | LOW | Change `<=` to `<` in loop condition; update tests |
| Spread-based header merge | MEDIUM | Rewrite merge function; may expose previously-hidden header override bugs in consumer code |
| `instanceof ZodError` in adapter | LOW | Replace with duck-type check; no API change |
| Drain instead of cancel in discard | LOW | Swap `arrayBuffer()` for `body.cancel()`; no API change |
| Missing `.js` extensions | MEDIUM | grep-and-replace all relative imports; no logic change but high file count |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| AbortSignal reason.name discrimination | Transport & Core Send | Test: deadline expiry → `{ kind: "timeout" }` |
| Body null vs empty stream | Body Decoders | Test: `Decode.none()` against 204 and 200+Content-Length:0 |
| Partial read connection leak | Body Preview | Test: `response.bodyUsed` after preview; socket count unchanged |
| Discard cancel vs drain | Body Decoders | Code review: `Decode.discard()` uses `.cancel()` |
| Retry off-by-one | Retry & Deadline | Test: mock server request count = maxAttempts exactly |
| Abort during backoff | Retry & Deadline | Test: abort at 50ms of 500ms backoff resolves < 100ms |
| Jitter cap / overflow | Retry & Deadline | Test: log all delays, none exceed cap |
| `noUncheckedIndexedAccess` Uint8Array | Body Decoders | `tsc --noEmit` passes; no `as number` casts |
| `exactOptionalPropertyTypes` header merge | Request Model | Test: `undefined` header in request does not wipe client header |
| Zod duck-typing | Schema Adapter | Test: consumer with Zod v3 receives correct `schemaMismatch` |
| ESM CJS error message | Documentation | README states ESM-only; engines field set |
| `.js` extension on imports | Infrastructure Fixes | `dist/` grep for extensionless imports |
| Vitest dist dependency | Infrastructure Fixes | `npx vitest run` without prior build uses source aliases |
| TextDecoder fatal mode | Body Preview | Test: preview on binary response does not throw |

---

## Sources

- **MDN Web Docs:** `AbortSignal.any()` — https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static
- **MDN Web Docs:** `Response.body` — https://developer.mozilla.org/en-US/docs/Web/API/Response/body
- **Zod official — Library Authors guide:** https://zod.dev/library-authors — dual v3/v4 support, peer dependency range `^3.25.0 || ^4.0.0`, versioned subpaths, duck-typing
- **TypeScript wiki FAQ:** `noUncheckedIndexedAccess` does not narrow on length checks — https://github.com/microsoft/TypeScript/wiki/FAQ
- **TypeScript compiler tests:** `exactOptionalPropertyTypes` with object spread — https://github.com/microsoft/typescript/blob/main/tests/baselines/reference/strictOptionalProperties1.errors.txt
- **Node.js ESM docs:** https://nodejs.org/api/esm.html
- **Live Node.js 24 execution:** All abort signal, body stream, retry loop, jitter, TextDecoder, and header merge behaviors confirmed with running code in this project's environment.
- **SPEC.md / PROJECT.md / CONCERNS.md:** Project requirements, known bugs, and tech debt in this repository.

---
*Pitfalls research for: TypeScript ESM HTTP client library*
*Researched: 2026-05-04*
