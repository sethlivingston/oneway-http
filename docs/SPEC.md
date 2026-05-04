# HTTP Client Specification

## Purpose

This library defines a declarative HTTP client for TypeScript where the caller builds a meaningful request specification, passes it to `send()`, and receives a structured result.

The goal is a client that is explicit, truthful, and ergonomic.

## Motivation

### The categorical distinction most clients ignore

There are two fundamentally different categories of outcome when sending an HTTP request:

1. **Transport failure** — the request was never delivered, or no response was ever received. Examples: DNS resolution failure, TCP connection refused, connection reset mid-stream, deadline expiry before any response headers arrived, caller-initiated abort.

2. **HTTP response** — the server received the request and returned a response with a status code. A `404`, a `500`, and a `200` are all equally valid HTTP responses. They represent application-level semantics, not delivery failures.

This distinction is categorical, not a matter of degree. A `503` from an overloaded server is not a failed request — it is a complete, well-formed HTTP exchange that communicates specific information. Treating it as a thrown exception destroys semantic information and forces callers into awkward control flow.

### What existing clients get wrong

**`fetch` (browser and Node.js)** only rejects its Promise on transport failures. Any HTTP response — including `404` and `500` — resolves normally. This means:

- Callers must remember to check `response.ok` or `response.status` explicitly; there is no structural enforcement.
- Response body consumption is manual: callers must call `.json()`, `.text()`, or `.blob()`, and these calls can be forgotten, called twice, or called on the wrong content type.
- There is no structured failure taxonomy — network failure, abort, and timeout all throw different, untyped things.
- There is no retry support.

**`axios`** reacts to `fetch`'s permissiveness by going too far: non-2xx responses throw by default. This treats application-level HTTP semantics as errors. A caller that legitimately expects a `404` or `409` must wrap the send in `try/catch` and inspect the caught exception to recover a useful value — inverting the natural control flow for entirely valid exchanges.

**`ky`** makes the same inversion as axios: non-2xx statuses throw an `HTTPError`. Handling expected non-2xx responses requires exception-based branching rather than structured result handling.

**Go's `net/http`** correctly never errors on non-2xx responses. However, it exposes a raw `io.ReadCloser` body that callers must drain and close explicitly on every code path. Missing a `defer resp.Body.Close()` leaks resources silently. JSON parsing is manual. There is no retry, no deadline-aware body reading, and no structured transport error taxonomy.

### The recurring failures

Across these libraries, the same problems recur:

- Non-2xx responses are either silently ignored (fetch) or thrown as exceptions (axios, ky), with no path that treats them as first-class structured values.
- Transport failures are not distinguished from each other: "couldn't connect," "timed out," and "caller aborted" collapse into a single error channel.
- Response body consumption is manual and error-prone.
- Retry behavior is absent or undocumented; when present, it is not aware of idempotency, response class, or remaining deadline.
- No library enforces that the caller handles all expected status codes.

### What this library does instead

`oneway-http` is built on three premises:

1. Every HTTP response with a status code is a valid, structured outcome — not an error.
2. The caller declares up front which status codes they expect and how to decode each one. Unhandled statuses surface explicitly rather than silently.
3. Transport failures — cases where no status code was received — are returned as a small, closed taxonomy of structured values, never thrown.

Requests are declarative specifications. The caller describes the request, declares how to interpret each possible response, and hands the specification to `send()`. The library handles transport, deadlines, retries, body consumption, and decoding. The result is a closed union the caller is required to handle completely.

This library is intentionally scoped. Streaming request bodies, credentials management, and upload/download progress are out of scope for v1. The focus is on correctness and ergonomics for the common case: sending a well-formed request and handling the full set of outcomes without surprises.

## Core principles

1. A `Request` is a declarative value.
2. `send()` performs transport, deadline handling, retries, body consumption, and status-based decoding.
3. Any HTTP response with a status code is a valid HTTP response, not a transport error.
4. The caller decides what a status code means semantically.
5. Transport failures are returned as structured values, never thrown exceptions.
6. Response decoding is status-specific.
7. Unmatched statuses are surfaced explicitly.
8. Request and response bodies are affine resources and must be enforced as such at runtime.
9. The ordinary caller should not need to deal with `Uint8Array` or manual response body consumption.

## Request model

