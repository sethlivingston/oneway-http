# Architecture Research

**Domain:** Declarative TypeScript HTTP client library (ESM, multi-runtime)
**Researched:** 2026-05-04
**Confidence:** HIGH — based on direct spec analysis, codebase inspection, and established TypeScript patterns

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Package Consumers                           │
│   import "@sethlivingston/oneway-http"                             │
│   import "@sethlivingston/oneway-http/browser"                     │
│   import "@sethlivingston/oneway-http/node"                        │
└───────────────┬───────────────────┬──────────────────┬────────────┘
                │                   │                  │
                ▼                   ▼                  ▼
 ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
 │   src/index.ts   │ │  src/browser.ts  │ │    src/node.ts       │
 │ (neutral build)  │ │ (browser build)  │ │   (node build)       │
 │ runtime-detects  │ │ hardcodes target │ │  hardcodes target    │
 └────────┬─────────┘ └────────┬─────────┘ └──────────┬───────────┘
          │                    │                       │
          └────────────────────┴───────────────────────┘
                                │
              ┌─────────────────┴──────────────────────┐
              │           Shared Implementation         │
              │                                        │
              │  ┌──────────┐  ┌──────────┐            │
              │  │ client   │  │ request  │            │
              │  └──────────┘  └──────────┘            │
              │  ┌──────────┐  ┌──────────┐            │
              │  │  send    │  │ matcher  │            │
              │  └──────────┘  └──────────┘            │
              │  ┌──────────┐  ┌──────────┐            │
              │  │   body   │  │  decode  │            │
              │  └──────────┘  └──────────┘            │
              │  ┌───────────────────────────────────┐ │
              │  │           types.ts                │ │
              │  └───────────────────────────────────┘ │
              └────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | File |
|-----------|---------------|------|
| Platform entrypoints | Re-export all public API; set `runtimeTarget`; fix neutral's runtime detection bug | `src/index.ts`, `src/browser.ts`, `src/node.ts` |
| types | All shared type definitions — no logic | `src/types.ts` |
| request | `Request` class, `Request.create()`, path resolution, query building | `src/request.ts` |
| body | `Body` namespace — producer functions and `Body` opaque type | `src/body.ts` |
| decode | `Decode` namespace — decoder builders, `Schema<T>` interface, normalize logic | `src/decode.ts` |
| send | `send()` execution engine — transport call, retry loop, deadline, signal composition | `src/send.ts` |
| client | `createClient()`, merge rules for headers/query/responses/policy | `src/client.ts` |
| matcher | `Send.match()` function, `Send.Matcher<R,T>` type | `src/matcher.ts` |
| response-matching | Status-to-decoder lookup with layer precedence rules | `src/response-matching.ts` |

---

## Recommended Project Structure

```
src/
├── types.ts              # All shared types (no logic):
│                         #   RequestSpec, ClientSpec, ResponseMap, StatusMatcher
│                         #   SendResult, TransportError, DecodeError, DecodeIssue
│                         #   BodyPreview, Method, QueryValue, RetryPolicy
├── body.ts               # Body namespace: none() json() text() formUrlEncoded() bytes()
│                         # Body opaque type + internal encoding helpers
├── decode.ts             # Decode namespace: none() discard() text() json() bytes() optional()
│                         # Schema<T> duck-type interface; error normalization
├── request.ts            # Request class (private fields, consume())
│                         # Request.create() — validates spec, path encoding, query building
├── response-matching.ts  # matchResponse(status, requestMap, clientMap) → TaggedDecoder | null
│                         # Implements the 4-step precedence algorithm
├── send.ts               # send(request, client, options) → Promise<SendResult<R>>
│                         # Retry loop, deadline controller, AbortSignal.any(), transport call
│                         # Body consumption, preview capture
├── client.ts             # createClient() → Client; merge() helper for all merge rules
├── matcher.ts            # Send.match() + Send.Matcher<R,T> type export
├── browser.ts            # Re-exports: runtimeTarget="browser" + all shared exports
├── node.ts               # Re-exports: runtimeTarget="node" + all shared exports
└── index.ts              # Re-exports: runtime-detected runtimeTarget + all shared exports
```

