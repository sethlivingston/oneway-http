// src/types.ts — shared type definitions; zero imports, zero logic

/** HTTP method string. Includes `"QUERY"` (IESG-approved, pending RFC). */
export type Method =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT"
  | "QUERY"; // IESG-approved, pending RFC publication

/** Scalar value accepted as a URL query parameter. */
export type QueryValue = string | number | boolean;

/** Matches an HTTP status by exact code or by class (`"2xx"`, `"4xx"`, `"5xx"`). */
export type StatusMatcher = number | "2xx" | "4xx" | "5xx";

/** Duck-type interface for Zod-compatible schema validators. */
export interface Schema<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

/** Opaque body token produced by `Body.*` factory methods. */
export declare class Body {
  private constructor();
  private readonly _kind: string;
}

/** A single structured issue from a schema validation failure. */
export interface DecodeIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code?: string;
}

/** Structured error describing why a response body could not be decoded. */
export type DecodeError =
  | { kind: "unexpectedBody" }
  | { kind: "emptyBody" }
  | { kind: "invalidJson"; message: string }
  | { kind: "schemaMismatch"; issues: DecodeIssue[] }
  | { kind: "bodyReadFailed"; message: string }
  | { kind: "custom"; message: string; details?: unknown };

/** First N bytes of a response body captured for diagnostic display. */
export interface BodyPreview {
  readonly text: string;
  readonly bytesRead: number;
  readonly truncated: boolean;
}

/** Structured error classifying a transport-layer failure. */
export type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };

/** Structured error classifying a request configuration problem. */
export type RequestError =
  | { kind: "bodySerializationFailed"; message: string }
  | { kind: "requestConsumed" }
  | { kind: "missingBaseUrl" }
  | { kind: "duplicateResponseTag"; tag: string }
  | { kind: "invalidSpec"; message: string }
  | { kind: "reservedResponseTag"; tag: string };

/** Discriminated union representing every possible outcome of `client.send()`. */
export type SendResult<R> =
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
    }
  | { kind: "requestError"; error: RequestError };

/** Minimal interface for a response decoder accepted by `TaggedEntry`. */
export interface DecoderLike {
  /** May return a decoded value or a {@link DecodeError}. */
  fn(response: Response): Promise<unknown>;
}

/** Pairs a decoder with a tag string for use in a `ResponseMap`. */
export interface TaggedEntry<T = unknown, Tag extends string = string> {
  readonly tag: Tag;
  readonly phantom?: T; // type-only phantom field; never set at runtime
  readonly decode: DecoderLike;
}

/** Maps status matchers to tagged decoder entries. */
export type ResponseMap = Partial<Record<StatusMatcher, TaggedEntry>>;

/** Extracts the response union type from a `ResponseMap`. */
export type InferResponseUnion<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag; body: T }
    : never;
}[keyof M];

/** Per-request retry tuning options. */
export interface RetryOptions {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
}

/** Retry policy: `true` for defaults, `false` to disable, or `RetryOptions` for custom config. */
export type RetryPolicy = true | false | RetryOptions;

/** Shared request fields used by both `RequestSpec` variants. */
export interface RequestSpecBase<Responses extends ResponseMap = ResponseMap> {
  readonly method: Method;
  readonly query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: Body;
  readonly responses: Responses;
  readonly retry?: RetryPolicy;
  readonly deadlineMs?: number;
}

/** Request specification: either a `path` (resolved against `baseUrl`) or an `absoluteUrl`. */
export type RequestSpec<Responses extends ResponseMap = ResponseMap> =
  | (RequestSpecBase<Responses> & {
      readonly path: readonly (string | number)[];
      readonly absoluteUrl?: never;
    })
  | (RequestSpecBase<Responses> & {
      readonly path?: never;
      readonly absoluteUrl: string | URL;
    });

/** Per-call options passed to `client.send()`. */
export interface SendOptions { signal?: AbortSignal; }

/** Configuration for `createClient()`. */
export interface ClientSpec {
  readonly baseUrl?: string | URL;
  readonly headers?: Record<string, string | undefined>;
  readonly query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  readonly responses?: ResponseMap;
  readonly retry?: RetryPolicy;
  readonly deadlineMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly diagnostics?: {
    readonly bodyPreviewBytes?: number;
  };
}
