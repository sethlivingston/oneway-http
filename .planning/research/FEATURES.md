# Feature Landscape

**Domain:** Declarative, structured-result TypeScript HTTP client library
**Researched:** 2026-04-27
**Source of truth:** `docs/SPEC.md` — treated as the intended product direction

---

## Framing

This is not a SaaS product feature list. Every feature maps directly to a named surface in
`docs/SPEC.md`. The table-stakes / differentiators / anti-features split answers the question:
"When implementing the spec in phases, which parts must ship together, which parts distinguish
this library from alternatives, and which parts must be deliberately excluded?"

---

## Table Stakes

These are the foundational behaviors. Without them the library cannot be used at all, or it
fails its core promise of structured, explicit HTTP semantics.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `RequestSpec` factory (`Request.create`) | Every call to `send()` requires a valid request value | Low | Validation: exactly one of `path` / `absoluteUrl` must be set |
| Client factory with `baseUrl`, `headers`, `responses`, `retry`, `deadlineMs` | Shared defaults are the primary ergonomic reason to have a client object | Low–Med | Merge rules must be implemented alongside |
| Merge rules for `headers`, `query`, `responses`, scalar overrides | Without correct merge behavior the client+request model is broken | Medium | Case-insensitive header merge is the tricky part |
| `send()` returning `SendResult` union | The entire design premise — no thrown HTTP errors, no raw fetch | Medium | Must produce all four variants: `response`, `transportError`, `decodeError`, `unhandledStatus` |
| `Body.*` outbound surface (`none`, `json`, `text`, `formUrlEncoded`, `bytes`) | Explicit body encoding is a core principle; callers cannot use implicit inference | Low–Med | Sets `content-type` automatically only for `Body.json` |
| `Decode.*` inbound surface (`none`, `discard`, `text`, `json`, `bytes`) | Status-specific decoding is a core principle | Low–Med | `Decode.discard()` must safely exhaust the body; cancel-or-drain is implementation-defined |
| `Decode.json(schema)` with Zod validation | Typed JSON decoding is the primary consumer use-case | Medium | Requires Zod as a peer/bundled dependency; errors normalized to `DecodeError.schemaMismatch` |
| Response matching (exact status and class matchers `1xx`–`5xx`) | Without this the spec's response map concept has no runtime meaning | Medium | No `default` matcher — unmatched statuses surface as `unhandledStatus` |
| Layered matching precedence (request-exact → request-class → client-exact → client-class → unhandledStatus) | Request-local overrides are the primary mechanism for per-call specialization | Medium | Correct precedence is observable and must be tested |
| `TransportError` taxonomy (`aborted`, `timeout`, `network`) | Structured transport errors are a core promise | Low | Mapping raw fetch/network errors to this taxonomy is the non-trivial part |
| `DecodeError` taxonomy (6 variants) | Normalized decode errors prevent schema-library internals from leaking | Low | `custom` variant is an escape hatch; the others are spec-required |
| `BodyPreview` for `decodeError` and `unhandledStatus` | Debug-ability for unmapped or broken responses | Low–Med | `bodyPreviewBytes` defaults to 8192; configurable via `client.diagnostics` |
| Abort via caller `AbortSignal` on `send()` invocation | Standard browser/Node cancellation contract | Low | Produces `transportError { kind: "aborted" }` |
| `deadlineMs` whole-send deadline | Covers all attempts + backoff + body read; not per-attempt | Medium | Produces `transportError { kind: "timeout" }`; deadline expiry is terminal and not retried |
| Retry policy with defaults (GET/HEAD, transport failures, 502/503/504, jittered backoff) | Conservative retries prevent the most common silent reliability failures | Medium | Non-idempotent methods are opt-in, not default |
| Affine request enforcement (consumed-once on `send()`) | Core principle 8 from the spec — prevents accidental body re-use | Low–Med | Runtime check, not just a type-level guarantee |
| Runtime parity (Node.js + browser) | The library's packaging contract from day one | — | Already scaffolded; must survive the feature build-out |

---

## Differentiators

These features separate `oneway-http` from vanilla `fetch`, Axios, `ky`, `got`, and similar.
They are all in the spec, but they are worth calling out because they are the reason this
library exists.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `Send.match()` exhaustive typed matcher | TypeScript exhaustiveness check across all result variants and decoded response tags — impossible with vanilla `switch` | Medium | Requires tagged response naming (`.as("tag")` on each decoder); handler object shape must satisfy a `Matcher<R, T>` constraint |
| No `default` / catch-all status matcher | Forces callers to explicitly account for every status class they receive, surfacing unhandled statuses rather than swallowing them | Low (design decision, minimal code) | This is a deliberate constraint, not a missing feature |
| Affine runtime enforcement | Prevents double-send bugs at runtime, not just by convention | Low–Med | Other HTTP libraries rely on documentation or type tricks; this enforces it at call time |
| `Decode.none()` strict emptiness contract | Expresses a real API contract that the library enforces, not just a "I'll ignore the body" shortcut | Low | Contrast with `Decode.discard()` — the distinction is semantic, not just implementation |
| `Decode.optional(inner)` byte-based optionality | Zero-byte test is at the transfer level, not the semantic level (`null`, `""`, `{}` are not optional) | Low | Prevents the common mistake of treating JSON `null` as "no body" |
| Normalized `DecodeError` surface | Schema-library-agnostic error contract means switching from Zod to Valibot later does not change the library's public API | Low | Zod errors → `schemaMismatch { issues: DecodeIssue[] }` via an internal adapter |
| `deadlineMs` as a whole-operation budget | Covers retries + jitter + body reading in a single scalar — avoids the "per-attempt timeout grows unboundedly with retries" trap | Medium | The implementation must integrate the deadline AbortController with the retry loop |
| Layered response-map precedence | Allows client-level defaults for `401`/`5xx` while request-level specs override naturally without special syntax | Medium | The layer-first evaluation order (request before client, exact before class) is non-obvious but powerful |
| Segment-based `path` array | URL construction is explicit and encoding-safe; no accidental path injection from raw string interpolation | Low | Each segment encoded separately; joined with `/` against `baseUrl` |
| `BodyPreview` on error paths | Surfacing the first N bytes of an unmatched or broken response body turns debugging from "mystery status" into actionable diagnostics | Low–Med | preview is best-effort text decoding; `truncated` flag makes the limit explicit |

