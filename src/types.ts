// src/types.ts — shared type definitions; zero imports, zero logic

export type Method =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT"
  | "QUERY"; // IESG-approved, pending RFC publication

export type QueryValue = string | number | boolean;

export type StatusMatcher = number | "2xx" | "4xx" | "5xx";

export interface Schema<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

export declare class Body {
  private constructor();
  private readonly _kind: string;
}

export interface DecodeIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code?: string;
}

export type DecodeError =
  | { kind: "unexpectedBody" }
  | { kind: "emptyBody" }
  | { kind: "invalidJson"; message: string }
  | { kind: "schemaMismatch"; issues: DecodeIssue[] }
  | { kind: "bodyReadFailed"; message: string }
  | { kind: "custom"; message: string; details?: unknown };

export interface BodyPreview {
  readonly text: string;
  readonly bytesRead: number;
  readonly truncated: boolean;
}

export type TransportError =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | { kind: "network"; cause?: unknown };

export type RequestError =
  | { kind: "bodySerializationFailed"; message: string }
  | { kind: "requestConsumed" }
  | { kind: "missingBaseUrl" }
  | { kind: "duplicateResponseTag"; tag: string }
  | { kind: "invalidSpec"; message: string };

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

export interface DecoderLike {
  /** May return a decoded value or a {@link DecodeError}. */
  fn(response: Response): Promise<unknown>;
}

export interface TaggedEntry<T = unknown, Tag extends string = string> {
  readonly tag: Tag;
  readonly phantom?: T; // type-only phantom field; never set at runtime
  readonly decode: DecoderLike;
}

export type ResponseMap = Partial<Record<StatusMatcher, TaggedEntry>>;

export type InferResponseUnion<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag; body: T }
    : never;
}[keyof M];

export interface RetryPolicy {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly backoffMs?: { readonly initial: number; readonly max: number };
}

export interface RequestSpecBase<Responses extends ResponseMap = ResponseMap> {
  readonly method: Method;
  readonly query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: Body;
  readonly responses: Responses;
  readonly retry?: RetryPolicy;
  readonly deadlineMs?: number;
}

export type RequestSpec<Responses extends ResponseMap = ResponseMap> =
  | (RequestSpecBase<Responses> & {
      readonly path: readonly (string | number)[];
      readonly absoluteUrl?: never;
    })
  | (RequestSpecBase<Responses> & {
      readonly path?: never;
      readonly absoluteUrl: string | URL;
    });

export interface SendOptions { signal?: AbortSignal; }

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
