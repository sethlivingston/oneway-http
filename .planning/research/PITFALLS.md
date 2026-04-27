# Domain Pitfalls

**Domain:** Cross-runtime TypeScript HTTP client library (`oneway-http`)
**Researched:** 2026-04-27
**Scope:** Design, implementation, testing, and release pitfalls specific to this repo and spec

---

## Critical Pitfalls

Mistakes that cause rewrites, broken consumers, or spec-violating semantics.

---

### Pitfall 1: Deadline Implemented as Per-Attempt Timeout

**What goes wrong:** `deadlineMs` is implemented as an `AbortSignal.timeout()` passed to each individual `fetch()` call rather than as a whole-send deadline that spans all attempts, backoff delays, body reading, and decoding.

**Why it happens:** `AbortSignal.timeout(ms)` is the obvious one-liner for timeouts in fetch. The spec is explicit that `deadlineMs` is a *whole-operation* deadline — but that distinction is easy to miss during initial implementation.

**Consequences:** A request with three retry attempts and 5 s deadlineMs would silently allow up to 15 s of total wall time. The `{ kind: "timeout" }` transport error fires correctly on each attempt but never correctly on the aggregate operation. Retry logic becomes subtly broken for all slow paths.

**Prevention:**
- Compute an absolute deadline timestamp before the first attempt: `const deadlineAt = Date.now() + deadlineMs`.
- Create a single `AbortController` for the whole operation; abort it when `deadlineAt` is crossed.
- Compose this deadline signal with the caller's optional `signal` using `AbortSignal.any([deadlineController.signal, callerSignal])` (available in Node 20+ and modern browsers).
- Pass the composed signal to every individual `fetch()` call.
- Check remaining budget before scheduling each backoff delay; if budget is exhausted, return `{ kind: "transportError", error: { kind: "timeout" } }` without attempting the next retry.

**Detection:** Write a test that retries twice with a deadline shorter than two full attempt cycles and assert the total elapsed time is ≤ deadlineMs + small tolerance.

**Phase:** Core `send()` implementation — first milestone touching retries and deadlines.

---

### Pitfall 2: Retrying Non-Idempotent Methods or Non-Retryable Conditions

**What goes wrong:** The retry loop retries on any transport error regardless of HTTP method, or retries on `decodeError`, `unhandledStatus`, or caller abort — all of which the spec explicitly excludes from retry.

**Why it happens:** The natural retry loop structure is `while (attempts < max) { try { ... } catch { retry } }`. Excluding specific conditions requires deliberate guard checks that are easy to omit.

**Consequences:**
- A `POST` that succeeds server-side but fails in body reading gets retried, causing double mutations.
- A `decodeError` that is a permanent schema mismatch gets retried indefinitely.
- A caller-aborted request gets retried after the caller has already moved on, leaking in-flight requests.

**Prevention:**
- Represent the retry decision as an explicit boolean function: `isRetryable(method, resultKind, error)`.
- Default-allow only `GET` and `HEAD`; require explicit opt-in for others via `RetryPolicy.methods`.
- Hard-exclude `"aborted"`, `"decodeError"`, and `"unhandledStatus"` regardless of policy.
- Hard-exclude `"timeout"` (deadline expiry is terminal per spec).
- Unit-test `isRetryable` in isolation with every combination before wiring it into `send()`.

**Detection:** A `POST` that receives a `502` should return `{ kind: "response", ... }` matching the 502 handler rather than being retried — unless the caller has explicitly opted that method in via policy.

**Phase:** Retry policy implementation; flag for the phase that wires `RetryPolicy` into `send()`.

---

### Pitfall 3: Premature Body Consumption Blocking Preview or Decode

**What goes wrong:** The response body stream is consumed (e.g., `.text()`, `.json()`, `.arrayBuffer()`) before the matching decoder is selected, or the body is partially read for a preview and then the remainder is unavailable for the actual decode.

**Why it happens:** `Response.body` in the Fetch API is a `ReadableStream` that can only be consumed once. Calling any body-reading method locks the stream. Accidental double-read (e.g., read for preview, then read for decode) throws a `TypeError: body already used` at runtime.

**Consequences:** Decode path crashes with an opaque error. This is especially acute for `decodeError` and `unhandledStatus`, both of which need a partial body preview *instead of* a full decode — but a naive implementation might attempt full reads for both.

