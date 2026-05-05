# GitHub Copilot Instructions — oneway-http

## Project Overview

A declarative TypeScript HTTP client for Node.js and browsers. Zero runtime dependencies.
Strict TypeScript: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ESM-only.

The behavioral source of truth is `docs/SPEC.md`. No behavior is implemented that contradicts or extends it without updating the spec first.

---

## Prior Art Reference

When facing non-trivial body handling, streaming, cancellation, or decoder architecture decisions,
consult these canonical sources before inventing a solution:

| Source | What it's authoritative for |
|---|---|
| **undici** `lib/web/fetch/body.js` | WHATWG Fetch spec-faithful implementation. The `consumeBody` function is the canonical two-tier pattern: outer function receives `Response`, inner converter callback receives `Uint8Array`. Null-body (204/304) → `Uint8Array(0)` per spec. |
| **ky** `source/core/Ky.ts` | Production TypeScript fetch wrapper. `#cancelResponseBody(response)` shows the correct stream cancel pattern. Body methods show typed decoder conventions. |
| **reqwest** `src/async_impl/response.rs` | Rust's ownership model makes the "decoder consumes Response" pattern explicit. `do_bytes()` is the private normalizer analog. Useful for reasoning about ownership and consumption semantics. |
| **got** `source/core/response.ts` | Counter-example: buffers entire body before decode (Option A). Correct for download libraries; wrong for a `discard()` that must cancel without reading. |

### Why this matters

During Phase 4 discussion, the ROADMAP plan text implied "normalize body to Uint8Array first, then pass to all decoders" (Option A). Consulting these sources confirmed:

- `cancel()` lives on `ReadableStream`, not the WHATWG Body mixin — you lose the ability to cancel once you've buffered
- `Decode.discard()` **must** receive the raw `Response` to call `response.body?.cancel()`
- `Decode.none()` should peek one chunk, not fully allocate — avoids memory cost for large unexpected bodies
- The two-tier pattern (outer: `Response`, inner helper: `Uint8Array`) is universally correct and spec-blessed

These sources should be the first stop when similar questions arise in Phases 5–8.

---

## Key Architectural Rules

- **Dependency direction:** `client.ts → send.ts → {body,decode,preview}.ts → types.ts`. No circular imports.
- **`types.ts` has zero imports** — all types it references are browser/Node globals.
- **Never use `instanceof`** across module boundaries — duck-type on `.name` (errors), `.issues` (Zod).
- **Never spread `{ ...base, ...override }`** for headers/query — use explicit undefined-filtering loop.
- **`noUncheckedIndexedAccess`** — use `.at(i) ?? fallback` for byte indexing; `arr[i]` is `T | undefined`.
- **`TextDecoder` for preview** — always `{ fatal: false }`; `{ fatal: true }` throws on truncated UTF-8.
- **Body serialization deferred to `send()` time** — factory functions (`Body.json()` etc.) never throw.
- **`Decode.discard()` uses `cancel()`, not drain** — draining a large error body wastes memory.
