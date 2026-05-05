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

export type Schema<T> = {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
};

export type DecodeIssue = {
  path: Array<string | number>;
  message: string;
  code?: string;
};

export type DecodeError =
  | { kind: "unexpectedBody" }
  | { kind: "emptyBody" }
  | { kind: "invalidJson"; message: string }
  | { kind: "schemaMismatch"; issues: DecodeIssue[] }
  | { kind: "bodyReadFailed"; message: string }
  | { kind: "custom"; message: string; details?: unknown };

export type BodyPreview = {
  text: string;
  bytesRead: number;
  truncated: boolean;
};

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

export type TaggedEntry<T = unknown, Tag extends string = string> = {
  readonly tag: Tag;
  readonly _phantom?: T; // type-only phantom field; never set at runtime
  readonly _decode: unknown;
};

export type ResponseMap = Partial<Record<StatusMatcher, TaggedEntry>>;

export type InferResponseUnion<M extends ResponseMap> = {
  [K in keyof M]: M[K] extends TaggedEntry<infer T, infer Tag>
    ? { tag: Tag; body: T }
    : never;
}[keyof M];

export type RetryPolicy = {
  readonly methods?: readonly Method[];
  readonly maxAttempts?: number;
  readonly retryableStatuses?: readonly number[];
  readonly backoffMs?: { readonly initial: number; readonly max: number };
};

export type RequestSpec<Responses extends ResponseMap = ResponseMap> = {
  method: Method;
  path?: readonly (string | number)[];
  absoluteUrl?: string | URL;
  query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  responses: Responses;
  retry?: RetryPolicy;
  deadlineMs?: number;
};

export type ClientSpec = {
  baseUrl?: string | URL;
  headers?: Record<string, string | undefined>;
  query?: Record<string, QueryValue | readonly QueryValue[] | undefined>;
  responses?: ResponseMap;
  retry?: RetryPolicy;
  deadlineMs?: number;
  diagnostics?: {
    bodyPreviewBytes?: number;
  };
};
