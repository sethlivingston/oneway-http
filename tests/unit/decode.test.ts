import { describe, it } from "vitest";
// import type only — decode.ts does not exist yet (Wave 0 stubs; RED until Plan 02)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Decode, Decoder } from "../../src/decode.js";

describe("DEC-01: Decode.none() — rejects non-empty body", () => {
  it.todo("Decode.none() returns { kind: 'unexpectedBody' } for a response with a body");
  it.todo("Decode.none() passes (returns void) for a 204 null-body response");
  it.todo("Decode.none() passes (returns void) for an empty stream (200 + Content-Length: 0)");
});

describe("DEC-02: Decode.discard() — cancels stream without reading", () => {
  it.todo("Decode.discard() calls response.body?.cancel() without reading any bytes");
  it.todo("Decode.discard() works on null body (204) without throwing");
});

describe("DEC-03: Decode.text() — UTF-8 text decoding", () => {
  it.todo("Decode.text() returns empty string for empty body");
  it.todo("Decode.text() returns decoded string for non-empty body");
});

describe("DEC-04: Decode.json() — JSON parsing", () => {
  it.todo("Decode.json() returns { kind: 'emptyBody' } for empty body");
  it.todo("Decode.json() returns parsed unknown for valid JSON");
  it.todo("Decode.json() returns { kind: 'invalidJson', message } for malformed JSON");
});

describe("DEC-05: Decode.json(schema) — schema-validated JSON", () => {
  it.todo("Decode.json(schema) returns { kind: 'schemaMismatch', issues } on schema validation failure");
  it.todo("Decode.json(schema) returns typed T value on successful schema validation");
});

describe("DEC-06: Decode.bytes() — raw bytes", () => {
  it.todo("Decode.bytes() returns Uint8Array(0) for empty body");
  it.todo("Decode.bytes() returns full bytes for non-empty body");
});

describe("DEC-07: Decode.optional(inner) — optional body decoder", () => {
  it.todo("Decode.optional(inner) returns undefined for zero-byte body");
  it.todo("Decode.optional(inner) delegates to inner decoder for non-empty body");
});

describe("DEC-08: readBytes() null-body normalization", () => {
  it.todo("readBytes() normalizes null body (body === null) to Uint8Array(0)");
  it.todo("readBytes() normalizes empty stream to Uint8Array(0)");
  it.todo("Every getReader() call is guarded by finally { reader.cancel() }");
});
