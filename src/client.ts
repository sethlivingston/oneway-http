import type { ClientSpec, QueryValue } from "./types.js";

export function mergeHeaders(
  base: Readonly<Record<string, string | undefined>> | undefined,
  override: Readonly<Record<string, string | undefined>> | undefined,
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
  base: Readonly<Record<string, QueryValue | readonly QueryValue[] | undefined>> | undefined,
  override: Readonly<Record<string, QueryValue | readonly QueryValue[] | undefined>> | undefined,
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

export function createClient(spec: ClientSpec): ClientSpec {
  return { ...spec };
}
