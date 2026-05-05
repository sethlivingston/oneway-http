import type { ClientSpec, QueryValue, SendOptions, SendResult } from "./types.js";
import type { Request } from "./request.js";
import { performSend } from "./send.js";

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

export interface Client {
  send<R>(request: Request<R>, options?: SendOptions): Promise<SendResult<R>>;
}

export function createClient(spec: ClientSpec): Client {
  return {
    send: (req, opts) => performSend(req, spec, opts),
  };
}
