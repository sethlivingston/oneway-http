import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  SendResult,
  TransportError,
  DecodeError,
  DecodeIssue,
  BodyPreview,
  ResponseMap,
  Schema,
  RequestError,
} from "../../src/types.js";

describe("TYPES-01: types.ts has zero imports", () => {
  it("src/types.ts contains no import statements", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(dir, "../../src/types.ts"), "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line));
    expect(importLines).toHaveLength(0);
  });
});

describe("TYPES-02: SendResult<R> discriminated union — five variants", () => {
  it("response variant is assignable", () => {
    const r: SendResult<{ tag: "ok"; body: string }> = {
      kind: "response",
      response: { tag: "ok", body: "hello" },
    };
    expect(r.kind).toBe("response");
  });

  it("transportError variant is assignable", () => {
    const r: SendResult<never> = {
      kind: "transportError",
      error: { kind: "aborted" },
    };
    expect(r.kind).toBe("transportError");
  });

  it("decodeError variant is assignable", () => {
    const r: SendResult<never> = {
      kind: "decodeError",
      status: 422,
      headers: new Headers(),
      error: { kind: "emptyBody" },
      preview: { text: "", bytesRead: 0, truncated: false },
    };
    expect(r.kind).toBe("decodeError");
  });

  it("unhandledStatus variant is assignable", () => {
    const r: SendResult<never> = {
      kind: "unhandledStatus",
      status: 418,
      headers: new Headers(),
      preview: { text: "", bytesRead: 0, truncated: false },
    };
    expect(r.kind).toBe("unhandledStatus");
  });

  it("requestError variant is assignable", () => {
    const r: SendResult<never> = {
      kind: "requestError",
      error: { kind: "bodySerializationFailed", message: "JSON.stringify failed" },
    };
    expect(r.kind).toBe("requestError");
  });
});

describe("TYPES-03: TransportError union — three variants", () => {
  it("all three variants are assignable", () => {
    const a: TransportError = { kind: "aborted" };
    const t: TransportError = { kind: "timeout" };
    const n: TransportError = { kind: "network", cause: new Error("fail") };
    expect(a.kind).toBe("aborted");
    expect(t.kind).toBe("timeout");
    expect(n.kind).toBe("network");
  });
});

describe("TYPES-04: DecodeError union — six variants", () => {
  it("all six variants are assignable", () => {
    const variants: DecodeError[] = [
      { kind: "unexpectedBody" },
      { kind: "emptyBody" },
      { kind: "invalidJson", message: "bad json" },
      { kind: "schemaMismatch", issues: [{ path: ["field"], message: "required" }] },
      { kind: "bodyReadFailed", message: "stream error" },
      { kind: "custom", message: "custom error" },
    ];
    expect(variants).toHaveLength(6);
  });
});

describe("TYPES-05: DecodeIssue shape", () => {
  it("requires path and message; code is optional", () => {
    const issue: DecodeIssue = { path: ["a", 0], message: "required" };
    const withCode: DecodeIssue = { path: [], message: "bad", code: "ERR_REQUIRED" };
    expect(issue.path).toHaveLength(2);
    expect(withCode.code).toBe("ERR_REQUIRED");
  });
});

describe("TYPES-06: BodyPreview shape", () => {
  it("has text, bytesRead, truncated fields", () => {
    const preview: BodyPreview = { text: "abc", bytesRead: 3, truncated: false };
    expect(preview.text).toBe("abc");
    expect(preview.bytesRead).toBe(3);
    expect(preview.truncated).toBe(false);
  });
});

describe("TYPES-07: ResponseMap — maps StatusMatcher to TaggedEntry", () => {
  it("accepts numeric and class matchers as keys", () => {
    const map: ResponseMap = {
       
      200: { tag: "ok", decode: null },
       
      "4xx": { tag: "clientError", decode: null },
    };
    expect(Object.keys(map)).toContain("200");
    expect(Object.keys(map)).toContain("4xx");
  });
});

describe("TYPES-08: Schema<T> duck-type interface", () => {
  it("satisfied by a plain object with safeParse returning the correct shape", () => {
    const mockSchema: Schema<string> = {
      safeParse: (v) =>
        typeof v === "string"
          ? { success: true, data: v }
          : { success: false, error: "not a string" },
    };
    const r1 = mockSchema.safeParse("hello");
    const r2 = mockSchema.safeParse(42);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(false);
  });
});

describe("TYPES-09: RequestError union — five variants", () => {
  it("all five variants are assignable", () => {
    const variants: RequestError[] = [
      { kind: "bodySerializationFailed", message: "circular ref" },
      { kind: "requestConsumed" },
      { kind: "missingBaseUrl" },
      { kind: "duplicateResponseTag", tag: "ok" },
      { kind: "invalidSpec", message: "bad spec" },
    ];
    expect(variants).toHaveLength(5);
  });
});