### Structure Rationale

- **`types.ts` as pure types, no logic:** Prevents circular imports. All other modules can import from `types.ts` without creating dependency cycles. `types.ts` imports nothing.
- **`response-matching.ts` separate from `send.ts`:** The 4-step precedence algorithm is complex enough to test in isolation. Separating it keeps `send.ts` focused on the execution loop.
- **`decode.ts` owns the Schema adapter interface:** The `Schema<T>` structural type and Zod normalization live together so the seam is obvious. Future Valibot support means replacing/augmenting only `decode.ts`.
- **No `transport.ts`:** Node 24 native `fetch` is spec-identical to browser `fetch`. No platform-specific transport code is needed in v1. The `fetch` global works without abstraction. If transport needs to diverge (e.g., custom undici `Dispatcher`), introduce the adapter then.
- **Entrypoints are pure re-export files:** `browser.ts` and `node.ts` set `runtimeTarget` and re-export everything from the shared modules. They contain no business logic.

---

## Architectural Patterns

### Pattern 1: Opaque `Request` with Private Class Fields (Affine Enforcement)

**What:** The `Request` type is a class with `#spec` and `#consumed` as JavaScript private fields (`#`-prefix). Affine consumption is enforced via a `consume()` method that throws on second call. TypeScript cannot model linear/affine types natively; runtime enforcement is the correct solution.

**When to use:** Any value in the spec described as "consumed once" — currently only `Request`.

**Trade-offs:**
- Pro: `#spec` and `#consumed` are truly inaccessible from outside the class (JS runtime enforcement, not just TS compiler)
- Pro: `consume()` is a natural "hand this off to send()" idiom
- Con: `consume()` appears in IntelliSense for users; mark `@internal` in TSDoc
- Con: Class syntax in an otherwise functional-style library — acceptable given the strong encapsulation benefit

**Example:**
```typescript
export class Request<R extends { tag: string } = never> {
  readonly #spec: RequestSpec;
  #consumed = false;

  private constructor(spec: RequestSpec) {
    this.#spec = spec;
  }

  static create<M extends ResponseMap>(
    spec: RequestSpecInit<M>,
  ): Request<ResponsesOf<M>> {
    return new Request(normalizeSpec(spec)) as Request<ResponsesOf<M>>;
  }

  /**
   * @internal — Called once by send(). Do not call from application code.
   * Throws TypeError if the request has already been consumed.
   */
  consume(): RequestSpec {
    if (this.#consumed) {
      throw new TypeError(
        "This Request has already been consumed by send(). " +
        "Create a new Request for each call to send().",
      );
    }
    this.#consumed = true;
    return this.#spec;
  }
}
```

---

### Pattern 2: Generic Response Union Threading (RequestSpec → Request → SendResult → Matcher)

**What:** `Request<R>` is generic over the response union `R`. The `R` is inferred from the `ResponseMap` entries when calling `Request.create()`. This `R` then flows into `SendResult<R>` and `Send.Matcher<R, T>`, giving exhaustive type checking without manual type annotations.

**When to use:** This is the core type architecture — applies everywhere the response union appears.

**Trade-offs:**
- Pro: Users never annotate `R` explicitly; it's inferred from their `responses` object
- Pro: Adding/removing a response entry automatically updates what handlers are required
- Con: Deep generic nesting can produce intimidating error messages; requires careful type naming

**How the inference chain works:**

```typescript
// 1. Decode.json(schema).as("repoList") produces a TaggedEntry
interface TaggedEntry<T, Tag extends string> {
  readonly _tag: Tag;           // literal type for extraction
  readonly _phantom: T;         // phantom: exists only for TS inference, stripped at runtime
  decode(body: ArrayBuffer, headers: Headers): Promise<T | DecodeError>;
}

// 2. ResponseMap is inferred as the concrete record of tagged entries
type ResponseMap = {
  readonly [K in StatusMatcher]?: TaggedEntry<unknown, string>;
};

// 3. ResponsesOf<M> extracts the union of decoded response variants from the map
type ResponsesOf<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag } & (T extends void | null | undefined ? unknown : { body: T; headers: Headers })
    : never;
}[keyof M];

// 4. Request.create infers M from the responses field, produces Request<ResponsesOf<M>>
// 5. send() returns Promise<SendResult<R>> where R = ResponsesOf<M>
// 6. Send.Matcher<R, T> maps R's tags to handler functions + fixed failure handlers
```

