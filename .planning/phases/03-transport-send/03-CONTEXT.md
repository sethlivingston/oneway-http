# Phase 3: Transport + Send - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the transport layer: a single-attempt `send()` that executes one HTTP request, composes the caller's abort signal with the deadline controller, classifies all transport errors, reads a body preview, and returns a `Promise<SendResult<R>>` that never throws.

Scope of `src/send.ts` (new file):
- `performSend(request, clientSpec, options)` — internal standalone transport function
- `AbortSignal.any()` composition: caller signal + deadline `AbortController`
- Transport error classification (`fetch()` catch + body-read catch)
- Body preview reading (first N bytes, deadline-aware)
- Pre-abort guard (check `signal.aborted` before consuming the request)

Scope of updates to `src/client.ts`:
- `Client` interface definition (with `send<R>()` method)
- `createClient()` return type changes from `ClientSpec` → `Client`

Three phases are **NOT** in scope here:
- Response matching + decode dispatch → Phase 5
- Body producers/decoders → Phase 4
- Retry loop + whole-operation deadline across attempts → Phase 6

</domain>

<decisions>
## Implementation Decisions

### `Client` interface and `createClient()` refactoring
- **D-01:** `createClient(spec: ClientSpec): Client` — return type changes from `ClientSpec` to `Client`. Phase 2's placeholder implementation is replaced. This is the only phase where transport logic exists, so it's the correct phase to fix this.
- **D-02:** `Client` interface lives in `src/client.ts` (which already imports from `types.ts`; it adds an import of `Request` from `request.ts` for the method signature). `SendOptions = { signal?: AbortSignal }` is added to `types.ts` (no imports needed — `AbortSignal` is a global).
- **D-03:** Internal implementation is `performSend(request: Request<R>, clientSpec: ClientSpec, options?: SendOptions): Promise<SendResult<R>>` exported from `src/send.ts`. `createClient()` in `src/client.ts` imports `performSend` and closes over the spec: `return { send: (req, opts) => performSend(req, spec, opts) }`. Dependency direction: `client.ts` → `send.ts` → `types.ts`, `request.ts`. No circular imports.
- **D-04:** `sendOnce` is intentionally NOT exported from the package entrypoints — it's an internal function. Only `createClient` and the `Client` interface are public surface.

### Pre-abort guard
- **D-05:** At the top of `performSend()`, before `request.consume()`, check `options?.signal?.aborted`. If true, return `{ kind: "transportError", error: { kind: "aborted" } }` immediately. No network call is made, no request consumption occurs. This matches the SPEC requirement verbatim: "If `send()` is called with a signal that is already in the aborted state, the result is immediately `{ kind: "transportError", error: { kind: "aborted" } }`. No network call is made."

### "Never throws" guarantee scope
- **D-06:** `performSend()` guarantees no throws for all HTTP outcomes. `request.consume()` throws `TypeError` on re-use (Phase 2 D-07) — this is a programming error, not an HTTP outcome, and is allowed to propagate. The "never throws" contract covers: transport failures, network errors, deadline expiry, abort, body-read errors, and (in Phase 3) all HTTP responses.
- **D-07:** `deadlineMs` validation: if `deadlineMs` is present and `<= 0`, throw `RangeError("deadlineMs must be a positive integer")`. This is consistent with D-06 — invalid arguments are programmer errors. The SPEC says this surfaces as `requestError.invalidSpec`; since `SendResult` (as defined in Phase 2) has no `requestError` variant, `RangeError` is used. This can be revisited if `requestError` is added to `SendResult` in a later phase.

### Deadline controller + `AbortSignal.any()` composition
- **D-08:** When `deadlineMs` is set (on request or client; request overrides): create `deadlineController = new AbortController()` and schedule `setTimeout(() => deadlineController.abort(new DOMException("Deadline exceeded", "TimeoutError")), effectiveDeadlineMs)`. Always `clearTimeout` in `finally`.
- **D-09:** Signal composition: three cases handled explicitly:
  - Both caller signal and deadline → `AbortSignal.any([callerSignal, deadlineController.signal])`
  - Deadline only → use `deadlineController.signal` directly
  - Caller signal only (no deadline) → use caller signal directly, no AbortController created
  - Neither → `undefined` (no signal passed to fetch)
- **D-10:** The `DOMException("Deadline exceeded", "TimeoutError")` abort reason is **mandatory**. Using `"TimeoutError"` as the name is what causes the thrown `AbortError` to have `error.name === "TimeoutError"`, enabling correct classification as `timeout` rather than `aborted`.