Requests are created with factory functions. Reusable request construction should generally live in ordinary functions rather than templates or fluent builders.

```ts
type Method =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT"
  | "QUERY";  // IESG-approved, pending RFC publication
```

`QUERY` is safe and idempotent (like `GET`) but carries a request body, making it suitable for complex search and filter payloads that do not fit in URI query parameters.

```ts
type QueryValue = string | number | boolean;

type RequestSpec = {
  method: Method;

  path?: readonly (string | number)[];
  absoluteUrl?: string | URL;

  query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  headers?: Record<string, string | undefined>;

  body?: Body;
  responses: ResponseMap;

  retry?: RetryPolicy;
  deadlineMs?: number;
};
```

### Request rules

- Exactly one of `path` or `absoluteUrl` must be present.
- `path` is resolved against the client `baseUrl`.
- `absoluteUrl` bypasses the client `baseUrl`.
- `path` is segment-based. Each segment is encoded separately and then joined with `/`.
- `query` is a plain object.
  - `undefined` omits the key at that layer.
  - arrays become repeated query keys in order
  - numbers and booleans are stringified normally
  - `null` is not supported
- `headers` is a plain object.
- Request bodies are always explicit via `Body.*`. The library never guesses body encoding.

## Client model

The client provides shared defaults and shared response cases.

```ts
type ClientSpec = {
  baseUrl?: string | URL;
  headers?: Record<string, string | undefined>;
  responses?: ResponseMap;
  retry?: RetryPolicy;
  deadlineMs?: number;
  fetch?: typeof globalThis.fetch;
  diagnostics?: {
    bodyPreviewBytes?: number;
  };
};
```

### Client rules

- The client provides defaults.
- The request provides per-send overrides.
- `fetch` is the underlying fetch implementation. Defaults to `globalThis.fetch`. Inject an alternative for testing or environments without a global fetch.
- Diagnostics are client-level settings, not part of ordinary request authoring.
- `diagnostics.bodyPreviewBytes` defaults to `8192`.

### Underlying fetch options

The library manages a fixed subset of the `fetch` init object. The rest are not exposed.

**Managed by the library — callers must not set these directly:**

| Init field | Managed as |
| --- | --- |
| `method` | From `RequestSpec.method` |
| `headers` | Merged from client + request headers |
| `body` | From `RequestSpec.body` |
| `signal` | From `send()` abort and deadline |
| `redirect` | Always `"follow"` |

**Not exposed — use runtime defaults:**

`mode`, `cache`, `credentials`, `keepalive`, `integrity`

`credentials` is explicitly out of scope for v1. The others are not needed for the current scope and may be reconsidered in a future version.

## Merge rules

The merge model is intended to match normal developer expectations:

- map-like things merge
- scalar policy values override
- complex policy objects replace

### Field behavior

| Field | Rule |
| --- | --- |
| `baseUrl` | Client default only; bypassed by request `absoluteUrl` |
| `method` | Request only |
| `path` / `absoluteUrl` | Request only |
| `headers` | Merge case-insensitively by header name; request wins on conflicts; keys normalized to lowercase |
| `query` | Merge by key; request wins on conflicts |
| `responses` | Layered; request takes precedence over client during response matching |
| `deadlineMs` | Request replaces client default; omit = inherit |
| `retry` | Omit on request inherits client policy; `false` explicitly disables; any value replaces client policy |
| `body` | Request only |
| `diagnostics` | Client only |

### Undefined merge semantics

For `headers` and `query`, `undefined` means "not specified at this layer", not deletion.

This version of the spec does not provide a mechanism for explicitly removing inherited headers or query parameters.

## Response matching

Response handling is defined by a response map.

```ts
type StatusMatcher =
  | number
  | "1xx"  // included for completeness; not surfaced by fetch() in most runtimes
  | "2xx"
  | "3xx"  // unreachable when redirect: "follow" is in effect — see Redirects
  | "4xx"
  | "5xx";

type ResponseMap = Partial<Record<StatusMatcher, TaggedDecoder>>;
```

A `TaggedDecoder` is created by calling `.as(tag)` on any decoder:

```ts
Decode.json(GhRepoList).as("repoList")  // TaggedDecoder<"repoList", GhRepoList>
Decode.none().as("notModified")          // TaggedDecoder<"notModified"> — no body
Decode.discard().as("serverError")       // TaggedDecoder<"serverError"> — no body
```

