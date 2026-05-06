import { describe, it, expect } from "vitest";
import { Decode } from "../../src/decode.js";
import type { DecodeError } from "../../src/types.js";

describe("DEC-01: Decode.none() — rejects non-empty body", () => {
  it("returns { kind: 'unexpectedBody' } for a response with a body", async () => {
    const response = new Response("hello");
    const result = await Decode.none().fn(response);
    expect(result).toEqual({ kind: "unexpectedBody" } satisfies DecodeError);
  });

  it("passes (returns void) for a 204 null-body response", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.none().fn(response);
    expect(result).toBeUndefined();
  });

  it("passes (returns void) for an empty stream (200 + Content-Length: 0)", async () => {
    const response = new Response("", { status: 200 });
    const result = await Decode.none().fn(response);
    expect(result).toBeUndefined();
  });
});

describe("DEC-02: Decode.discard() — cancels stream without reading", () => {
  it("works on null body (204) without throwing", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.discard().fn(response);
    expect(result).toBeUndefined();
  });

  it("resolves to void for non-empty body without error", async () => {
    const response = new Response("some big body");
    const result = await Decode.discard().fn(response);
    expect(result).toBeUndefined();
  });
});

describe("DEC-03: Decode.text() — UTF-8 text decoding", () => {
  it("returns empty string for empty body", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.text().fn(response);
    expect(result).toBe("");
  });

  it("returns decoded string for non-empty body", async () => {
    const response = new Response("hello");
    const result = await Decode.text().fn(response);
    expect(result).toBe("hello");
  });
});

describe("DEC-04: Decode.json() — JSON parsing", () => {
  it("returns { kind: 'emptyBody' } for null body", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.json().fn(response);
    expect(result).toEqual({ kind: "emptyBody" } satisfies DecodeError);
  });

  it("returns { kind: 'emptyBody' } for empty stream", async () => {
    const response = new Response("", { status: 200 });
    const result = await Decode.json().fn(response);
    expect(result).toEqual({ kind: "emptyBody" } satisfies DecodeError);
  });

  it("returns parsed unknown for valid JSON object", async () => {
    const response = new Response('{"a":1}');
    const result = await Decode.json().fn(response);
    expect(result).toEqual({ a: 1 });
  });

  it("returns parsed string for valid JSON string literal", async () => {
    const response = new Response('"hello"');
    const result = await Decode.json().fn(response);
    expect(result).toBe("hello");
  });

  it("returns { kind: 'invalidJson', message } for malformed JSON", async () => {
    const response = new Response("not json");
    const result = await Decode.json().fn(response);
    expect(result).toMatchObject({ kind: "invalidJson" });
    expect(result).toHaveProperty("message");
  });
});

describe("DEC-05: Decode.json(schema) — schema-validated JSON", () => {
  const nameSchema = {
    safeParse(
      v: unknown,
    ): { success: true; data: { name: string } } | { success: false; error: unknown } {
      if (typeof v === "object" && v !== null && "name" in v) {
        if (typeof v.name === "string") {
          return { success: true, data: { name: v.name } };
        }
      }
      return {
        success: false,
        error: {
          issues: [{ path: ["name"], message: "expected string", code: "invalid_type" }],
        },
      };
    },
  };

  it("returns typed T value on successful schema validation", async () => {
    const response = new Response('{"name":"Alice"}');
    const result = await Decode.json(nameSchema).fn(response);
    expect(result).toEqual({ name: "Alice" });
  });

  it("returns { kind: 'schemaMismatch', issues } on schema validation failure", async () => {
    const response = new Response('{"name":42}');
    const result = await Decode.json(nameSchema).fn(response);
    expect(result).toMatchObject({ kind: "schemaMismatch" });
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("issues.0");
  });

  it("Zod-shaped error (.issues) → issues mapped to DecodeIssue[]", async () => {
    const response = new Response('{"name":42}');
    const result = await Decode.json(nameSchema).fn(response);
    expect(result).toMatchObject({
      kind: "schemaMismatch",
      issues: [{ path: ["name"], message: "expected string" }],
    });
  });

  it("schema failure without .issues → single-item DecodeIssue[] from error.message", async () => {
    const plainErrorSchema = {
      safeParse(
        _v: unknown,
      ): { success: true; data: string } | { success: false; error: unknown } {
        return { success: false, error: new Error("plain error") };
      },
    };
    const response = new Response('"hello"');
    const result = await Decode.json(plainErrorSchema).fn(response);
    expect(result).toMatchObject({
      kind: "schemaMismatch",
      issues: [{ message: "plain error" }],
    });
  });
});

describe("DEC-06: Decode.bytes() — raw bytes", () => {
  it("returns Uint8Array(0) for empty body", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.bytes().fn(response);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toHaveProperty("length", 0);
  });

  it("returns full bytes for non-empty body", async () => {
    const response = new Response("abc");
    const result = await Decode.bytes().fn(response);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toHaveProperty("length", 3);
  });
});

describe("DEC-07: Decode.optional(inner) — optional body decoder", () => {
  it("returns undefined for null body", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.optional(Decode.text()).fn(response);
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty stream", async () => {
    const response = new Response("", { status: 200 });
    const result = await Decode.optional(Decode.text()).fn(response);
    expect(result).toBeUndefined();
  });

  it("delegates to inner decoder for non-empty body", async () => {
    const response = new Response("hello");
    const result = await Decode.optional(Decode.text()).fn(response);
    expect(result).toBe("hello");
  });
});

describe("DEC-08: readBytes() null-body normalization", () => {
  it("normalizes null body (body === null) to Uint8Array(0) — via Decode.bytes()", async () => {
    const response = new Response(null, { status: 204 });
    const result = await Decode.bytes().fn(response);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toHaveProperty("length", 0);
  });

  it("normalizes empty stream to Uint8Array(0) — via Decode.bytes()", async () => {
    const response = new Response("", { status: 200 });
    const result = await Decode.bytes().fn(response);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toHaveProperty("length", 0);
  });

  it.todo("Every getReader() call is guarded by finally { reader.cancel() }");
});
