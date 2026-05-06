// src/decode.ts — Decoder<T> class + readBytes() normalization + Decode.* namespace
// Dependency direction: (consumers) → decode.ts → types.ts

import type { DecodeError, DecodeIssue, Schema, TaggedEntry } from "./types.js";

type DecoderFn<T> = (response: Response) => Promise<T | DecodeError>;

export class Decoder<T> {
  /** @internal — Phase 5 accesses this after casting entry.decode */
  readonly fn: DecoderFn<T>;
  constructor(fn: DecoderFn<T>) {
    this.fn = fn;
  }
  as<Tag extends string>(tag: Tag): TaggedEntry<T, Tag> {
    return { tag, decode: this };
  }
}

async function readBytes(
  response: Response,
): Promise<Uint8Array<ArrayBuffer> | { kind: "bodyReadFailed"; message: string }> {
  if (response.body === null) {
    return new Uint8Array(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytesRead += value.length;
    }
  } catch (e) {
    return { kind: "bodyReadFailed", message: e instanceof Error ? e.message : String(e) };
  } finally {
    await reader.cancel().catch(() => {
      // Swallow cancel errors — stream may already be errored/closed
    });
  }
  const all = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// D-10: Never instanceof ZodError — duck-type .issues array across module boundaries
function normalizeSchemaError(error: unknown): DecodeIssue[] {
  if (isRecord(error) && "issues" in error && Array.isArray(error.issues)) {
    return error.issues.map((issue: unknown): DecodeIssue => {
      const path: (string | number)[] = [];
      let message = "unknown issue";
      let code: string | undefined;
      if (isRecord(issue)) {
        if (Array.isArray(issue["path"])) {
          for (const p of issue["path"]) {
            if (typeof p === "string" || typeof p === "number") {
              path.push(p);
            }
          }
        }
        if (typeof issue["message"] === "string") {
          message = issue["message"];
        }
        if (typeof issue["code"] === "string") {
          code = issue["code"];
        }
      }
      return code !== undefined ? { path, message, code } : { path, message };
    });
  }
  return [{ path: [], message: error instanceof Error ? error.message : String(error) }];
}

function jsonDecoder(): Decoder<unknown>;
function jsonDecoder<T>(schema: Schema<T>): Decoder<T>;
function jsonDecoder<T>(schema?: Schema<T>): Decoder<unknown> | Decoder<T> {
  return new Decoder(async (response) => {
    const bytes = await readBytes(response);
    if ("kind" in bytes) return bytes;
    if (bytes.length === 0) return { kind: "emptyBody" } satisfies DecodeError;
    const text = new TextDecoder("utf-8").decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { kind: "invalidJson", message: msg } satisfies DecodeError;
    }
    if (schema !== undefined) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        return {
          kind: "schemaMismatch",
          issues: normalizeSchemaError(result.error),
        } satisfies DecodeError;
      }
      return result.data;
    }
    return parsed;
  });
}

export const Decode = {
  none(): Decoder<void> {
    return new Decoder<void>(async (response) => {
      if (response.body === null) return undefined;
      const reader = response.body.getReader();
      try {
        const { done } = await reader.read();
        if (done) return undefined;
        return { kind: "unexpectedBody" } satisfies DecodeError;
      } catch (e) {
        return { kind: "bodyReadFailed", message: e instanceof Error ? e.message : String(e) };
      } finally {
        await reader.cancel().catch(() => {});
      }
    });
  },

  discard(): Decoder<void> {
    return new Decoder<void>(async (response) => {
      // D-03: cancel directly — no reader, no allocation. ?.null-guard for 204/304/205
      await response.body?.cancel().catch(() => {});
      return undefined;
    });
  },

  text(): Decoder<string> {
    return new Decoder<string>(async (response) => {
      const bytes = await readBytes(response);
      if ("kind" in bytes) return bytes;
      return new TextDecoder("utf-8").decode(bytes);
    });
  },

  json: jsonDecoder,

  bytes(): Decoder<Uint8Array<ArrayBuffer>> {
    return new Decoder<Uint8Array<ArrayBuffer>>(async (response) => {
      const bytes = await readBytes(response);
      if ("kind" in bytes) return bytes;
      return bytes;
    });
  },

  optional<T>(inner: Decoder<T>): Decoder<T | undefined> {
    return new Decoder<T | undefined>(async (response) => {
      const bytes = await readBytes(response);
      if ("kind" in bytes) return bytes;
      if (bytes.length === 0) return undefined;
      const syntheticResponse = new Response(bytes);
      return await inner.fn(syntheticResponse);
    });
  },
} as const;