Every entry in a `ResponseMap` must be a `TaggedDecoder`. Raw decoders without `.as()` are not valid in a `ResponseMap`.

Tags must be unique across the merged `ResponseMap` (client + request combined). Reusing a tag is a validation error.

There is no `default` matcher. Unmatched statuses must surface explicitly.

### Matching precedence

Response matching is layer-first, then specificity-first within a layer:

1. request exact status
2. request class matcher (`"2xx"`, `"4xx"`, etc.)
3. client exact status
4. client class matcher
5. `unhandledStatus`

This means a client-level exact status (e.g., client `200`) is unreachable if the request defines a class matcher (e.g., request `"2xx"`) — the request layer wins before specificity within the client layer is evaluated. When precision matters, prefer exact status matchers at the request level.

The tag string from `.as(tag)` becomes the required key in `Send.Matcher`. This is the mechanism that connects the `ResponseMap` to the exhaustive handler object.

## `send()` result contract

`send()` returns a flat discriminated union. The `kind` field is either a caller-defined tag from the `ResponseMap` or one of four fixed result kinds.

```ts
type SendResult<R> =
  | R
  | { kind: "requestError";    error: RequestError }
  | { kind: "transportError";  error: TransportError }
  | { kind: "decodeError";     status: number; headers: Headers; error: DecodeError; preview: BodyPreview }
  | { kind: "unhandledStatus"; status: number; headers: Headers; preview: BodyPreview };
```

`R` is the union of all response variants derived from the merged `ResponseMap`. Each variant corresponds to one tagged decoder entry:

```ts
// Decoders that produce a value (json, text, bytes, optional):
{ kind: Tag; body: T; headers: Headers; status: number }

// Decoders with no exposed body (none, discard):
{ kind: Tag; headers: Headers; status: number }
```

`send()` returns the result of the final attempt. Intermediate retry attempts are not visible to the caller.

### Meaning of each variant

- Response variant (`R`): an HTTP response was received, matched, and decoded successfully. The `kind` is the caller-defined tag.
- `requestError`: the request could not be formed or was ineligible to send. See request error taxonomy.
- `transportError`: no HTTP response was received. See transport error taxonomy.
- `decodeError`: an HTTP response was received and matched, but body reading or decoding failed.
- `unhandledStatus`: an HTTP response was received, but no entry in the merged `ResponseMap` matched.

### `send()` signature

```ts
type SendOptions = {
  signal?: AbortSignal;
};

client.send(request: Request, options?: SendOptions): Promise<SendResult<R>>
```

## Request errors

```ts
type RequestError =
  | { kind: "bodySerializationFailed"; message: string }
  | { kind: "requestConsumed" };
```

### Request error meanings

- `bodySerializationFailed`: `Body.json(value)` was used and `JSON.stringify` threw during `send()`. This indicates a non-serializable value (circular reference, `BigInt`, throwing `.toJSON()`). Body serialization is deferred to `send()` time so that no factory function ever throws.
- `requestConsumed`: `send()` was called on a `Request` that had already been sent. This is a programming error. Use factory functions to produce fresh requests.

## Transport errors

Transport error taxonomy is deliberately minimal because JavaScript runtimes do not reliably expose precise network failure causes.

```ts
type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };
```

### Transport error meanings

- `aborted`: the caller's `AbortSignal` fired
- `timeout`: the request's whole-operation `deadlineMs` expired
- `network`: any other pre-response transport failure

If an HTTP status code was received, the result is not a transport error.

## Body preview

`decodeError` and `unhandledStatus` include a body preview.

```ts
type BodyPreview = {
  text: string;
  bytesRead: number;
  truncated: boolean;
};
```

### Preview rules

- The preview reads the first `N` raw bytes of the response body.
- `N` defaults to `8192`.
- `N` is configurable through `client.diagnostics.bodyPreviewBytes`.
- Preview text is decoded with a best-effort strategy: UTF-8 is attempted first; ISO-8859-1 (latin-1) is used as a fallback. No error is produced if the result is lossy.
- `truncated` is `true` if more body content existed beyond the preview.

## Redirects

Redirects are followed transparently. The caller never observes intermediate redirect responses.