---

## Anti-Features

Capabilities to explicitly exclude from this milestone.

| Anti-Feature | Why Exclude | What to Do Instead |
|--------------|-------------|-------------------|
| Streaming request bodies | Explicitly out of scope for v1 per `docs/SPEC.md` and `PROJECT.md` | `Body.bytes()` covers the pre-buffered binary escape hatch |
| Fetch-style exceptions for HTTP status codes | Rejected by the library's core design — any received status is a structured result, never a thrown error | Return `{ kind: "unhandledStatus" }` for unmatched statuses |
| `default` / wildcard status matcher | Deliberately absent from `StatusMatcher`; forces explicit coverage | Callers use `"5xx"` class matchers or handle `unhandledStatus` in `Send.match()` |
| Implicit body encoding inference (raw object → JSON) | Rejected by core principle: "The library never guesses body encoding" | Callers use `Body.json(value)` explicitly |
| `null` in query values | Not supported per spec | Callers omit the key by passing `undefined` |
| Deletion / removal of inherited headers or query params | Not provided in this version of the spec | Accepted limitation; callers avoid inheriting defaults they need to delete |
| Fluent / chainable builder pattern | Spec prefers factory functions; reusable construction belongs in ordinary functions | `Request.create({...})` factory |
| Retry on non-idempotent methods by default | Unsafe without explicit opt-in | Policy can be overridden per-request with `retry.methods` |
| Retry on `decodeError`, `unhandledStatus`, or caller abort | These are deterministic or caller-initiated outcomes — retrying is wrong | These outcomes are terminal in the retry loop |
| Per-attempt timeout (as distinct from whole-send `deadlineMs`) | Not in the spec; adds knob without clear value over the deadline model | `deadlineMs` covers the whole operation budget |
| Response streaming / incremental body reads | Not in the spec for v1 | `Decode.bytes()` returns a fully materialized `Uint8Array` |
| Multipart form bodies (`multipart/form-data`) | Not in the `Body.*` surface | `Body.bytes()` escape hatch for callers who need it |
| Cookie jar / session management | Out of scope for a library; belongs in the consuming app | Callers set cookies via `headers` |
| HTTP/2 push or server-sent events | Out of scope | Not applicable to this request/response model |
| A hosted service, daemon, or UI | The repository is a published TypeScript library | — |

---

## Feature Dependencies

```
Request.create (RequestSpec factory)
  ├── Body.* (needed for requests with bodies)
  └── ResponseMap + Decode.* (needed for response matching)
        └── Decode.json(schema) → Zod adapter

Client factory
  └── Merge rules (headers/query merge, scalar override, responses layer)

send()
  ├── Request.create
  ├── Client factory + Merge rules
  ├── Response matching (layered precedence)
  ├── Body.* → outbound serialization
  ├── Decode.* → inbound body consumption + decoding
  ├── TransportError normalization
  ├── BodyPreview (for decodeError and unhandledStatus paths)
  ├── Abort (AbortSignal integration)
  ├── Deadline (AbortController wrapping whole-send budget)
  ├── Retry loop (needs deadline integration, affine body replayability check)
  └── Affine request enforcement (consumed-once check at send() entry)

Send.match()
  └── send() result types (SendResult union + tagged response names via .as())

Decode.optional(inner)
  └── any inner Decode.*
```

**Critical ordering constraint:** `send()` is the integration point for nearly every other
feature. The body and decode surfaces can be built and unit-tested independently, but they
only have meaning once wired into `send()`.

---

## MVP Recommendation

The PROJECT.md constraint is explicit: "Implement the library substantially as specified rather
than optimizing for a reduced MVP." This means there is no intentional deferral of spec
features. However, a sensible implementation order is:

**Phase 1 — Core request/response pipeline (no retries, no deadline):**
1. `RequestSpec` factory with URL construction (path segments + baseUrl, absoluteUrl bypass)
2. `Body.*` serialization surface
3. `Decode.*` deserialization surface (including `Decode.json(schema)` with Zod)
4. Client factory + merge rules
5. `send()` happy path: fetch, match status, decode, return `{ kind: "response" }`
6. `unhandledStatus` result path
7. `decodeError` result path with `BodyPreview`
8. `transportError` normalization (network errors → structured values)

**Phase 2 — Operational semantics:**
9. Abort via `AbortSignal`
10. `deadlineMs` whole-send deadline
11. Retry policy (defaults + per-request override)
12. Affine request enforcement at runtime

**Phase 3 — Ergonomics surface:**
13. `Send.match()` exhaustive typed matcher
14. `Decode.optional(inner)`

**Defer permanently (per spec):**
- Streaming request bodies
- Multipart bodies
- Per-attempt timeouts
- Any feature not in `docs/SPEC.md`

---

## Sources

- `docs/SPEC.md` — primary source of truth (HIGH confidence)
- `.planning/PROJECT.md` — project constraints and scope boundaries (HIGH confidence)
- `.planning/codebase/CONCERNS.md` — implementation gaps and risk areas (HIGH confidence)
- `.planning/codebase/TESTING.md` — existing test coverage context (HIGH confidence)