**Key insight on `_phantom`:** The `_phantom: T` field is never set at runtime (use `declare` or cast). It is only present to carry the type through the generic extraction. With `exactOptionalPropertyTypes`, declare it as `declare readonly _phantom: T` so it carries type information without requiring a value.

---

### Pattern 3: Structural Duck-Typing for the Schema Adapter (`Schema<T>`)

**What:** Define a `Schema<T>` interface in terms of the minimum Zod-compatible surface. Zod schemas satisfy it structurally without any imports from Zod. Users pass Zod schemas directly to `Decode.json(schema)`. The library normalizes the result to `DecodeIssue[]` internally. No Zod types appear in the public API.

**When to use:** All schema-validated decoding. Forms the clean seam for a future Valibot swap.

**Trade-offs:**
- Pro: Zero coupling to Zod in the public API — Zod types cannot appear in `SendResult` or `DecodeError`
- Pro: Valibot adapter is a thin wrapper that maps Valibot's parse result to `Schema<T>` shape
- Pro: Users need zero boilerplate — `Decode.json(z.array(GhRepoSchema))` just works
- Con: The `Schema<T>` interface must match Zod's `safeParse` signature exactly; verify at each Zod major version

**Example:**
```typescript
// Exported in the public API — Zod-free
export interface Schema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: ReadonlyArray<{
            path: ReadonlyArray<string | number>;
            message: string;
            code?: string;
          }>;
        };
      };
}

// Internal normalization — never exported
function normalizeSchemaError(
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string; code?: string }>,
): DecodeIssue[] {
  return issues.map((i) => ({
    path: [...i.path],
    message: i.message,
    ...(i.code !== undefined ? { code: i.code } : {}),
  }));
}
```

**Zod compatibility check:** Zod v3 `ZodType<T>.safeParse()` returns `SafeParseReturnType<T>` which is `{ success: true; data: T } | { success: false; error: ZodError }`. `ZodError.issues` is `ZodIssue[]`, each with `path: (string | number)[]`, `message: string`, `code: ZodIssueCode` (string enum). This satisfies `Schema<T>` structurally. Verify on Zod v4 upgrade.

---

### Pattern 4: `Send.Matcher<R, T>` — Exhaustive Typed Handler Map

**What:** A mapped type that extracts the tag union from `R` and requires one handler per tag, plus three fixed failure handlers. TypeScript's mapped types provide exhaustiveness checking without requiring a union discriminant in the matcher.

**When to use:** `Send.match()` call sites. Also valid as a `satisfies` check on partial handler objects before spreading.

**Trade-offs:**
- Pro: Adding a new response variant in `responses:` immediately produces a type error at all `Send.match()` call sites — exhaustiveness is enforced at declaration, not usage
- Pro: The `satisfies` idiom lets users compose handlers with object spread and get early errors
- Con: TypeScript error messages for missing keys can be verbose with deep union types; use `type` aliases to improve readability in user code