- The library follows redirects using whatever mechanism the underlying runtime provides.
- Redirect behavior is not configurable in v1.
- A redirect loop or a response that exceeds the runtime's redirect limit surfaces as `{ kind: "transportError", error: { kind: "network" } }`.
- The final post-redirect response is the one matched against the `ResponseMap`.

## Abort, deadline, and retries

### Abort

Abort is invocation-scoped via `SendOptions`, not part of the request spec.

- If `send()` is called with a signal that is already in the aborted state, the result is immediately `{ kind: "transportError", error: { kind: "aborted" } }`. No network call is made.
- If the signal fires during body reading, the result is also `aborted`.

### Deadline

`deadlineMs` is a whole-send deadline, not a per-attempt timeout. It must be a positive number. Setting it to `0` is a validation error.

Omitting `deadlineMs` on a request inherits the client setting. Omitting it on the client means no deadline. Callers are encouraged to set a deadline at the client level to bound unbounded waits.

It covers:

- all attempts
- all backoff delays
- waiting for the response headers
- body reading
- decoding

If the deadline expires, the result is:

```ts
{ kind: "transportError", error: { kind: "timeout" } }
```

Deadline expiry is terminal and is not retried. If the deadline fires during body reading, `timeout` is returned — not `decodeError.bodyReadFailed`. The deadline takes precedence.

### Retry semantics

Retries are policy-driven and conservative by default.

```ts
type RetryOptions = {
  methods?: readonly Method[];           // default: ["GET", "HEAD"]
  retryableStatuses?: readonly number[]; // default: [502, 503, 504]
  maxAttempts?: number;                  // default: 3
  initialDelayMs?: number;               // default: 200
  maxDelayMs?: number;                   // default: 10_000
};

type RetryPolicy = true | false | RetryOptions;
```

- `true` — use all library defaults, no customization
- `false` — explicitly disable retry
- `RetryOptions` — override specific fields; unspecified fields use library defaults

Omitting `retry` on a request inherits the client's retry policy. Omitting it on the client means no retry by default.

The backoff strategy is bounded exponential with jitter. Jitter is applied per-attempt to spread retry load. The delay grows from `initialDelayMs` up to `maxDelayMs` across attempts.

`maxAttempts` is the total number of send attempts, including the first. A value of `3` means one initial attempt plus up to two retries.

Retry decisions are made against the raw HTTP status code before result classification. A response whose status appears in `retryableStatuses` is retried regardless of whether that status is matched in the `ResponseMap`.

Retries never apply to:

- caller abort (`signal` fired)
- deadline expiry
- `decodeError`
- methods not listed in `methods`

## Affine runtime behavior

Request and response bodies are affine resources.

### Rules

- A `Request` is consumed once `send()` begins. Passing a consumed `Request` to `send()` returns `{ kind: "requestError", error: { kind: "requestConsumed" } }`.
- Reusable request construction belongs in factory functions that create fresh requests.
- The affine constraint is caller-facing. Internally, `send()` retains and replays the request body across retry attempts. All v1 `Body` types are materialized and buffered for this purpose, making internal replay always possible.
- Replayability of the body does not imply that the request method is retryable. Retry eligibility is governed by `RetryPolicy.methods`.
- Decoded response values are fully materialized and are not affine after return.

## Request body contract

The outbound `Body` surface is intentionally small. `Body` is an opaque type — callers never inspect its internals. All factory functions return `Body` values that the library serializes internally during `send()`.

```ts
Body.none()
Body.json(value)
Body.text(value, contentType?)
Body.formUrlEncoded(entries)
Body.bytes(bytes, contentType?)
```

### Body semantics

- `Body.none()`
  - no request body
- `Body.json(value)`
  - stores the value; `JSON.stringify` is called during `send()`
  - if serialization fails, `send()` returns `requestError.bodySerializationFailed`
  - encodes as UTF-8
  - sets `content-type: application/json` if not already present
- `Body.text(value, contentType?)`
  - encodes as UTF-8
  - defaults to `text/plain; charset=utf-8`
- `Body.formUrlEncoded(entries)`
  - encodes as `application/x-www-form-urlencoded`
  - supports repeated keys
- `Body.bytes(bytes, contentType?)`
  - raw binary escape hatch

### Outbound body rules

- Request bodies must always be explicit.
- The library never infers JSON or text bodies from raw values.
- Streaming request bodies are out of scope for v1.
- Multipart (`multipart/form-data`) is out of scope for v1.

