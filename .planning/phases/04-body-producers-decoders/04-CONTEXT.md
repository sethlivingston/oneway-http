# Phase 4: Body Producers + Decoders - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement all `Body.*` producers and `Decode.*` decoders; extract `BodyPreview` reading to `src/preview.ts`; update `send.ts` to use the new opaque `Body` type; and add `requestError` to `SendResult` to support body serialization failures.

**In scope:**
- `src/body.ts` — opaque `Body` type + `Body.none()`, `.json()`, `.text()`, `.formUrlEncoded()`, `.bytes()`
- `src/decode.ts` — `Decode.none()`, `.discard()`, `.text()`, `.json()`, `.json(schema)`, `.bytes()`, `.optional(inner)` using two-tier decoder architecture
- `src/preview.ts` — extract `readBodyPreview()` from `send.ts` (no behavior change)
- `src/types.ts` — add `requestError` variant to `SendResult`; add `RequestError` union
- `src/send.ts` — update to consume opaque `Body` via `serializeBody()`, surface `bodySerializationFailed` as `requestError`

**Not in scope:**
- Response matching + decode dispatch → Phase 5
- Retry loop → Phase 6
- Streaming request bodies → explicitly excluded from v1

</domain>

<decisions>
## Implementation Decisions

### Decoder calling convention — two-tier architecture
- **D-01:** All decoders have the uniform external signature `(response: Response) => Promise<T | DecodeError>`. Decoders receive the raw `Response`, not a pre-buffered `Uint8Array`. This is confirmed correct by the WHATWG Fetch spec, undici's `consumeBody` implementation, ky's `#cancelResponseBody`, and reqwest's `self`-consuming body methods. Pre-buffering (Option A) permanently loses the ability to cancel the stream.
- **D-02:** An internal shared helper `readBytes(response: Response): Promise<Uint8Array>` handles null-body normalization: `response.body === null` (204/304/205) → `new Uint8Array(0)`, per the WHATWG spec algorithm ("If body is null, call successSteps with empty byte sequence"). Normal decoders (`text`, `json`, `bytes`) call this helper. `discard()` and `none()` bypass it entirely.
- **D-03:** `Decode.discard()` calls `response.body?.cancel()` directly. No chunks are read, no memory is allocated. The `?.` null-guard handles 204/304 responses where `body === null`. This is the spec-correct pattern confirmed by ky's production code and the WHATWG Streams spec (cancel is on `ReadableStream`, not the Body mixin).
- **D-04:** `Decode.none()` reads exactly one chunk via `response.body?.getReader().read()`. If `done: true` (or `body === null`) → body is empty, pass. If `done: false` → cancel the stream, return `{ kind: "unexpectedBody" }`. Never allocates for the full body.
- **D-05:** `Decode.optional(inner)` calls `readBytes(response)` first. If `bytes.length === 0` → return `undefined`. Otherwise, wrap the bytes in a synthetic `new Response(bytes)` and call `inner(syntheticResponse)`. Memory cost is one buffer — unavoidable because empty detection requires knowing the body length. This is the cleanest available pattern; no prior art does better for this case.

### Body producers
- **D-06:** `Body` is an opaque type — its internal fields are not exported. `body.ts` exports a `serializeBody(body: Body): { init: BodyInit; contentType?: string }` internal function (not part of the public API) that `send.ts` imports. Serialization is deferred to `send()` time — factory functions never throw.
- **D-07:** `Body.json(value)` stores the raw value; `JSON.stringify` is called in `serializeBody()`. If stringify throws (circular reference, BigInt, throwing `.toJSON()`), `serializeBody()` throws and `send.ts` catches it, returning `{ kind: "requestError", error: { kind: "bodySerializationFailed" } }`.
- **D-08:** `Body.formUrlEncoded(entries)` uses `URLSearchParams` for encoding (handles repeated keys correctly via the `append()` path). `entries` type: `Record<string, string | readonly string[]>`.

### `RequestError` added to `SendResult`
- **D-09:** `SendResult<R>` gains a fifth variant: `{ kind: "requestError"; error: RequestError }`. `RequestError` union lives in `types.ts`: `{ kind: "bodySerializationFailed" } | { kind: "requestConsumed" } | { kind: "missingBaseUrl" } | { kind: "duplicateResponseTag"; tag: string } | { kind: "invalidSpec"; message: string }`. The `invalidSpec` and `requestConsumed` variants already exist as thrown errors in earlier phases (Phase 2 D-07, Phase 3 D-07) — they are NOT retrofitted now. Only `bodySerializationFailed` is wired up in Phase 4. The others remain thrown errors until a future phase explicitly adopts them into `SendResult`.

