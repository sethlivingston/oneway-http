// src/body.ts — Body producer namespace + serializeBody() internal
// Dependency direction: send.ts → body.ts → types.ts
// serializeBody() is NOT re-exported from index.ts — internal to the package (D-06)

import type { Body as BodyOpaque } from "./types.js";

type BodyInternal =
  | { kind: "none" }
  | { kind: "json"; value: unknown }
  | { kind: "text"; value: string; contentType?: string }
  | { kind: "formUrlEncoded"; entries: Record<string, string | readonly string[]> }
  | { kind: "bytes"; bytes: Uint8Array<ArrayBuffer>; contentType?: string };

function toBody(internal: BodyInternal): BodyOpaque {
  return internal as unknown as BodyOpaque;
}

function fromBody(body: BodyOpaque): BodyInternal {
  return body as unknown as BodyInternal;
}

// Builds URLSearchParams from entries, handling repeated keys per D-08
function buildUrlSearchParams(
  entries: Record<string, string | readonly string[]>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === "string") {
      params.append(key, value);
    } else {
      for (const v of value) {
        params.append(key, v);
      }
    }
  }
  return params;
}

/** Opaque body token produced by `Body.*` factory methods. */
export const Body = {
  /**
   * Creates a body with no content. Sends with no `Content-Type` header.
   * @returns An opaque `Body` token.
   */
  none(): BodyOpaque {
    return toBody({ kind: "none" });
  },

  /**
   * Serializes `value` as JSON. Uses `JSON.stringify` at send time; throws if value is not serializable.
   * @param value - Any JSON-serializable value.
   * @returns An opaque `Body` token.
   */
  json(value: unknown): BodyOpaque {
    return toBody({ kind: "json", value });
  },

  /**
   * Sends a plain text body with `Content-Type: text/plain; charset=utf-8` unless overridden.
   * @param value - The text string to send.
   * @param contentType - Optional `Content-Type` override.
   * @returns An opaque `Body` token.
   */
  text(value: string, contentType?: string): BodyOpaque {
    return contentType !== undefined
      ? toBody({ kind: "text", value, contentType })
      : toBody({ kind: "text", value });
  },

  /**
   * Serializes `entries` as `application/x-www-form-urlencoded`. Repeated keys produce repeated params.
   * @param entries - Key-value pairs. Array values repeat the key.
   * @returns An opaque `Body` token.
   */
  formUrlEncoded(entries: Record<string, string | readonly string[]>): BodyOpaque {
    return toBody({ kind: "formUrlEncoded", entries });
  },

  /**
   * Sends raw bytes. `Content-Type` defaults to none unless `contentType` is provided.
   * @param bytes - The raw bytes to send.
   * @param contentType - Optional `Content-Type` header value.
   * @returns An opaque `Body` token.
   */
  bytes(bytes: Uint8Array<ArrayBuffer>, contentType?: string): BodyOpaque {
    return contentType !== undefined
      ? toBody({ kind: "bytes", bytes, contentType })
      : toBody({ kind: "bytes", bytes });
  },
} as const;

/**
 * @internal
 * Serializes an opaque `Body` token into `BodyInit` and `Content-Type` for use in `fetch()`.
 * @param body - An opaque `Body` token from `Body.*`.
 * @returns An object with optional `init` (for `RequestInit.body`) and `contentType`.
 */
export function serializeBody(body: BodyOpaque): { init?: BodyInit; contentType?: string } {
  const internal = fromBody(body);
  switch (internal.kind) {
    case "none":
      return {};
    case "json": {
      // JSON.stringify may throw (circular ref, BigInt, throwing .toJSON())
      // Caller (send.ts) catches and returns { kind: "requestError" } (D-07)
      const json = JSON.stringify(internal.value);
      return { init: new TextEncoder().encode(json), contentType: "application/json" };
    }
    case "text":
      return internal.contentType !== undefined
        ? { init: internal.value, contentType: internal.contentType }
        : { init: internal.value, contentType: "text/plain; charset=utf-8" };
    case "formUrlEncoded":
      return {
        init: buildUrlSearchParams(internal.entries).toString(),
        contentType: "application/x-www-form-urlencoded",
      };
    case "bytes":
      return internal.contentType !== undefined
        ? { init: internal.bytes, contentType: internal.contentType }
        : { init: internal.bytes };
  }
}