## Response decode contract

The inbound `Decode` surface is also intentionally small.

```ts
Decode.none()
Decode.discard()
Decode.text()
Decode.json()
Decode.json(schema)
Decode.bytes()
Decode.optional(inner)
```

### Decode semantics

- `Decode.none()`
  - strict emptiness contract
  - any bytes present => `decodeError.unexpectedBody`
  - appropriate for `HEAD` responses and `204 No Content`
- `Decode.discard()`
  - body may exist
  - library safely disposes of it without exposing a value
  - disposal strategy is implementation-defined: cancel or drain
  - appropriate when the body is irrelevant (e.g., `DELETE` responses)
- `Decode.text()`
  - returns `string`
  - empty body decodes to `""`
- `Decode.json()`
  - parses JSON
  - returns `unknown`
  - empty body => `decodeError.emptyBody`
- `Decode.json(schema)`
  - parses JSON
  - validates against the Zod schema; `ZodType<T>` is accepted directly
  - empty body => `decodeError.emptyBody`
- `Decode.bytes()`
  - returns `Uint8Array`
  - advanced escape hatch
- `Decode.optional(inner)`
  - if body is exactly zero bytes after transfer/content decoding, returns `undefined`
  - otherwise runs `inner`
  - useful for endpoints that return a body on success but no body on not-found or no-content

### HEAD responses

HTTP forbids a body on `HEAD` responses. Using a decoder that expects content (e.g., `Decode.json()`) against a `HEAD` response will produce `decodeError.emptyBody`. Use `Decode.none()` for `HEAD` responses.

### Decoder philosophy

- `Decode.none()` expresses a contract.
- `Decode.discard()` expresses indifference.
- `Decode.optional(inner)` is defined in terms of bytes, not semantic values like JSON `null`.

## Decode errors

Decode failures are normalized into a library-defined shape that does not leak schema-library-specific errors into the public contract.

```ts
type DecodeIssue = {
  path: Array<string | number>;
  message: string;
  code?: string;
};

type DecodeError =
  | { kind: "unexpectedBody" }
  | { kind: "emptyBody" }
  | { kind: "invalidJson"; message: string }
  | { kind: "schemaMismatch"; issues: DecodeIssue[] }
  | { kind: "bodyReadFailed"; message: string }
  | { kind: "custom"; message: string; details?: unknown };
```

### Decode error meanings

- `unexpectedBody`
  - used by `Decode.none()` when any body bytes are present
- `emptyBody`
  - used by decoders that require content but receive zero bytes
- `invalidJson`
  - JSON parsing failed
- `schemaMismatch`
  - JSON parsing succeeded but schema validation failed
- `bodyReadFailed`
  - status and headers were received, but the response body could not be fully read
- `custom`
  - escape hatch for future custom decoders/adapters

## Schema library choice

This specification uses Zod for the initial implementation. `Decode.json(schema)` accepts a `ZodType<T>` directly. The Zod schema is wrapped internally; the public contract (`DecodeError`, `DecodeIssue`) is intentionally schema-library-agnostic to preserve a future migration path to Valibot or another adapter without changing the overall library design.

## Typed matcher helper

`Send.match` is an optional ergonomic helper for handling the result union exhaustively. It is not required — plain TypeScript narrowing (`switch`, `if`) works equally well on the flat union.

```ts
type Send.Matcher<Result extends { kind: string }, Return> = {
  [K in Result["kind"]]: (payload: Omit<Extract<Result, { kind: K }>, "kind">) => Return
};

function Send.match<R extends { kind: string }, T>(
  result: R,
  handlers: Send.Matcher<R, T>
): T
```

### Matcher rules

- `Send.match` is exhaustive: every `kind` in the result union requires a corresponding handler. All keys in `Send.Matcher` are **required** — optional keys would defeat exhaustiveness and TypeScript would not catch missing handlers.
- Each handler receives the variant's fields with `kind` omitted — it is redundant at the call site.
- The fixed kinds (`requestError`, `transportError`, `decodeError`, `unhandledStatus`) are always present in the result union regardless of the `ResponseMap`.
- `Send.Matcher` is exported to enable typed reusable handler fragments. A partial fragment covering only a subset of cases can be typed as `Partial<Send.Matcher<Result, Return>>` and spread into a final exhaustive handler object.
- Spread composition silently takes the last definition when two fragments define the same key. This is a programming error; the type system does not detect it.