### Transport error classification
- **D-11:** Both `fetch()` and the body-read `await` are wrapped in separate `try/catch` blocks. Same classification logic applies to both:
  - `error.name === "TimeoutError"` → `{ kind: "transportError", error: { kind: "timeout" } }`
  - `error.name === "AbortError"` → `{ kind: "transportError", error: { kind: "aborted" } }`
  - anything else → `{ kind: "transportError", error: { kind: "network", cause: error } }`
- **D-12:** Classification fires in the body-read catch too. If the deadline fires during body reading, the result is `timeout` — never `decodeError.bodyReadFailed`. This is per the SPEC: "If the deadline fires during body reading, `timeout` is returned — not `decodeError.bodyReadFailed`. The deadline takes precedence." Implementing this in Phase 3 avoids Phase 6 having to retrofit the body-read path.

### Phase 3 response path (stub)
- **D-13:** When `fetch()` resolves with an HTTP `Response`, Phase 3 returns `{ kind: "unhandledStatus", status: response.status, headers: response.headers, preview }` for ALL HTTP responses. This is an explicit stub — Phase 5 inserts matching + decode dispatch at this exact location.
- **D-14:** The stub is deliberate and documented: Phase 5's job is to replace the `unhandledStatus` stub with the 4-step precedence algorithm. Phase 3 establishes the correct code location and preview reading; Phase 5 adds the decision logic. This is additive — not rework.

### Body preview reading
- **D-15:** Phase 3 implements body reading for `BodyPreview`: read the first `N` bytes where `N = clientSpec.diagnostics?.bodyPreviewBytes ?? 8192`. Use `response.body.getReader()` to stream-read until `N` bytes are accumulated or the stream ends. Set `truncated = true` if bytes read equals `N` and the stream was not exhausted.
- **D-16:** Body reading is wrapped in `try/catch`. On error, classify by `error.name` per D-11. The `combinedSignal` (or caller signal/deadline signal) that was passed to `fetch()` also governs the body stream in Node.js 24+ and modern browsers — when the signal fires, the reader's `read()` promise rejects with the appropriate abort error, enabling correct classification.
- **D-17:** `BodyPreview.text` is the UTF-8 decoded string of the first N bytes. Use `new TextDecoder().decode(bytesUint8Array)`. Decoding errors are swallowed — the preview is best-effort; set `text: ""` if decoding fails.

### Merge rules in `performSend()`
- **D-18:** URL construction: if `request.absoluteUrl` is set, use it directly (ignore `clientSpec.baseUrl`). Otherwise, join `clientSpec.baseUrl` with the encoded path segments from `buildPath()` and append the merged query string from `buildQuery()`. URL joining uses `new URL(path, baseUrl)` — `baseUrl` must end with `/` or the last segment is replaced per standard URL resolution.
- **D-19:** Effective headers: `mergeHeaders(clientSpec.headers, requestSpec.headers)` — already implemented in `client.ts`.
- **D-20:** Effective deadline: `requestSpec.deadlineMs ?? clientSpec.deadlineMs` — request overrides client. `undefined` means no deadline.
- **D-21:** `fetch` implementation: `clientSpec.fetch ?? globalThis.fetch`. Phase 3 uses the injectable `fetch` for all transport calls. This is the test seam.

### Entrypoints deferred
- **D-22:** `src/index.ts`, `src/browser.ts`, `src/node.ts` remain as placeholder stubs throughout Phases 3–7. Phase 8 (Documentation & Polish) updates all three entrypoints with full exports once the complete API surface is implemented. Tests for Phase 3 import directly from `../../src/send.js` and `../../src/client.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behavioral specification
- `docs/SPEC.md` — sole behavioral source of truth. Critical sections for Phase 3:
  - §`send() result contract` — `SendResult<R>` union definition and semantics
  - §`Transport errors` — `TransportError` taxonomy and classification rules
  - §`Abort, deadline, and retries` → `Abort` and `Deadline` subsections (retry is Phase 6)
  - §`Client type` — `Client` interface definition: `send<R>(request, options?): Promise<SendResult<R>>`
  - §`Merge rules` — field-by-field merge table (especially `deadlineMs`, `headers`, `responses`)
  - §`Underlying fetch options` — which fetch init fields the library manages vs. ignores

### Type constraints
- `tsconfig.json` — `strictPropertyTypes`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` all active
- `src/types.ts` — `SendResult<R>`, `TransportError`, `ClientSpec`, `RequestSpec`, `BodyPreview`, `TaggedEntry`, `ResponseMap` — Phase 3 reads these; also adds `SendOptions`

