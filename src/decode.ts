// src/decode.ts — Decoder<T> class + readBytes() normalization + Decode.* namespace
// Dependency direction: (consumers) → decode.ts → types.ts

import type { DecodeError, DecodeIssue, Schema, TaggedEntry } from "./types.js";

type DecoderFn<T> = (response: Response) => Promise<T | DecodeError>;

/** Response body decoder. Create with `Decode.*` factory methods or `new Decoder(fn)`. */
export class Decoder<T> {
  /** @internal — Phase 5 accesses this after casting entry.decode */
  readonly fn: DecoderFn<T>;
  constructor(fn: DecoderFn<T>) {
    this.fn = fn;
  }

  /**
   * Pairs this decoder with a tag string, producing a `TaggedEntry` for use in a `ResponseMap`.
   * @param tag - The unique tag string for this response variant.
   * @returns A `TaggedEntry<T, Tag>` pairing this decoder with the tag.
   */
  as<Tag extends string>(tag: Tag): TaggedEntry<T, Tag> {
    return { tag, decode: this };
  }
}

/**
 * @internal
 * Reads a `Response` body to completion and returns raw bytes. Returns a `bodyReadFailed` error on stream failure.
 * @param response - The `Response` whose body stream to read.
 * @returns The full body as `Uint8Array`, or `{ kind: "bodyReadFailed"; message: string }` on error.
 */
export async function readBytes(
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

/** Namespace of response body decoder factories. */
export const Decode = {
  /**
   * Decoder that asserts no body is present. Returns `{ kind: "unexpectedBody" }` if bytes are found.
   * @returns A `Decoder<void>`.
   */
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

  /**
   * Decoder that cancels the body stream without reading it. Use for responses whose body is irrelevant.
   * @returns A `Decoder<void>`.
   */
  discard(): Decoder<void> {
    return new Decoder<void>(async (response) => {
      // D-03: cancel directly — no reader, no allocation. ?.null-guard for 204/304/205
      await response.body?.cancel().catch(() => {});
      return undefined;
    });
  },

  /**
   * Decoder that reads the body as a UTF-8 string.
   * @returns A `Decoder<string>`.
   */
  text(): Decoder<string> {
    return new Decoder<string>(async (response) => {
      const bytes = await readBytes(response);
      if ("kind" in bytes) return bytes;
      return new TextDecoder("utf-8").decode(bytes);
    });
  },

  /**
   * Decoder that parses the body as JSON. Optionally validates against a `Schema<T>`.
   * Without a schema, returns `Decoder<unknown>`. With a schema, returns `Decoder<T>`.
   * @param schema - Optional Zod-compatible schema for validation and type inference.
   * @returns A `Decoder<T>` or `Decoder<unknown>`.
   */
  json: jsonDecoder,

  /**
   * Decoder that reads the body as raw bytes.
   * @returns A `Decoder<Uint8Array<ArrayBuffer>>`.
   */
  bytes(): Decoder<Uint8Array<ArrayBuffer>> {
    return new Decoder<Uint8Array<ArrayBuffer>>(async (response) => {
      const bytes = await readBytes(response);
      if ("kind" in bytes) return bytes;
      return bytes;
    });
  },

  /**
   * Wraps an inner decoder to treat an empty body as `undefined` rather than an error.
   * @param inner - The decoder to apply when the body is non-empty.
   * @returns A `Decoder<T | undefined>`.
   */
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
