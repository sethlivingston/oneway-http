# Phase 5: Response Matching + Decode Dispatch + Body Preview Integration — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement `matchResponse()`, wire decode dispatch into `send()`, and integrate `BodyPreview` into error paths. The result is the first end-to-end happy path: request → match → decode → typed `SendResult<R>`.

**In scope:**
- `src/types.ts` — add `DecoderLike` interface; change `TaggedEntry.decode: unknown` → `decode: DecoderLike`
- `src/response-matching.ts` (new file) — `matchResponse()` pure function + `classOf()` helper
- `src/preview.ts` — add `previewFromBytes()` for deriving preview from an already-buffered `Uint8Array`
- `src/send.ts` — replace Phase 3 stub with real dispatch: match → decode → `response | decodeError | unhandledStatus`

**Not in scope:**
- Retry loop → Phase 6
- `Send.match()` / `Send.Matcher<R,T>` helper → Phase 7
- Streaming request bodies → explicitly excluded from v1

</domain>

<decisions>
## Implementation Decisions

### D-01: `DecoderLike` interface instead of `decode: unknown` cast
- `TaggedEntry.decode` changes from `unknown` to `DecoderLike` — a structural interface defined in `types.ts`:
  ```ts
  export interface DecoderLike {
    fn(response: Response): Promise<unknown | DecodeError>;
  }
  ```
- `Decoder<T>` is structurally assignable to `DecoderLike` without any cast at the definition site.
- At dispatch, `entry.decode.fn(response)` returns `Promise<unknown | DecodeError>` — no cast required, no lint violations from `no-unsafe-type-assertion`.
- `types.ts` must stay import-free. `Response` is a browser global; `DecodeError` is already defined in `types.ts`. ✓
- **Why not `decode: Decoder<unknown>`?** That would require `types.ts` to import from `decode.ts`, reversing the dependency direction. `DecoderLike` is the clean seam.

### D-02: Keep `InferResponseUnion<M>` shape as `{ tag, body }` — ergonomics decision
- The ROADMAP's `ResponsesOf<M>` wording was imprecise. The existing `InferResponseUnion<M>` → `{ tag: "user"; body: User } | { tag: "order"; body: Order }` is the correct shape.
- This shape is retained as-is. `R` in `SendResult<R>` is this union.
- **Why `{ tag, body }` beats flat `User | Order`:**
  1. Callers can always discriminate `result.response.tag === "user"` to get `User` — no ambiguity when two decoder types overlap structurally.
  2. Phase 7's `Send.match()` is built directly on `tag` discrimination — flat union would require re-introducing tags later.
  3. Zero ergonomic cost when the map has a single entry: `result.response.body` is always typed.
- No change to `types.ts` for this decision — `InferResponseUnion<M>` already implements it.

### D-03: `previewFromBytes()` in `preview.ts` for decode-error path
- Add a second export to `src/preview.ts`:
  ```ts
  export function previewFromBytes(bytes: Uint8Array, maxBytes: number): BodyPreview
  ```