### `Decode.json()` overloads
- **D-10:** Standard TypeScript overloaded function declarations:
  ```ts
  function json(): Decoder<unknown>;
  function json<T>(schema: Schema<T>): Decoder<T>;
  ```
  `Schema<T>` is a duck-typed interface with `safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown }`. Zod errors are detected by duck-typing `.issues` (not `instanceof ZodError` — fails across module boundaries).

### `src/preview.ts` extraction
- **D-11:** `readBodyPreview()` is moved from `src/send.ts` to `src/preview.ts` with no behavior changes. `send.ts` imports it from `./preview.js`. This is a pure refactor — Phase 3's implementation is correct and is not modified. Dependency direction: `send.ts → preview.ts → types.ts`.

### Research-validated techniques
- **D-12:** When encountering body handling challenges, consult canonical implementations: undici (`lib/web/fetch/body.js`) for WHATWG spec-faithful behavior, ky for production TypeScript patterns, reqwest for ownership/consumption modeling, and got as a "what not to do for discard" counterexample. These sources resolved the normalize-first vs. raw-response tension and will remain useful for Phases 5–7.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behavioral specification
- `docs/SPEC.md` — sole behavioral source of truth; all body producer and decoder behavior is defined here
- `.planning/REQUIREMENTS.md` — BODY-01 through BODY-05 (producers), DEC-01 through DEC-08 (decoders), PREV-01 through PREV-03 (preview)

### Project context
- `.planning/PROJECT.md` — constraints (strict mode, exactOptionalPropertyTypes, noUncheckedIndexedAccess, ESM-only, zero runtime deps)
- `.planning/phases/02-core-types-request-model/02-CONTEXT.md` — type foundation decisions (D-01 through D-12)
- `.planning/phases/03-transport-send/03-CONTEXT.md` — send.ts dependency rules, `readBodyPreview()` implementation (D-15–D-17), `BodyPreview` in types.ts

### Prior art (informed D-01 through D-05)
- undici `lib/web/fetch/body.js` — spec-faithful `consumeBody` two-tier pattern; null-body normalization
- ky `source/core/Ky.ts` — `#cancelResponseBody(response)` production cancel pattern
- reqwest `src/async_impl/response.rs` — `do_bytes()` private normalizer; self-consuming body methods
- WHATWG Streams spec §cancel — `cancel()` lives on `ReadableStream`, not Body mixin

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types.ts` — `DecodeError`, `DecodeIssue`, `BodyPreview`, `TaggedEntry` already defined; `RequestSpec.body` currently typed as `BodyInit | undefined` — Phase 4 changes this to `Body | undefined`
- `src/send.ts` → `readBodyPreview()` — moves to `src/preview.ts`; import path updates to `./preview.js`
- `src/send.ts` → `classifyTransportError()` — body-read errors still classified here (Phase 3 D-11/D-12)

### Established Patterns
- `noUncheckedIndexedAccess` — use `.at(i) ?? fallback` or explicit prior guard for all byte indexing (Phase 3 pitfall P8)
- `TextDecoder` — use `{ fatal: false }` for preview decoding (Phase 3 pitfall P10)
- Duck-type error detection — never use `instanceof` across module boundaries; duck-type on `.name` (transport), `.issues` (Zod) (Phase 3 D-11, Phase 4 D-10)
- Undefined-filtering merge — never spread `{ ...base, ...override }` for headers/query; use explicit loop (Phase 2 D-09)

### Integration Points
- `send.ts` imports `serializeBody()` from `body.ts` (no circular dependency: `client.ts → send.ts → body.ts → types.ts`)
- `send.ts` imports `readBodyPreview()` from `preview.ts` (no circular dependency: `send.ts → preview.ts → types.ts`)
- Decoders in `decode.ts` are stored as opaque values in `TaggedEntry._decode` (Phase 2 D-01); Phase 5 casts and invokes them

</code_context>

<specifics>
## Specific Ideas

- `Decode.optional(inner)` uses synthetic `new Response(bytes)` to forward already-read bytes to the inner decoder — avoids re-streaming while keeping the uniform `Decoder<T>` interface
- `Decode.none()` peeks one chunk rather than reading the full body — avoids allocating for large unexpected bodies before returning `unexpectedBody`
- Connection reuse note: `cancel()` tears down the TCP connection rather than draining for keep-alive reuse. For this library's use case this is the correct trade-off. If connection pooling is ever a concern, a threshold strategy (drain if Content-Length < N) is the industry approach.

</specifics>

<deferred>
## Deferred Ideas

- Retrofitting `requestConsumed`, `missingBaseUrl`, `duplicateResponseTag`, `invalidSpec` into `SendResult.requestError` — those are thrown errors today; adoption deferred to a future phase
- Connection pool keep-alive threshold heuristic for `discard()` — out of scope for v1

</deferred>

---

*Phase: 4-body-producers-decoders*
*Context gathered: 2026-05-05*
