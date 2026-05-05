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
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, v as string);
      }
    } else {
      params.append(key, value as string);
    }
  }
  return params;
}

export const Body = {
  none(): BodyOpaque {
    return toBody({ kind: "none" });
  },
  json(value: unknown): BodyOpaque {
    return toBody({ kind: "json", value });
  },
  text(value: string, contentType?: string): BodyOpaque {
    return contentType !== undefined
      ? toBody({ kind: "text", value, contentType })
      : toBody({ kind: "text", value });
  },
  formUrlEncoded(entries: Record<string, string | readonly string[]>): BodyOpaque {
    return toBody({ kind: "formUrlEncoded", entries });
  },
  bytes(bytes: Uint8Array<ArrayBuffer>, contentType?: string): BodyOpaque {
    return contentType !== undefined
      ? toBody({ kind: "bytes", bytes, contentType })
      : toBody({ kind: "bytes", bytes });
  },
} as const;

// exactOptionalPropertyTypes compliant — never returns { prop: undefined }
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