**Prevention:**
- For `decodeError` and `unhandledStatus`: use `Response.body` (the raw `ReadableStream`) directly, read only `bodyPreviewBytes` worth of chunks, then cancel or drain the remainder. Never call the high-level `.text()` / `.json()` methods on these paths.
- For successful decode paths: call the high-level method exactly once and pass the result to the decoder. Never store a reference to `response.body` after reading.
- Treat `BodyPreview` construction and decoder invocation as mutually exclusive branches, not sequential steps.

**Detection:** Test that `Decode.none()` with a non-empty response body returns `decodeError.unexpectedBody` rather than crashing. Test that `unhandledStatus` with a 100 KB body returns a truncated preview without hanging.

**Phase:** Body-reading utilities and `Decode.*` implementation.

---

### Pitfall 4: Header Merge Is Case-Sensitive When It Must Be Case-Insensitive

**What goes wrong:** Client-level and request-level `headers` objects are merged by exact key comparison: `{ "Content-Type": "..." }` and `{ "content-type": "..." }` produce both keys in the merged output rather than one winning value.

**Why it happens:** Plain object spread (`{ ...clientHeaders, ...requestHeaders }`) is trivially case-sensitive. HTTP header names are canonically case-insensitive (RFC 7230 §3.2).

**Consequences:** The server receives duplicate or conflicting headers (e.g., two `Content-Type` values). `Body.json()` sets `content-type: application/json`; a consumer who also specifies `Content-Type: application/json` ends up sending both. Some HTTP servers reject or misparse duplicate headers.

**Prevention:**
- Normalize all header keys to lowercase before storing or merging.
- The merge function should iterate client headers (lowercased) then request headers (lowercased), with the latter winning on conflicts.
- `Body.*` auto-set headers should also lowercase their key before checking whether a user-supplied value already exists.

**Detection:** Test that merging `{ "Authorization": "A" }` (client) with `{ "authorization": "B" }` (request) produces exactly one `authorization: B` header, not two.

**Phase:** Merge-rule implementation; also relevant to `Body.*` content-type injection.

---

### Pitfall 5: `Decode.none()` vs `Decode.discard()` Confusion in Implementation

**What goes wrong:** Both decoders are implemented identically — they each discard the body — and the `unexpectedBody` contract of `Decode.none()` is never enforced. Or conversely, `Decode.discard()` is implemented to assert an empty body, breaking callers who use it for intentional body discard.

**Why it happens:** The difference is subtle: `Decode.none()` expresses a *contract* (the server MUST NOT send a body), while `Decode.discard()` expresses *indifference* (the body MAY exist and should be safely disposed). Both look like "no decode" at first glance.

**Consequences:**
- With the wrong implementation, a `204 No Content` response that accidentally includes a body passes silently when using `Decode.none()`, hiding server-side misbehavior.
- Or `Decode.discard()` becomes unusable for endpoints that legitimately return a body with a status the caller doesn't need to inspect.

**Prevention:**
- Give each decoder a discriminant type tag (`kind: "none"` vs `kind: "discard"`) and branch on it explicitly in the body-reading path.
- `Decode.none()`: if `bytesRead > 0`, return `{ kind: "decodeError", error: { kind: "unexpectedBody" } }`.
- `Decode.discard()`: cancel or drain stream unconditionally, return `undefined` typed as `void`.

**Detection:** Unit-test both decoders against a response that has 1 byte of body content.

**Phase:** `Decode.*` implementation.

---

### Pitfall 6: `Decode.optional()` Defined on Bytes, Not Semantic Null

**What goes wrong:** `Decode.optional(inner)` is implemented to return `undefined` when the JSON value is `null`, when the body contains only whitespace, or when the decoded value is a falsy TypeScript value — rather than strictly on zero raw bytes after transfer/content decoding.

**Why it happens:** "Optional" in most TypeScript code means "possibly null/undefined at the value level." The spec definition is deliberately lower-level: it gates on raw byte count, not semantic meaning.

**Consequences:** A JSON endpoint returning `null` unexpectedly returns `undefined` from the caller's perspective, masking a real server-side null value. Whitespace-only bodies (some frameworks do this) unexpectedly return `undefined`.

