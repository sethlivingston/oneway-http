// src/types.ts — shared type definitions; zero imports, zero logic

export type Method =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS";

export type QueryValue = string | number | boolean;

export type StatusMatcher = number | "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

export interface Schema<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
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
    };

export interface TaggedEntry<T = unknown, Tag extends string = string> {
  readonly tag: Tag;
  readonly phantom?: T; // type-only phantom field; never set at runtime
  readonly decode: unknown;
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

export interface RequestSpec<Responses extends ResponseMap = ResponseMap> {
  readonly method: Method;
  readonly path?: readonly (string | number)[];
  readonly absoluteUrl?: string | URL;
  readonly query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: unknown;
  readonly responses: Responses;
  readonly retry?: RetryPolicy;
  readonly deadlineMs?: number;
}

export interface ClientSpec {
  readonly baseUrl?: string | URL;
  readonly headers?: Record<string, string | undefined>;
  readonly query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  readonly responses?: ResponseMap;
  readonly retry?: RetryPolicy;
  readonly deadlineMs?: number;
  readonly diagnostics?: {
    readonly bodyPreviewBytes?: number;
  };
}
