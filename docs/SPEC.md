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
  diagnostics?: {
    bodyPreviewBytes?: number;
  };
};
```

### Client rules

- The client provides defaults.
- The request provides per-send overrides.
- Diagnostics are client-level settings, not part of ordinary request authoring.
- `diagnostics.bodyPreviewBytes` defaults to `8192`.

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
| `headers` | Merge case-insensitively by header name; request wins on conflicts |
| `query` | Merge by key; request wins on conflicts |
| `responses` | Layered; request takes precedence over client during response matching |
| `deadlineMs` | Request overrides client default |
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
  | "1xx"
  | "2xx"
  | "3xx"
  | "4xx"
  | "5xx";
```

There is no `default` matcher. Unmatched statuses must surface explicitly.

### Matching precedence

Response matching is layer-first:

1. request exact status
2. request class matcher
3. client exact status
4. client class matcher
5. `unhandledStatus`

This allows request-local response policy to override client defaults in an intuitive way.

## `send()` result contract

`send()` returns a structured result union.

```ts
type SendResult<R> =
  | { kind: "response"; response: R }
  | { kind: "transportError"; error: TransportError }
  | {
      kind: "decodeError";
      status: number;
      headers: Headers;
      error: DecodeError;
      preview: BodyPreview;
    }
  | {
      kind: "unhandledStatus";
      status: number;
      headers: Headers;
      preview: BodyPreview;
    };
```

### Meaning of each variant

- `response`: an HTTP response was received, matched by the response spec, and decoded successfully
- `transportError`: request execution failed before a usable decoded response could be produced
- `decodeError`: an HTTP response was received and matched, but body reading or decoding failed
- `unhandledStatus`: an HTTP response was received, but no response case matched

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
- Preview text is decoded with a best-effort strategy.
- `truncated` is `true` if more body content existed beyond the preview.

## Abort, deadline, and retries

### Abort

Abort is invocation-scoped, not part of the request spec.

```ts
await client.send(request, { signal });
```

### Deadline

`deadlineMs` is a whole-send deadline, not a per-attempt timeout.

It covers:

- all attempts
- all backoff delays
- waiting for the response
- body reading
- decoding

If the deadline expires, the result is:

```ts
{ kind: "transportError", error: { kind: "timeout" } }
```

Deadline expiry is terminal and is not retried.

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

Retries never apply to:

- caller abort (`signal` fired)
- deadline expiry
- `decodeError`
- `unhandledStatus`
- methods not listed in `methods`

## Affine runtime behavior

Request and response bodies are affine resources.

### Rules

- A `Request` is consumed once `send()` begins.
- A consumed `Request` must not be sent again.
- Reusable request construction belongs in factory functions that create fresh requests.
- Materialized request bodies such as `Body.json`, `Body.text`, `Body.formUrlEncoded`, and `Body.bytes` are replayable from a body-storage perspective.
- Replayability of the body does not imply that the request method is retryable.
- Decoded response values are fully materialized and are not affine after return.

## Request body contract

The outbound `Body` surface is intentionally small.

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
  - serializes with `JSON.stringify`
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
- `Decode.discard()`
  - body may exist
  - library safely disposes of it without exposing a value
  - disposal strategy is implementation-defined: cancel or drain
- `Decode.text()`
  - returns `string`
  - empty body decodes to `""`
- `Decode.json()`
  - parses JSON
  - returns `unknown`
  - empty body => `decodeError.emptyBody`
- `Decode.json(schema)`
  - parses JSON
  - validates against the configured schema adapter
  - empty body => `decodeError.emptyBody`
- `Decode.bytes()`
  - returns `Uint8Array`
  - advanced escape hatch
- `Decode.optional(inner)`
  - if body is exactly zero bytes after transfer/content decoding, returns `undefined`
  - otherwise runs `inner`

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

This specification assumes Zod for the initial implementation because it offers:

- excellent TypeScript ergonomics
- broad ecosystem support
- sufficient performance for HTTP response decoding

The public decode contract should remain thin enough that switching to Valibot later remains possible without changing the overall library design.

## Typed matcher helper

The library provides an exhaustive matcher helper:

```ts
Send.match(result, handlers)
```

### Matcher rules

- matching is exhaustive
- decoded response variants are matched by their declared tag
- failure variants are matched by fixed keys:
  - `transportError`
  - `decodeError`
  - `unhandledStatus`
- reusable handler fragments can be composed with plain object spread
- the final handler object is where TypeScript exhaustiveness should be checked

### Example

```ts
const handlers = {
  ...commonFailures,
  ...githubAuthCases,

  repoList: ({ body, headers }) => ({
    tag: "loaded",
    repos: body,
    etag: headers.get("etag"),
  }),

  notModified: () => ({
    tag: "useCachedRepos",
  }),
} satisfies Send.Matcher<typeof result, LoadMyReposResult>;

return Send.match(result, handlers);
```

## Example

```ts
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

    deadlineMs: 10_000,
  });
}
```

## Final shape of the design

This client is designed to be:

- explicit without being magical
- truthful about HTTP, transport, and decode boundaries
- ergonomic for ordinary status-specific API work
- strict about missed cases and invalid assumptions
- small in surface area, with strong defaults and few knobs

It intentionally favors semantic honesty over fetch-style convenience.