**Prevention:**
- Implement as: read raw byte count first; if `bytesRead === 0`, return `undefined`; otherwise delegate to `inner` decoder verbatim.
- Never inspect the decoded value or the string representation inside `Decode.optional`.
- Document the byte-level definition explicitly in code comments.

**Detection:** Test `Decode.optional(Decode.json())` against a response body of `"null"` (4 bytes) — it should return the decoded JSON `null` value, not `undefined`.

**Phase:** `Decode.*` implementation.

---

### Pitfall 7: Response Matching Precedence Implemented in Wrong Order

**What goes wrong:** The four-layer matching precedence (request exact → request class → client exact → client class → unhandledStatus) is implemented as client-first or as a flat merged map, causing client-level overrides to win over request-level intent.

**Why it happens:** Merging response maps with `{ ...clientResponses, ...requestResponses }` would be correct for a two-layer system where request wins on all conflicts — but the spec has four distinct layers, and a class matcher from the request layer should beat an exact matcher from the client layer only within the same layer, not across layers.

**Consequences:** A request-level `"4xx"` class matcher is shadowed by a client-level exact `401` matcher, even though the spec says request-layer matchers take full precedence over client-layer matchers.

**Prevention:**
- Implement matching as an explicit ordered search: iterate the four layers in sequence and return the first hit.
- Do **not** pre-merge response maps into a single flat object.
- Model it as `findMatch(status, requestResponses, clientResponses)` where each ResponseMap is searched in exact-then-class order before moving to the next layer.

**Detection:** Test: client has `401: Decode.json(ErrorSchema)`, request has `"4xx": Decode.discard()`. A 401 response should match the request-level `"4xx"` matcher, not the client-level exact `401` matcher.

**Phase:** Response matching implementation.

---

### Pitfall 8: AbortSignal Composition Breaks on Older Runtimes

**What goes wrong:** `AbortSignal.any()` is used to compose the caller's abort signal with the internal deadline signal, but `AbortSignal.any()` was only added in Node 20.3 / Chrome 116 / Safari 17.4. The package targets both Node and browsers and may be used in environments where `AbortSignal.any()` is not available.

**Why it happens:** It is the most ergonomic API for signal composition and is easy to reach for without checking compatibility.

**Consequences:** A `TypeError: AbortSignal.any is not a function` crash in a supported runtime, making deadline and abort both broken rather than gracefully degraded.

**Prevention:**
- Verify `AbortSignal.any` availability in both the Node and browser builds against the target environments stated in `package.json`.
- If compatibility matters, write a small `combineSignals(signals)` helper that polyfills the behavior using a single `AbortController` and `"abort"` listeners.
- Keep the polyfill in `src/shared.ts` so it is available to both runtime entrypoints.

**Detection:** Run the abort + deadline test in both Node and all three Playwright browser projects.

**Phase:** AbortSignal / deadline wiring; flag for the phase that introduces `send()` deadline handling.

---

### Pitfall 9: URL Path Segment Encoding Applied Incorrectly

**What goes wrong:** Path segments in `path: ["user", "repos", repoName]` are joined with `/` but segment values are not individually percent-encoded — or they are encoded with `encodeURIComponent` which also encodes characters that are legal in path segments (e.g., `@`).

**Why it happens:** `encodeURIComponent` is the most commonly reached-for encoding function in JavaScript, but it encodes too aggressively for path segments. Encoding the whole joined path at once can corrupt slashes.

**Consequences:** A segment like `seth/repo` (with a literal slash) is not encoded and splits the URL incorrectly. A segment like `user@org` is over-encoded and the server receives `user%40org` when it expects `user@org`.

**Prevention:**
- Encode each segment with `encodeURIComponent`, which is correct for segment values — but then verify that `@`, `:`, `!`, `$`, `&`, `'`, `(`, `)`, `*`, `+`, `,`, `;`, and `=` should be preserved if needed (they are sub-delimiters in RFC 3986 §3.3).
- The spec says "each segment is encoded separately and then joined with `/`" — `encodeURIComponent` is the right choice because it encodes `/` itself (preventing segment injection) while preserving most safe characters.
- Treat this as a pure function and unit-test with edge cases: segments containing `/`, `?`, `#`, `%`, spaces, Unicode.