- This derives a `BodyPreview` from an already-buffered `Uint8Array` — no I/O, no stream access.
- The matched dispatch path in `send.ts`:
  1. `readBytes(response)` — buffers full body (Phase 4's internal normalizer)
  2. Pass `new Response(bytes)` to `entry.decode.fn(syntheticResponse)`
  3. On decode success → `{ kind: "response", response: { tag, body: decoded } }`
  4. On decode failure → `previewFromBytes(bytes, maxBytes)` → `{ kind: "decodeError", ..., preview }`
- This avoids reading the stream twice; preview is derived from the buffer, not re-read.
- **Why not reuse `readBodyPreview()`?** It takes a `Response` and reads the stream — stream is already consumed after `readBytes()`. `previewFromBytes` is pure (no I/O) and naturally reuses what we already have.

### D-04: `matchResponse()` — pure function, two maps, no pre-merge
- Signature: `matchResponse(status: number, requestMap: ResponseMap | undefined, clientMap: ResponseMap | undefined): TaggedEntry | null`
- Four-step lookup order (first match wins):
  1. `requestMap[status]` (exact)
  2. `requestMap[classOf(status)]` (class, e.g., `"2xx"`)
  3. `clientMap[status]` (exact)
  4. `clientMap[classOf(status)]` (class)
- Returns `null` for `unhandledStatus`.
- `classOf(status: number): string` — `Math.floor(status / 100) + "xx"` — lives in same file, not exported.
- Maps are **never pre-merged**. Passing both separately is the only way to enforce the two-tier precedence. This is a hard constraint from the ROADMAP and must be tested explicitly.
- Pure function → tested in isolation with no HTTP calls, no mocks.

### D-05: `unhandledStatus` preview — stream still available, use `readBodyPreview()`
- When `matchResponse()` returns `null`, the response stream has not been read yet.
- Use the existing `readBodyPreview(response, maxBytes)` from `preview.ts`.
- Do NOT call `readBytes()` for the unhandled path — that buffers the whole body unnecessarily.

### D-06: `decodeError` — result must be `DecodeError`, not a thrown exception
- `entry.decode.fn(response)` returns `Promise<T | DecodeError>`. To distinguish success from failure, duck-type on `"kind"` field (all `DecodeError` variants have `kind`).
- A `DecodeError` kind value will never collide with a valid decoded response value (the spec guarantees this — decoders return typed values, not objects with `kind`).
- If `decode.fn()` itself throws (unexpected — decoders are spec'd to return, not throw), wrap in `{ kind: "bodyReadFailed", message: String(e) }` to preserve the no-throw contract of `send()`.

### D-07: Wiring in `send.ts`
- After `fetch()` resolves, the current Phase 3 stub (lines 168–174) is replaced with:
  ```
  const match = matchResponse(response.status, spec.responses, clientSpec.responses);
  if (match === null) {
    const preview = await readBodyPreview(response, maxBytes);
    return { kind: "unhandledStatus", status, headers, preview };
  }
  const bytes = await readBytes(response);                     // buffers full body
  const syntheticResponse = new Response(bytes);
  let decoded: unknown;
  try {
    decoded = await match.decode.fn(syntheticResponse);
  } catch (e) {
    const preview = previewFromBytes(bytes, maxBytes);
    return { kind: "decodeError", status, headers, error: { kind: "bodyReadFailed", message: String(e) }, preview };
  }
  if (isDecodeError(decoded)) {
    const preview = previewFromBytes(bytes, maxBytes);
    return { kind: "decodeError", status, headers, error: decoded, preview };
  }
  return { kind: "response", response: { tag: match.tag, body: decoded } as R };
  ```
- `isDecodeError(v)` — duck-type helper: checks `typeof v === "object" && v !== null && "kind" in v && typeof v.kind === "string"` and that the kind matches a known `DecodeError` kind string.
- The `as R` cast is safe here: the compiler cannot prove `{ tag, body }` satisfies `R` (a generic phantom), but the only way to reach this branch is via `TaggedEntry<T>` whose `T` is `R`'s `body`. This is the single principled cast in the dispatch path — it is `as unknown as R` (double-cast through unknown) per the `no-unsafe-type-assertion` rule.

### D-08: `readBytes` — import from decode.ts or extract to shared location
- `readBytes()` is currently unexported in `decode.ts`. Phase 5 needs it in `send.ts`.
- **Decision:** Export `readBytes` from `decode.ts` and import it in `send.ts`.
- Dependency direction: `send.ts → decode.ts → types.ts` — no circular import. ✓
- Alternative (moving to `preview.ts` or a new shared utility) adds a new module with no clear home.

</decisions>

<canonical_refs>
## Canonical References

- `docs/SPEC.md` — behavioral source of truth; RESP-01–04 and PREV-01–03 govern this phase
- `.planning/REQUIREMENTS.md` — RESP-01 through RESP-04
- `.planning/phases/02-core-types-request-model/02-CONTEXT.md` — D-01–D-04: `TaggedEntry`, `InferResponseUnion`, `Request<R>` phantom threading
- `.planning/phases/04-body-producers-decoders/04-CONTEXT.md` — D-02: `readBytes()`, D-03: `discard()`, D-05: `optional()` synthetic Response pattern
- `src/types.ts` — `TaggedEntry`, `ResponseMap`, `InferResponseUnion`, `SendResult`, `DecodeError`
- `src/decode.ts` — `Decoder<T>` class, `readBytes()`, `Decode.*` namespace
- `src/preview.ts` — `readBodyPreview()` (stream-based preview)
- `src/send.ts` — Phase 3 stub at lines 168–174 (replace in Plan 2)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `readBodyPreview(response, maxBytes)` — stream-based, use for `unhandledStatus` path
- `readBytes(response)` — currently unexported in `decode.ts`; export it for use in `send.ts`
- `Decoder<T>.fn` — the callable slot; `DecoderLike.fn` mirrors its signature
- `InferResponseUnion<M>` — already produces `{ tag: Tag; body: T }` union; no changes needed
- Phase 3 stub comment: `// D-13, D-14: Phase 3 stub — ALL HTTP responses return unhandledStatus`

### Established Patterns
- `noUncheckedIndexedAccess` — `map[key]` returns `TaggedEntry | undefined`; explicit undefined check required before use
- Duck-type on `"kind"` — never `instanceof DecodeError`
- `exactOptionalPropertyTypes` — all `DecodeError` fields must be exact; check existing `DecodeError` union members before adding new ones
- No-throw contract — `send()` must never throw for HTTP-layer outcomes; all exceptions from decoders must be caught and structured

### Integration Points
- `send.ts` will import: `matchResponse` from `./response-matching.js`, `readBytes` from `./decode.js`, `previewFromBytes` from `./preview.js`
- `response-matching.ts` imports only from `./types.js`
- Dependency graph after Phase 5: `client.ts → send.ts → {body, decode, preview, response-matching, request}.ts → types.ts`

</code_context>