### Prior phase implementations (integration points)
- `src/request.ts` — `Request<R>` class; `Request.consume()` returns `RequestSpec` and marks consumed; `buildPath()`; `buildQuery()`
- `src/client.ts` — `mergeHeaders()`, `mergeQuery()`, `createClient()` (Phase 3 updates this); merge utilities are already correct
- `.planning/phases/02-core-types-request-model/02-CONTEXT.md` — D-07 (consume() throws TypeError), D-09/D-10 (merge rules), D-11 (types.ts zero imports constraint)

### Phase roadmap
- `.planning/ROADMAP.md` §Phase 3 — three sub-plans, success criteria, pitfall warning (D-10 DOMException name requirement)
- `.planning/REQUIREMENTS.md` §SEND-01–SEND-06 — requirement list for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/client.ts`: `mergeHeaders(base, override)` and `mergeQuery(base, override)` — already correct (undefined-filtering, case-insensitive keys). `performSend()` calls these directly.
- `src/request.ts`: `buildPath(segments)` → encoded path string; `buildQuery(params)` → `URLSearchParams`. Both are already exported and tested. `Request.consume()` returns `RequestSpec`.
- `src/types.ts`: `SendResult<R>`, `TransportError`, `BodyPreview`, `ClientSpec`, `RequestSpec` — all defined and correct for Phase 3.

### Established Patterns
- ESM-only with `.js` extensions on all relative imports: `import { ... } from "./types.js"` in `.ts` files.
- `verbatimModuleSyntax` is active — use `import type` for type-only imports.
- `exactOptionalPropertyTypes` — do not use `field?: T` where `undefined` is meaningful; use conditional assignment.
- Test files live in `tests/unit/`; import directly from `../../src/*.js`.
- Vitest for all unit tests; Playwright parity harness is for entrypoint routing only (Phase 8 concern).

### Integration Points
- `src/client.ts` gains `Client` interface + imports `performSend` from `src/send.ts`. New dependency: `client.ts` → `send.ts`.
- `src/send.ts` (new file) imports: `type { ClientSpec, SendResult, TransportError, BodyPreview, SendOptions } from "./types.js"`, `type { Request } from "./request.js"`, `{ buildPath, buildQuery } from "./request.js"`, `{ mergeHeaders, mergeQuery } from "./client.js"`.
  - Wait: if `send.ts` imports from `client.ts` AND `client.ts` imports from `send.ts`, that's a circular import. Resolve by moving `mergeHeaders` and `mergeQuery` to be called from within `client.ts`'s closure before passing resolved values to `performSend`, OR by having `performSend` accept pre-merged values, OR by factoring `mergeHeaders`/`mergeQuery` into a separate `src/merge.ts` utility module.
  - **Recommended resolution:** `performSend` accepts the already-resolved `effectiveHeaders`, `effectiveQuery`, `effectiveDeadlineMs`, `effectiveFetch`, and `mergedResponseMap` as parameters derived by `createClient()`'s closure. `send.ts` imports only from `types.ts` and `request.ts` — no import of `client.ts` at all. This eliminates the circular import concern cleanly.
- `types.ts` gains `SendOptions = { signal?: AbortSignal }` (single addition, no imports needed).

</code_context>

<specifics>
## Specific Ideas

- User confirmed: full implementation now, no MVP shortcuts. Deadline-aware body reading and complete signal composition are in scope for Phase 3.
- User confirmed: deferred to later phases only when a later phase is the natural home (e.g., retry loop in Phase 6). Do not defer anything that Phase 3's code must own.
- Phase 6 wraps Phase 3's single-attempt `performSend()` in a retry loop. Phase 3 must be complete enough that Phase 6 is purely additive (no modifications to Phase 3 code required).

</specifics>

<deferred>
## Deferred Ideas

- **Response matching + decode dispatch** — Phase 5. Phase 3's stub returns `unhandledStatus` for all HTTP responses; Phase 5 replaces this.
- **Retry loop and multi-attempt deadline** — Phase 6. Phase 3 is single-attempt only.
- **Body producers and decoders** — Phase 4. Phase 3 reads raw bytes for preview only; actual decode is Phase 4+5.
- **`requestError` variant in `SendResult`** — Not currently in the type (Phase 2 decision). If the SPEC requires surfacing `requestConsumed` / `invalidSpec` as structured results rather than thrown errors, a future phase should add the variant to `types.ts` and update `performSend()`. No action in Phase 3.
- **Entrypoint wiring** — Phase 8.

</deferred>

---

*Phase: 3-Transport-Send*
*Context gathered: 2026-05-05*