**Detection:** Test `path: ["user", "seth/repo"]` produces `.../user/seth%2Frepo`, not `.../user/seth/repo`.

**Phase:** URL construction utilities.

---

### Pitfall 10: `Body.json()` Silently Fails on Unserializable Values

**What goes wrong:** `Body.json(value)` calls `JSON.stringify(value)` without catching `TypeError` for circular references or `BigInt` values, crashing `send()` with an unhandled exception instead of returning a structured error.

**Why it happens:** `JSON.stringify` throws synchronously on circular objects and BigInt values. These are rare in practice so the error path is easy to miss in testing.

**Consequences:** The library's core contract — transport failures are returned as structured values, never thrown — is violated on the outbound body preparation path.

**Prevention:**
- Wrap `JSON.stringify` in a try/catch inside `Body.json()`.
- Throw a dedicated `BodySerializationError` that `send()` converts to `{ kind: "transportError", error: { kind: "network", cause: err } }` or a new body-prep error variant (if the spec is extended).
- At minimum, document that `Body.json()` can throw pre-send and test the circular-reference case.

**Detection:** `send(Request.create({ body: Body.json(circularObject), ... }))` must not throw at the call site.

**Phase:** `Body.*` implementation; also review during `send()` wiring.

---

## Moderate Pitfalls

---

### Pitfall 11: Packed Artifact vs Source Divergence Goes Undetected

**What goes wrong:** `tsconfig.json` path aliases resolve `@sethlivingston/oneway-http*` to `src/*.ts` during development and tests. The actual npm artifact resolves from `dist/`. A build-only regression (missing export, wrong entrypoint, broken declaration file) passes all local tests but breaks consumers.

**Why it happens:** The existing test suite imports the package name, which resolves through the tsconfig alias to source — not through the published `dist/` files.

**Prevention:**
- Add a packed-artifact smoke test: `npm pack`, install the tarball in a temp directory with no tsconfig alias, and assert that the three entrypoints (`@sethlivingston/oneway-http`, `/browser`, `/node`) resolve and export the expected surface.
- Run this smoke test in CI on the release workflow before publishing.

**Detection (warning sign):** `npm run test` passes but `npm pack && cd /tmp/smoke && npm install ../oneway-http-x.y.z.tgz && node -e "import('@sethlivingston/oneway-http/node')"` fails.

**Phase:** Release validation milestone or the phase that introduces the first real exported API.

---

### Pitfall 12: Neutral Root Entrypoint Silently Loads Browser Behavior in Node

**What goes wrong:** Toolchains that do not honor conditional exports (older bundlers, some Jest configs, `ts-node` without explicit ESM support) resolve the root import to `dist/index.js`, which is the browser build. Node consumers get browser behavior without any error.

**Why it happens:** This is already documented in CONCERNS.md as a known bug. It becomes a real break once `src/browser.ts` and `src/node.ts` diverge (e.g., different `fetch` configurations, Node-specific streaming, browser-specific `FormData`).

**Prevention:**
- Add a runtime guard to `src/index.ts` (the neutral root) that detects if it was loaded in the wrong context and throws a clear error.
- Alternatively, make the root build neutral (no runtime-specific code) and have it delegate to the correct entrypoint lazily.
- At minimum, add a test that importing the root in Node under a non-condition-aware resolver (e.g., `require`) does not silently proceed with browser behavior.

**Phase:** Entrypoint hardening — should precede any meaningful divergence between browser and node implementations.

---

### Pitfall 13: Retry Backoff Ignores Remaining Deadline Budget

**What goes wrong:** The exponential backoff delay is computed from the retry attempt number without checking whether the remaining time budget would be exceeded. A `setTimeout(delay, backoffMs)` fires after the deadline has already passed, and the next attempt starts only to be immediately aborted.

**Why it happens:** Backoff delay and deadline tracking are implemented independently and never cross-check.

**Consequences:** Wasted CPU and potential confusion about whether the final result is `timeout` or `network`. The deadline signal should fire first, but race conditions in signal handling can produce inconsistent results.

**Prevention:**
- Before sleeping for `backoffMs`, compute `remainingMs = deadlineAt - Date.now()`.
- If `remainingMs <= 0`, return `{ kind: "transportError", error: { kind: "timeout" } }` immediately.
- If `backoffMs > remainingMs`, sleep only `remainingMs` and then return the timeout result.