**Example:**
```typescript
// In matcher.ts

type TagsOf<R> = R extends { tag: infer T extends string } ? T : never;

export type Matcher<R extends { tag: string }, T> = {
  readonly [Tag in TagsOf<R>]: (response: Extract<R, { tag: Tag }>) => T;
} & {
  readonly transportError: (error: TransportError) => T;
  readonly decodeError: (info: {
    status: number;
    headers: Headers;
    error: DecodeError;
    preview: BodyPreview;
  }) => T;
  readonly unhandledStatus: (info: {
    status: number;
    headers: Headers;
    preview: BodyPreview;
  }) => T;
};

export function match<R extends { tag: string }, T>(
  result: SendResult<R>,
  handlers: Matcher<R, T>,
): T {
  if (result.kind === "response") {
    const tag = result.response.tag;
    // The cast is safe: the type system enforces all tags have handlers
    return (handlers as Record<string, (r: unknown) => T>)[tag]!(result.response);
  }
  if (result.kind === "transportError") return handlers.transportError(result.error);
  if (result.kind === "decodeError") {
    return handlers.decodeError({
      status: result.status,
      headers: result.headers,
      error: result.error,
      preview: result.preview,
    });
  }
  return handlers.unhandledStatus({
    status: result.status,
    headers: result.headers,
    preview: result.preview,
  });
}
```

**Usage pattern (from spec):**
```typescript
const result = await client.send(request);

// satisfies enforces exhaustiveness at the handlers definition
const handlers = {
  ...commonFailures,        // transportError, decodeError, unhandledStatus
  repoList: ({ body }) => body,
  notModified: () => cached,
} satisfies Send.Matcher<typeof result extends SendResult<infer R> ? R : never, Repos>;

return Send.match(result, handlers);
```

---

### Pattern 5: Response Matching — 4-Step Precedence Algorithm

**What:** A pure function `matchResponse(status, requestMap, clientMap)` that implements the spec's matching precedence: (1) request exact → (2) request class → (3) client exact → (4) client class → null (unhandledStatus).

**When to use:** Called once per send attempt result inside `send.ts`.

**Trade-offs:**
- Pure function makes it unit-testable in complete isolation from the HTTP stack
- The class matchers ("2xx", "4xx", etc.) require string-based lookup — implement as `classOf(status)` helper returning e.g. `"2xx"`

**Example:**
```typescript
// In response-matching.ts
function classOf(status: number): StatusMatcher {
  return `${Math.floor(status / 100)}xx` as StatusMatcher;
}

export function matchResponse(
  status: number,
  requestMap: ResponseMap | undefined,
  clientMap: ResponseMap | undefined,
): TaggedEntry<unknown, string> | null {
  return (
    requestMap?.[status as StatusMatcher] ??
    requestMap?.[classOf(status)] ??
    clientMap?.[status as StatusMatcher] ??
    clientMap?.[classOf(status)] ??
    null
  );
}
```

---

## Data Flow

### Request Lifecycle

```
Request.create(spec)
    │  validates spec fields
    │  encodes path segments
    │  builds query string
    │  stores in #spec, #consumed=false
    ▼
Request<R> (opaque, unconsumed)
    │
    ▼
client.send(request, { signal? })
    │  calls request.consume() → gets RequestSpec, marks #consumed=true
    │  merges client defaults + request overrides (headers, query, responses, policy)
    │  creates deadline AbortController if deadlineMs set
    │  combines with AbortSignal.any([callerSignal, deadlineSignal])
    │
    ▼ (retry loop)
fetch(url, { method, headers, body, signal })
    │  on fetch throw → classify as aborted | timeout | network
    │  on response → read status + headers
    │
    ▼
matchResponse(status, requestResponses, clientResponses)
    │  returns TaggedEntry or null
    │  null → capture preview → return { kind: "unhandledStatus" }
    │
    ▼ (matched)
decoder.decode(response.body, headers)
    │  reads body as ArrayBuffer (respects deadline signal)
    │  on read failure → capture preview → return { kind: "decodeError" }
    │  applies decode logic (JSON.parse, schema.safeParse, text decode, etc.)
    │  on decode failure → return { kind: "decodeError" }
    │
    ▼
{ kind: "response"; response: { tag, body?, headers } }
```

### Merge Rules (client.ts)

```
ClientSpec defaults + RequestSpec overrides → MergedSpec

headers:   merge case-insensitively, request wins conflicts
query:     merge by key, request wins conflicts, undefined = skip key
responses: both maps consulted during matching (not merged into one)
deadlineMs: request overrides client
retry:      request replaces client policy entirely
body:       request only
baseUrl:    client only (absoluteUrl bypasses)
```