### Example

```ts
const commonFailures: Partial<Send.Matcher<typeof result, RepoLoadResult>> = {
  requestError:    ({ error })           => ({ state: "clientError" as const,  error }),
  transportError:  ({ error })           => ({ state: "networkError" as const, error }),
  decodeError:     ({ error, preview })  => ({ state: "parseError" as const,   error, preview }),
  unhandledStatus: ({ status, preview }) => ({ state: "unexpected" as const,   status, preview }),
};

const result = await github.send(listMyRepos({ sort: "updated" }));

return Send.match(result, {
  ...commonFailures,
  repoList:    ({ body, headers }) => ({ state: "loaded" as const, repos: body, etag: headers.get("etag") }),
  notModified: () => ({ state: "cached" as const }),
} satisfies Send.Matcher<typeof result, RepoLoadResult>);
```

## Example

### GET with conditional fetch and full result handling

```ts
// --- client setup ---

const github = createClient({
  baseUrl: "https://api.github.com",
  headers: { authorization: `Bearer ${token}` },
  responses: {
    "4xx": Decode.json(GhError).as("apiError"),
    "5xx": Decode.discard().as("serverError"),
  },
  retry: true,
  deadlineMs: 10_000,
});

// --- request factory ---

function listMyRepos(params: {
  visibility?: "all" | "public" | "private";
  sort?: "created" | "updated" | "pushed" | "full_name";
  direction?: "asc" | "desc";
  perPage?: number;
  page?: number;
  ifNoneMatch?: string;
}) {
  return Request.create({
    method: "GET",
    path: ["user", "repos"],

    query: {
      visibility: params.visibility ?? "all",
      sort: params.sort ?? "updated",
      direction: params.direction ?? "desc",
      per_page: params.perPage ?? 30,
      page: params.page ?? 1,
    },

    headers: {
      "if-none-match": params.ifNoneMatch,
    },

    responses: {
      200: Decode.json(GhRepoList).as("repoList"),
      304: Decode.none().as("notModified"),
    },
  });
}

// --- call site ---

const result = await github.send(listMyRepos({ sort: "updated" }));

return Send.match(result, {
  repoList:        ({ body, headers }) => ({ state: "loaded" as const,      repos: body, etag: headers.get("etag") }),
  notModified:     ()                  => ({ state: "cached" as const }),
  apiError:        ({ body })          => ({ state: "apiError" as const,     error: body }),
  serverError:     ({ status })        => ({ state: "serverError" as const,  status }),
  requestError:    ({ error })         => ({ state: "clientError" as const,  error }),
  transportError:  ({ error })         => ({ state: "networkError" as const, error }),
  decodeError:     ({ error, preview }) => ({ state: "parseError" as const,  error, preview }),
  unhandledStatus: ({ status, preview }) => ({ state: "unexpected" as const, status, preview }),
} satisfies Send.Matcher<typeof result, RepoLoadResult>);
```

### POST with body

```ts
function createRepo(params: {
  name: string;
  description?: string;
  private?: boolean;
}) {
  return Request.create({
    method: "POST",
    path: ["user", "repos"],
    body: Body.json({
      name: params.name,
      description: params.description,
      private: params.private ?? false,
    }),
    responses: {
      201: Decode.json(GhRepo).as("repoCreated"),
      422: Decode.json(GhValidationError).as("validationError"),
    },
  });
}
```

### Decode.optional — empty body as undefined

```ts
responses: {
  200: Decode.optional(Decode.json(GhUser)).as("user"),
  // result.body is GhUser | undefined — undefined when body is zero bytes
}
```

### Abort

`AbortSignal` is passed as part of `SendOptions`, not the request spec:

```ts
const controller = new AbortController();
const result = await github.send(listMyRepos({}), { signal: controller.signal });
// clean up: controller.abort() in a useEffect cleanup, React Query cancellation, etc.
```

## Final shape of the design

This client is designed to be:

- explicit without being magical
- truthful about HTTP, transport, and decode boundaries
- ergonomic for ordinary status-specific API work
- strict about missed cases and invalid assumptions
- small in surface area, with strong defaults and few knobs

It intentionally favors semantic honesty over fetch-style convenience.