**Phase:** Retry + deadline integration test phase.

---

### Pitfall 14: `Send.match()` TypeScript Exhaustiveness Not Enforced at Compile Time

**What goes wrong:** `Send.match(result, handlers)` accepts a handler object but the TypeScript types do not actually enforce that all result variants (including all named response variants declared in the response map) have a corresponding handler. The `satisfies Send.Matcher<...>` pattern from the spec example is advisory, not structurally required by the function signature.

**Why it happens:** Building a fully exhaustive matcher type over a generic `ResponseMap` keyed on status codes or class strings is non-trivial TypeScript. It is tempting to accept `Partial<...>` or `Record<string, Handler>` and defer exhaustiveness to the consumer.

**Consequences:** Consumers get a runtime `undefined` return or crash when an unhandled variant is encountered, defeating the library's purpose of making all cases explicit.

**Prevention:**
- Invest time up front in the `Send.Matcher<R>` type so it is structurally complete: all response tag variants derived from the `ResponseMap` type plus the three fixed failure keys must appear in the handler object type.
- The `satisfies` pattern in the spec example is the right consumer-facing API but should be backed by a function signature that enforces it.
- Write type-level tests (using `@ts-expect-error` assertions) that confirm missing handlers are compile errors.

**Phase:** `Send.match()` type design — flag for needing careful TypeScript generic work.

---

### Pitfall 15: Schema Mismatch Errors Leak Zod Internals

**What goes wrong:** `DecodeError.schemaMismatch.issues` is populated directly from Zod's `ZodError.issues` array, which has Zod-specific `code` values, nested `union` errors, and path formats that are tightly coupled to Zod internals.

**Why it happens:** `zod.safeParse(data)` returns `error.issues` directly. Mapping them to the library's `DecodeIssue` shape requires deliberate normalization that is easy to skip.

**Consequences:** The spec says the decode contract should be thin enough to swap Zod for Valibot later. Leaking raw Zod issues into the public `DecodeIssue[]` type makes that migration a breaking change.

**Prevention:**
- Implement a `normalizeZodIssues(zodIssues): DecodeIssue[]` mapper that extracts only `path`, `message`, and a normalized `code` string.
- Keep this mapper inside the Zod adapter module, not in the public decode path.
- The public `DecodeIssue` type should have no Zod imports.

**Phase:** `Decode.json(schema)` + Zod adapter implementation.

---

### Pitfall 16: `BodyPreview` Hangs on a Server That Never Closes the Stream

**What goes wrong:** The preview reader reads up to `N` bytes from the response body stream but does not have its own timeout or byte-count limit enforced via the stream reader API. If the server sends a chunked response and pauses after sending fewer than `N` bytes, the preview read hangs until the deadline fires — at best — or hangs indefinitely if no deadline was set.

**Why it happens:** The preview is intended as a diagnostic aid. Its read path may lack the same signal-based cancellation applied to the main request.

**Prevention:**
- The preview reader must use the same composed abort signal that governs the whole send operation.
- Apply a hard byte limit using `ReadableStreamDefaultReader.read()` in a loop with an explicit counter; cancel the stream once `N` bytes are accumulated or the signal fires.
- Never await an unbounded stream read without a cancellation path.

**Phase:** `BodyPreview` implementation; also relevant to `Decode.discard()` drain logic.

---

## Minor Pitfalls

---

### Pitfall 17: `query` Array Serialization Order Is Non-Deterministic

**What goes wrong:** `query: { ids: [3, 1, 2] }` is serialized in a different order than the array declaration because the implementation uses `Object.entries()` on the query object and relies on insertion order but then sorts or processes values inconsistently.

**Prevention:** Serialize array values in declaration order. Use `URLSearchParams.append()` in array iteration order for repeated keys. Add a test asserting that `ids: [3, 1, 2]` produces `ids=3&ids=1&ids=2` in that exact order.

**Phase:** URL construction utilities.

---

### Pitfall 18: `undefined` Query Values Leak Into URL as the String `"undefined"`

**What goes wrong:** A query object `{ page: undefined }` is passed to `URLSearchParams` or string-concatenated directly, producing `?page=undefined` in the URL.