---

## Cross-Runtime Abstraction

### Assessment: No Platform-Specific Code Needed in v1

Node 24 ships with the undici-based native `fetch` as a stable global. The `fetch` API surface is spec-identical to browser `fetch`:

- `fetch(url, init)` — same signature
- `Response.body` — `ReadableStream<Uint8Array>` in both
- `AbortSignal.any([...])` — available Node 20.3+, well within the Node 24 constraint
- Error behavior on abort — `AbortError` thrown by `fetch` in both environments

**Decision:** All implementation code lives in shared modules. `browser.ts` and `node.ts` are pure re-export files that differ only in `runtimeTarget`. No `FetchAdapter` interface is needed for v1.

### Neutral Entrypoint Runtime Detection

The `src/index.ts` must not hardcode `runtimeTarget: "browser"` (existing bug, flagged in PROJECT.md). The fix:

```typescript
// In src/index.ts — compiled with platform: "neutral"
const runtimeTarget: RuntimeTarget =
  typeof process !== "undefined" &&
  typeof (process as { versions?: { node?: string } }).versions?.node === "string"
    ? "node"
    : "browser";

export { runtimeTarget };
export * from "./client.js";
export * from "./request.js";
export * from "./body.js";
export * from "./decode.js";
export * from "./send.js";
export * from "./matcher.js";
export type * from "./types.js";
```

### When to Introduce a Transport Abstraction

Introduce a `FetchTransport` interface only if a future requirement arrives that differs between platforms:
- Custom undici `Dispatcher` (Node-only connection pooling, proxy support)
- Browser `credentials: "include"` or cookie policies
- Custom DNS resolution

Until then, the single `fetch(url, init)` call in `send.ts` is the transport layer.

---

## Scaling Considerations

This is a library, not a service. "Scaling" means: how does the code hold up as features are added?

| Scale | Architecture Adjustments |
|-------|--------------------------|
| v1 (current scope) | Flat `src/` directory with 8-9 files; no subdirectories needed |
| + streaming bodies | Add `src/body-stream.ts`; introduce `FetchTransport` if Node needs undici streaming |
| + Valibot adapter | Add `src/schema-adapters/valibot.ts`; `Schema<T>` interface already defines the seam |
| + diagnostics/tracing | Add `src/diagnostics.ts`; thread optional `DiagnosticsHook` through `send.ts` |
| + middleware/interceptors | Add `src/pipeline.ts`; significant refactor of `send.ts`; evaluate if spec warrants it |

---

## Anti-Patterns

### Anti-Pattern 1: Leaking Zod Types into `DecodeError` or `SendResult`

**What people do:** Return `z.ZodError` directly as part of `decodeError`, or type a parameter as `z.ZodIssue`.

**Why it's wrong:** Makes Zod a required runtime dependency for consumers. Breaks the `Schema<T>` adapter seam. Users get Zod errors they can't meaningfully handle without importing Zod.

**Do this instead:** Always normalize via `normalizeSchemaError()` in `decode.ts`. The public shape is `DecodeIssue[]`. Zod-specific `code` values leak through as opaque strings — which is fine and intentional.

---

### Anti-Pattern 2: Merging `responses` Maps at Setup Time

**What people do:** Pre-merge client and request `ResponseMap` into a single map when calling `send()`.

**Why it's wrong:** Destroys the layer precedence. The spec requires request exact → request class → client exact → client class, in that order. A pre-merge into a single map loses the layer information.

**Do this instead:** Pass both maps separately to `matchResponse()`. The 4-step lookup is explicit and cheap (at most 4 property accesses per response).

---

### Anti-Pattern 3: Storing Decoded Body on the `Response` Object

**What people do:** Decode the body eagerly in the response-matching phase, then wrap the result in a response object.

**Why it's wrong:** Body is a stream — it can only be read once. Eagerly reading and then storing conflates the "matched" and "decoded" phases, making partial failure handling impossible and preview capture awkward.

**Do this instead:** Match first (status + map lookup), then decode once the decoder is known. The decoder receives the `ArrayBuffer` (already read) and the `Headers`. The preview is read from the same buffer if decoding fails — no second stream read needed.

