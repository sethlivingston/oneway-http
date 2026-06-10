# @sethlivingston/oneway-http

A structured HTTP client for Node.js and browsers that returns every outcome — including transport failures, decode failures, and unmatched statuses — as a typed discriminated union. No thrown exceptions for HTTP outcomes. No runtime surprises.

[![npm](https://img.shields.io/npm/v/@sethlivingston/oneway-http)](https://www.npmjs.com/package/@sethlivingston/oneway-http)
[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue)](./LICENSE-APACHE)

## Install

```bash
npm install @sethlivingston/oneway-http
```

ESM only — there is no CommonJS build. See [Known Limitations](#known-limitations).

**Optional peer dependency:** If you use `Decode.json(schema)` with Zod schema validation, install Zod:

```bash
npm install zod
```

## Quick Start

```typescript
import { createClient, Request, Decode, Send } from "@sethlivingston/oneway-http";
import { z } from "zod";

const UserSchema = z.object({ id: z.string(), name: z.string() });
const ErrorSchema = z.object({ message: z.string() });

const client = createClient({ baseUrl: "https://api.example.com/" });

async function getUser(userId: string) {
  const req = Request.create({
    method: "GET",
    path: ["users", userId],
    responses: {
      200: Decode.json(UserSchema).as("user"),
      404: Decode.json(ErrorSchema).as("notFound"),
    },
  });

  const result = await client.send(req);

  return Send.match(result, {
    user: ({ body }) => ({ ok: true as const, user: body }),
    notFound: ({ body }) => ({ ok: false as const, reason: body.message }),
    transportError: (error) => { throw new Error(`Transport failure: ${error.kind}`); },
    decodeError: (error, status) => { throw new Error(`Decode failed (HTTP ${status}): ${error.kind}`); },
    unhandledStatus: (status) => { throw new Error(`Unexpected HTTP ${status}`); },
    requestError: (error) => { throw new Error(`Request error: ${error.kind}`); },
  });
}
```

## SendResult\<R\>

Every `client.send()` call resolves to `SendResult<R>`. The full union:

```typescript
type SendResult<R> =
  | { kind: "response";        response: R }
  | { kind: "transportError";  error: TransportError }
  | { kind: "decodeError";     status: number; headers: Headers; error: DecodeError; preview: BodyPreview }
  | { kind: "unhandledStatus"; status: number; headers: Headers; preview: BodyPreview }
  | { kind: "requestError";    error: RequestError };
```

where:

- `R` — the response union inferred from your `responses` map
- `TransportError` — `{ kind: "aborted" | "timeout" | "network" }`
- `DecodeError` — `{ kind: "unexpectedBody" | "emptyBody" | "invalidJson" | "schemaMismatch" | "bodyReadFailed" | "custom" }`
- `RequestError` — `{ kind: "bodySerializationFailed" | "requestConsumed" | "missingBaseUrl" | "duplicateResponseTag" | "invalidSpec" | "reservedResponseTag" }`
- `BodyPreview` — `{ text: string; bytesRead: number; truncated: boolean }` (first 8 KB by default)

## Send.match()

`Send.match(result, handlers)` dispatches to the matching handler. TypeScript enforces that all variants are covered.

```typescript
import { Send } from "@sethlivingston/oneway-http";

// result: SendResult<{ tag: "user"; body: User } | { tag: "notFound"; body: { message: string } }>
const message = Send.match(result, {
  // Response variants — one handler per tag in your responses map
  user:     ({ body }) => `Welcome, ${body.name}`,
  notFound: ({ body }) => `Not found: ${body.message}`,

  // Fixed error variants — always required
  transportError:  (error)                           => `Transport: ${error.kind}`,
  decodeError:     (error, status, headers, preview) => `Decode error (${status}): ${error.kind}`,
  unhandledStatus: (status)                          => `Unhandled HTTP ${status}`,
  requestError:    (error)                           => `Bad request: ${error.kind}`,
});
```

The `decodeError` handler accepts 4 parameters: `(error: DecodeError, status: number, headers: Headers, preview: BodyPreview)`. You may omit trailing params (TypeScript allows fewer-param callbacks), but all four are available.

### Reusable handler fragments

Define shared error handlers once and spread them into individual `Send.match()` calls. Use `satisfies Matcher<R, T>` on the final object to preserve per-handler return type inference:

```typescript
import { Send, type Matcher } from "@sethlivingston/oneway-http";

type ApiResult = { state: "loaded"; data: User[] } | { state: "networkError" } | { state: "unexpected"; status: number };

// Declare the send result first so its type is available for the shared fragment below.
const result1 = await client.send(getUsers);

const sharedErrors: Partial<Matcher<typeof result1, ApiResult>> = {
  transportError:  ()              => ({ state: "networkError" }),
  decodeError:     (error, status) => { throw new Error(`Decode failed (${status}): ${error.kind}`); },
  unhandledStatus: (status)        => ({ state: "unexpected", status }),
  requestError:    (error)         => { throw new Error(`Request error: ${error.kind}`); },
};

// In each call site, spread the shared handlers and add the response-specific ones:
return Send.match(result1, {
  ...sharedErrors,
  users: ({ body }) => ({ state: "loaded", data: body }),
} satisfies Matcher<typeof result1, ApiResult>);
```

## Body Producers

```typescript
import { Body } from "@sethlivingston/oneway-http";

Body.none()                                           // No body
Body.json({ name: "Alice" })                          // application/json
Body.text("hello")                                    // text/plain; charset=utf-8
Body.text("<p>hi</p>", "text/html")                   // Custom Content-Type
Body.formUrlEncoded({ name: "Alice", role: "admin" }) // application/x-www-form-urlencoded
Body.bytes(new Uint8Array([0x89, 0x50]))               // Raw bytes, no Content-Type
Body.bytes(data, "image/png")                         // Raw bytes with Content-Type
```

## Decode Factories

```typescript
import { Decode } from "@sethlivingston/oneway-http";
import { z } from "zod";

const UserSchema = z.object({ id: z.string(), name: z.string() });

Decode.none()                    // Assert no body; error if body found
Decode.discard()                 // Discard body without reading
Decode.text()                    // Read body as UTF-8 string
Decode.json()                    // Parse JSON → unknown
Decode.json(UserSchema)          // Parse JSON → User (validated by Zod)
Decode.bytes()                   // Read body as Uint8Array
Decode.optional(Decode.json(UserSchema))  // Empty body → undefined; non-empty → User
```

`Decode.optional(inner)` is useful for endpoints that may return a body on one status code but not another, or for truly optional response bodies. It treats zero bytes as `undefined` and delegates non-empty bodies to the wrapped decoder:

```typescript
const responses = {
  200: Decode.optional(Decode.json(UserSchema)).as("user"),
  // body is User | undefined — undefined when the server sends an empty 200
};
```

Pair a decoder with a tag using `.as(tag)`:

```typescript
const ErrorSchema = z.object({ message: z.string() });

const responses = {
  200: Decode.json(UserSchema).as("user"),     // → { tag: "user"; body: User }
  204: Decode.discard().as("deleted"),         // → { tag: "deleted"; body: void }
  404: Decode.json(ErrorSchema).as("notFound"),
};
```

## Request Configuration

`Request.create()` accepts path segments, query parameters, and headers alongside the response map:

```typescript
import { createClient, Request, Decode, Body } from "@sethlivingston/oneway-http";

const client = createClient({ baseUrl: "https://api.example.com/" });

const req = Request.create({
  method: "POST",
  path: ["v1", "users"],                        // joined as /v1/users
  query: { page: "1", limit: "20" },            // appended as ?page=1&limit=20
  headers: { "X-Request-Id": "abc-123" },       // merged with client headers
  body: Body.json({ name: "Alice" }),
  responses: {
    201: Decode.json(UserSchema).as("created"),
    409: Decode.json(ErrorSchema).as("conflict"),
  },
});

const result = await client.send(req);
```

## Retry Policy

Pass `retry` on the client or per-request. Request-level config wins.

```typescript
const client = createClient({
  baseUrl: "https://api.example.com/",
  retry: {
    methods: ["GET", "HEAD"],
    maxAttempts: 3,
    retryableStatuses: [429, 502, 503, 504],
    initialDelayMs: 200,
    maxDelayMs: 10_000,
  },
});

// Override per-request
const req = Request.create({
  method: "POST",
  path: ["jobs"],
  retry: false,   // disable retry for this POST
  responses: { 202: Decode.json(JobSchema).as("accepted") },
});
```

`retry: true` enables defaults: GET/HEAD only, 3 attempts, statuses [429, 502, 503, 504], 200 ms initial delay, 10 s cap.

## Deadline

Set a whole-operation deadline in milliseconds (covers all retry attempts):

```typescript
const client = createClient({
  baseUrl: "https://api.example.com/",
  deadlineMs: 5000,  // 5 s total budget across retries
});
```

On expiry, `result.kind === "transportError"` with `error.kind === "timeout"`.

## Zod Schema Decoder

`Decode.json(schema)` validates the parsed JSON against any Zod-compatible schema and infers the TypeScript type:

```typescript
import { z } from "zod";
import { createClient, Request, Decode, Send } from "@sethlivingston/oneway-http";

const ProductSchema = z.object({
  id:    z.string(),
  name:  z.string(),
  price: z.number(),
});
type Product = z.infer<typeof ProductSchema>;

const client = createClient({ baseUrl: "https://api.example.com/" });

async function getProduct(productId: string) {
  const req = Request.create({
    method: "GET",
    path: ["products", productId],
    responses: {
      200: Decode.json(ProductSchema).as("product"),
      // ↑ inferred as TaggedEntry<Product, "product">
    },
  });

  const result = await client.send(req);
  // result: SendResult<{ tag: "product"; body: Product }>

  return Send.match(result, {
    product: ({ body }) => ({ id: body.id, name: body.name, price: body.price }),
    // body is typed as Product — no cast needed
    transportError:  (error)         => { throw new Error(`transport: ${error.kind}`); },
    decodeError:     (error, status) => { throw new Error(`decode (${status}): ${error.kind}`); },
    unhandledStatus: (status)        => { throw new Error(`unexpected HTTP ${status}`); },
    requestError:    (error)         => { throw new Error(`request: ${error.kind}`); },
  });
}
```

## Known Limitations

- **ESM only.** There is no CommonJS build. Node.js `require()` is not supported; use `import`.

## Development

| Command | Purpose |
|---|---|
| `npm run build` | Build all entrypoints with tsup. |
| `npm run typecheck` | TypeScript no-emit check. |
| `npm run lint` | ESLint. |
| `npm run test` | Full test suite (build + lint + vitest). |
| `npm run verify` | Typecheck + lint + full test suite. |

## Releasing

The published package is `@sethlivingston/oneway-http`, versioned by the root
`package.json`. To cut a release:

1. Bump `version` in `package.json`, commit directly on `main`, and push.
2. Tag the commit `v<version>` (e.g. `v1.4.0`) and push the tag.
3. The Release workflow (`.github/workflows/release-package.yml`) re-runs the
   full verification suite, publishes to npm via OIDC trusted publishing with
   provenance, and creates the GitHub release.

The tag must match `package.json` exactly or the workflow fails. Prerequisites
are one-time: the `npm-publish` GitHub environment (tag policy `v*`) and an npm
trusted-publisher binding to the release workflow — no npm tokens anywhere.

If a release fails after the tag is pushed, prefer fixing the problem and
cutting the next patch version over moving the tag — the tag ruleset blocks
tag moves by design. Nothing publishes from a failed run, so an abandoned tag
is harmless.
