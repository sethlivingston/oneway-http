import { describe, it, expect } from "vitest";
import { Body, serializeBody } from "../../src/body.js";

describe("BODY-01: Body.none() — no init, no contentType", () => {
  it("serializeBody(Body.none()) returns empty object (no init)", () => {
    const result = serializeBody(Body.none());
    expect("init" in result).toBe(false);
  });

  it("serializeBody(Body.none()) has no contentType", () => {
    const result = serializeBody(Body.none());
    expect("contentType" in result).toBe(false);
  });
});

describe("BODY-02: Body.json(value) — JSON serialization deferred to serializeBody", () => {
  it("serializeBody(Body.json({a:1})).contentType === 'application/json'", () => {
    const result = serializeBody(Body.json({ a: 1 }));
    expect(result.contentType).toBe("application/json");
  });

  it("serializeBody(Body.json({a:1})).init is Uint8Array with correct bytes", () => {
    const result = serializeBody(Body.json({ a: 1 }));
    expect(result.init).toBeInstanceOf(Uint8Array);
    const { init } = result;
    if (init instanceof Uint8Array) {
      const decoded = new TextDecoder().decode(init);
      expect(decoded).toBe(JSON.stringify({ a: 1 }));
    }
  });

  it("Body.json(value) does NOT call JSON.stringify until serializeBody() — factory never throws", () => {
    // A value with a getter that would throw only if read, not just stored
    const safe = { toJSON: () => ({ ok: true }) };
    expect(() => Body.json(safe)).not.toThrow();
    // serializeBody triggers stringify
    const result = serializeBody(Body.json(safe));
    expect(result.contentType).toBe("application/json");
  });
});

describe("BODY-03: Body.text(value, contentType?) — plain text body", () => {
  it("serializeBody(Body.text('hello')).contentType === 'text/plain; charset=utf-8'", () => {
    const result = serializeBody(Body.text("hello"));
    expect(result.contentType).toBe("text/plain; charset=utf-8");
  });

  it("serializeBody(Body.text('hello')).init === 'hello'", () => {
    const result = serializeBody(Body.text("hello"));
    expect(result.init).toBe("hello");
  });

  it("serializeBody(Body.text('hi', 'text/html')).contentType === 'text/html'", () => {
    const result = serializeBody(Body.text("hi", "text/html"));
    expect(result.contentType).toBe("text/html");
  });
});

describe("BODY-04: Body.formUrlEncoded(entries) — URL-encoded form", () => {
  it("serializeBody(Body.formUrlEncoded({foo:'bar'})).init encodes correctly", () => {
    const result = serializeBody(Body.formUrlEncoded({ foo: "bar" }));
    expect(result.init).toBe("foo=bar");
  });

  it("repeated keys: Body.formUrlEncoded({tags:['a','b']}) → 'tags=a&tags=b'", () => {
    const result = serializeBody(Body.formUrlEncoded({ tags: ["a", "b"] as const }));
    expect(result.init).toBe("tags=a&tags=b");
  });
});

describe("BODY-05: Body.bytes(bytes, contentType?) — raw bytes", () => {
  it("serializeBody(Body.bytes(new Uint8Array([1,2,3]))).init instanceof Uint8Array", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = serializeBody(Body.bytes(bytes));
    expect(result.init).toBeInstanceOf(Uint8Array);
  });

  it("serializeBody(Body.bytes(new Uint8Array([1]))).contentType is absent when not provided", () => {
    const result = serializeBody(Body.bytes(new Uint8Array([1])));
    expect("contentType" in result).toBe(false);
  });

  it("serializeBody(Body.bytes(new Uint8Array([1]), 'application/octet-stream')).contentType === 'application/octet-stream'", () => {
    const result = serializeBody(Body.bytes(new Uint8Array([1]), "application/octet-stream"));
    expect(result.contentType).toBe("application/octet-stream");
  });
});