---

### Anti-Pattern 4: `Symbol.for()` for Module-Private Request State

**What people do:** Use `Symbol.for("oneway-http.consumed")` to create a globally-accessible symbol key for affine state, then export it for use in `send.ts`.

**Why it's wrong:** `Symbol.for()` is globally accessible by anyone who knows the string. This allows external code to clear the consumed flag — defeating the entire affine protection. Also, exported symbols appear in the public API surface.

**Do this instead:** Use JavaScript private class fields (`#consumed`, `#spec`). They have true runtime inaccessibility — even with `Symbol.for()` or `Reflect`, external code cannot access `#`-prefixed fields. The class's `consume()` method is the only path in, and it throws on second call.

---

### Anti-Pattern 5: Generic Entrypoints That Re-Implement Merge Logic

**What people do:** Put merge logic, retry defaults, or response matching inside `browser.ts` or `node.ts` to handle platform-specific defaults.

**Why it's wrong:** Diverges platform behavior unnecessarily. Creates maintenance burden. The library's behavior must be identical across platforms — any behavioral difference is a bug, not a feature.

**Do this instead:** All logic lives in shared modules. Entrypoints are pure re-export files. The only thing that differs between `browser.ts` and `node.ts` is the `runtimeTarget` string literal.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `types.ts` → all | Type imports only (`import type`) | Never import values from `types.ts` — it has none |
| `request.ts` → `types.ts` | `import type { RequestSpec, ... }` | One-directional |
| `decode.ts` → `types.ts` | `import type { DecodeError, DecodeIssue, ... }` | Schema normalization internal to `decode.ts` |
| `send.ts` → `request.ts` | Calls `request.consume()` — the only cross-module affine operation | `send.ts` is the only consumer of `consume()` |
| `send.ts` → `response-matching.ts` | Calls `matchResponse(status, reqMap, clientMap)` | Pure function, no shared state |
| `send.ts` → `decode.ts` | Calls decoder returned by `matchResponse` | Decoder is a callable object, not a namespace import |
| `client.ts` → `send.ts` | `createClient()` returns an object with `send()` method | `client.send()` is a thin wrapper that passes merged config |
| `matcher.ts` → `types.ts` | Type imports for `SendResult`, `TransportError`, etc. | `match()` implementation uses a string key cast — acceptable |
| Entrypoints → all modules | Re-export public API; set `runtimeTarget` | No logic in entrypoints |

### External Interfaces

| Interface | How It Works | Notes |
|-----------|-------------|-------|
| `Schema<T>` (Zod) | Structural duck-typing — Zod schemas satisfy it without any adapter boilerplate | Verify compatibility with each Zod major release |
| `Schema<T>` (Valibot) | Requires a thin wrapper to map Valibot's `parse()`/`flatten()` API to `safeParse()` shape | Implementation deferred; seam is clean |
| `fetch` (global) | Called directly — no wrapper needed in v1 | If Node undici customization needed, introduce `FetchTransport` |
| `AbortSignal.any()` | Used to combine caller signal + deadline controller | Node 20.3+, within v1 constraint (Node 24 required) |

---

## Sources

- `docs/SPEC.md` — primary behavioral source of truth (affine rules, response matching algorithm, decoder semantics, matcher shape, merge rules)
- `src/shared.ts`, `src/browser.ts`, `src/node.ts`, `tsup.config.ts` — existing scaffold structure
- `.planning/codebase/ARCHITECTURE.md` — existing entrypoint/build layer analysis
- TypeScript Handbook: Mapped Types, Conditional Types, Template Literal Types — for `TagsOf<R>`, `ResponsesOf<M>` patterns
- TypeScript Private Class Fields (`#`) — ES2022 spec, in-scope per `target: "ES2022"` in tsconfig
- Node.js 24 docs: native fetch is stable, spec-compatible global since Node 18

---

*Architecture research for: oneway-http — declarative TypeScript HTTP client*
*Researched: 2026-05-04*