**Prevention:** Filter out keys whose value is `undefined` before building the query string. The spec explicitly states "`undefined` omits the key at that layer." Test that `query: { a: "1", b: undefined }` produces `?a=1` with no `b` key.

**Phase:** URL construction utilities.

---

### Pitfall 19: Missing `Content-Length` in Node Fetch for Non-Streaming Bodies

**What goes wrong:** Node's built-in `fetch` (undici-based) may not automatically set `Content-Length` for string or `Uint8Array` bodies in all versions. Some servers require `Content-Length` for non-chunked request bodies and return `411 Length Required`.

**Prevention:** For `Body.json`, `Body.text`, and `Body.bytes`, explicitly compute the byte length and set `Content-Length` in the merged headers if not already present. Verify behavior in the Node project against a mock server that asserts `Content-Length`.

**Phase:** Node-specific `send()` implementation.

---

### Pitfall 20: Release CI Can Publish Placeholder Code with Full Provenance

**What goes wrong:** The existing release workflow passes all quality gates because parity tests only assert placeholder exports. A release of `0.x.y` could be published with full npm provenance and a GitHub release note while the actual `send()` / `Request` / `Decode` API from the spec does not exist.

**Prevention:**
- Before the next release tag, add at least one behavior-level release gate: a test that calls `Request.create(...)` and asserts the returned object has the shape described in the spec.
- Alternatively, keep the package explicitly versioned as `0.x.y-scaffold.N` until spec implementation is complete, preventing accidental stable releases.

**Phase:** Release workflow hardening — should accompany or precede the first implemented spec feature.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| URL construction | Segment encoding too aggressive or too lenient | Per-segment `encodeURIComponent`; test `/`, `@`, `%`, spaces |
| URL construction | `undefined` query values appear in URL | Filter before `URLSearchParams` construction |
| Body preparation | `Body.json()` throws on circular refs | Wrap `JSON.stringify` in try/catch |
| Header merge | Case-sensitive key comparison | Lowercase all keys before merge |
| Response matching | Wrong layer precedence | Explicit 4-layer ordered search, no pre-merge |
| `Decode.*` | `none` vs `discard` collapsed | Discriminant tag; test against non-empty body |
| `Decode.*` | `optional` triggers on semantic null | Gate on byte count, not decoded value |
| `Decode.*` | Schema errors leak Zod internals | `normalizeZodIssues()` adapter; no Zod types in public surface |
| `send()` wiring | Deadline is per-attempt not whole-send | Single AbortController; absolute `deadlineAt` timestamp |
| `send()` wiring | `AbortSignal.any()` unavailable | Polyfill `combineSignals()` in `src/shared.ts` |
| Retry logic | Non-idempotent methods retried | Explicit `isRetryable()` guard with hard exclusions |
| Retry logic | Backoff ignores remaining budget | Check `remainingMs` before each sleep |
| Body preview | Preview hangs on slow stream | Use composed abort signal; enforce byte-count limit in read loop |
| Body preview | Double-consumption of response body | Branch decode vs preview paths exclusively |
| `Send.match()` types | Exhaustiveness not enforced | Invest in `Send.Matcher<R>` generic type; `@ts-expect-error` tests |
| Packed artifact | Source alias hides dist regression | Pack-and-install smoke test in CI |
| Neutral entrypoint | Wrong build loaded silently | Runtime guard or loud failure in `src/index.ts` |
| Release CI | Placeholder published with provenance | Behavior-level release gate before next tag |

---

## Sources

- `docs/SPEC.md` — primary specification; all semantic rules derived from here (HIGH confidence)
- `.planning/codebase/CONCERNS.md` — existing known issues and fragile areas (HIGH confidence)
- `.planning/codebase/STACK.md` — runtime targets, toolchain constraints (HIGH confidence)
- `.planning/codebase/TESTING.md` — current test coverage gaps (HIGH confidence)
- RFC 7230 §3.2 (HTTP header field names are case-insensitive) — MEDIUM confidence (standard)
- RFC 3986 §3.3 (path segment encoding rules) — MEDIUM confidence (standard)
- `AbortSignal.any()` compatibility: Node 20.3+, Chrome 116, Safari 17.4 — MEDIUM confidence (from MDN / Node.js changelog; verify against minimum supported versions when declared)
