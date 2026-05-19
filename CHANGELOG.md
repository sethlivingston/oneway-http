# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `baseUrl` is now automatically normalized to end with a trailing `/`, preventing silent URL
  truncation when a versioned path segment (e.g. `/v1`) is present.
- Response matching precedence is now specificity-first: an exact status match (`200`) always
  beats a class match (`"2xx"`) regardless of whether the exact match comes from the client
  map and the class match comes from the request map. Previous layer-first ordering made
  client-level exact matchers silently unreachable when a request-level class matcher was
  present.

### Added

- `llms.txt` — structured library context for AI coding assistants. Shipped in the npm
  package so tools that inspect `node_modules` can discover it automatically.
- `Decode.optional()` documented in the README quickstart alongside the other decoder
  factories.
- Reusable handler fragment pattern (`Partial<Matcher<R, T>>` spread) documented in README.

## [0.9.0] - 2025-05-01

### Added

- `createClient(spec)` — creates a reusable `Client` bound to a `ClientSpec` (base URL,
  default headers, default query params, client-level response map, retry policy, deadline).
- `Request.create(spec)` — builds an affine, typed `Request<R>` from a `RequestSpec`.
  Supports `path` segments (resolved against `baseUrl`) or `absoluteUrl` (bypasses base URL).
- `Body.*` factory namespace — `none()`, `json()`, `text()`, `formUrlEncoded()`, `bytes()`.
  All factories are non-throwing; serialization errors surface as `requestError` at send time.
- `Decode.*` factory namespace — `none()`, `discard()`, `text()`, `json()`, `json(schema)`,
  `bytes()`, `optional(inner)`. Zod schemas accepted via duck-typed `Schema<T>` interface.
- `Decoder<T>.as(tag)` — pairs a decoder with a unique string tag to produce a `TaggedEntry`
  for use in a `ResponseMap`.
- `client.send(request, options?)` — performs transport, deadline handling, retries, body
  consumption, and status-based decoding. Returns `Promise<SendResult<R>>`.
- `SendResult<R>` — flat discriminated union covering every outcome: `response`, `requestError`,
  `transportError`, `decodeError`, `unhandledStatus`.
- `Send.match(result, handlers)` — exhaustive dispatcher; TypeScript enforces that all
  `SendResult` variants are handled.
- `Matcher<R, T>` type — exported to enable typed reusable handler fragments via
  `Partial<Matcher<R, T>>` spread.
- Retry policy — exponential backoff with jitter. Configurable via `RetryOptions` or the
  shorthand `true` / `false`. Per-request policy replaces the client policy entirely.
- Whole-operation deadline — `deadlineMs` covers all retry attempts, backoff sleep, header
  wait, body reading, and decoding. Surfaces as `transportError.timeout`.
- `BodyPreview` — first N bytes (default 8 192) of a response body, captured and decoded as
  text for `decodeError` and `unhandledStatus` diagnostics.
- Status matchers — exact numeric codes or class strings (`"2xx"`, `"4xx"`, `"5xx"`).
- Two-tier `ResponseMap` merge — client-level defaults layered under request-level overrides.
- Runtime-conditional package exports — `browser` and `node` entrypoints via `package.json`
  `exports` conditions; shared logic is runtime-agnostic.
- Full parity test suite across Node.js, Chromium, Firefox, and WebKit via Vitest +
  Playwright.

[unreleased]: https://github.com/sethlivingston/oneway-http/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/sethlivingston/oneway-http/releases/tag/v0.9.0
