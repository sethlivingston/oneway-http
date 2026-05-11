import type { ClientSpec, QueryValue, SendOptions, SendResult } from "./types.js";
import type { Request } from "./request.js";
import { performSend } from "./send.js";

/**
 * @internal
 * Merges two header records. Keys are normalized to lowercase. `override` wins on collision. `undefined` values are omitted.
 * @param base - Client-level headers.
 * @param override - Request-level headers that take precedence.
 * @returns Merged header record with all keys lowercased.
 */
export function mergeHeaders(
  base: Record<string, string | undefined> | undefined,
  override: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value;
  }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value;
  }
  return result;
}

/**
 * @internal
 * Merges two query parameter records. `override` wins on collision. `undefined` values are omitted.
 * @param base - Client-level query params.
 * @param override - Request-level query params that take precedence.
 * @returns Merged query record with no `undefined` values.
 */
export function mergeQuery(
  base: Record<string, QueryValue | readonly QueryValue[] | undefined> | undefined,
  override: Record<string, QueryValue | readonly QueryValue[] | undefined> | undefined,
): Record<string, QueryValue | readonly QueryValue[]> {
  const result: Record<string, QueryValue | readonly QueryValue[]> = {};
  for (const [key, value] of Object.entries(base ?? {})) {
    if (value !== undefined) result[key] = value;
  }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** HTTP client instance returned by `createClient()`. */
export interface Client {
  /**
   * Sends an HTTP request and returns a structured `SendResult`.
   * @param request - A `Request<R>` instance created with `Request.create()`.
   * @param options - Optional per-call options including an `AbortSignal`.
   * @returns A `Promise<SendResult<R>>` that resolves to a typed discriminated union for all
   *   transport, decode, and status outcomes. Programmer errors (e.g., invalid spec values,
   *   re-using a consumed `Request`) may still throw.
   */
  send<R>(request: Request<R>, options?: SendOptions): Promise<SendResult<R>>;
}

/**
 * Creates a reusable HTTP client bound to the given `ClientSpec`.
 * @param spec - Client configuration including `baseUrl`, default headers, retry policy, and deadline.
 * @returns A `Client` instance with a `send()` method.
 */
export function createClient(spec: ClientSpec): Client {
  return {
    send: (req, opts) => performSend(req, spec, opts),
  };
}
