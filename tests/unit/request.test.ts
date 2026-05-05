import { describe, it, expect } from "vitest";
import { Request, buildPath, buildQuery } from "../../src/request.js";

describe("REQ-01: Request.create() builds RequestSpec", () => {
  it("stores method and responses", () => {
    const req = Request.create({ method: "GET", responses: {} });
    const spec = req.consume();
    expect(spec.method).toBe("GET");
    expect(spec.responses).toEqual({});
  });

  it("stores optional path, headers when provided", () => {
    const req = Request.create({
      method: "POST",
      path: ["users"],
      headers: { "x-custom": "value" },
      responses: {},
    });
    const spec = req.consume();
    expect(spec.path).toEqual(["users"]);
    expect(spec.headers?.["x-custom"]).toBe("value");
  });
});

describe("REQ-02: buildPath — segment encoding", () => {
  it("encodes each segment independently and joins with /", () => {
    expect(buildPath(["users", "some user"])).toBe("users/some%20user");
  });

  it("encodes slash inside a segment as %2F (not a path separator)", () => {
    expect(buildPath(["a/b", "c&d"])).toBe("a%2Fb/c%26d");
  });

  it("stringifies numbers", () => {
    expect(buildPath([42, "items"])).toBe("42/items");
  });

  it("empty array returns empty string", () => {
    expect(buildPath([])).toBe("");
  });
});

describe("REQ-03: buildQuery — query construction", () => {
  it("omits undefined values", () => {
    const params = buildQuery({ key: undefined });
    expect(params.has("key")).toBe(false);
  });

  it("stringifies string, number, boolean scalar values", () => {
    const params = buildQuery({ a: "hello", b: 42, c: true });
    expect(params.get("a")).toBe("hello");
    expect(params.get("b")).toBe("42");
    expect(params.get("c")).toBe("true");
  });

  it("repeats key for each element in an array value", () => {
    const params = buildQuery({ tags: ["foo", "bar"] as const });
    expect(params.getAll("tags")).toEqual(["foo", "bar"]);
  });

  it("mixed: defined values included, undefined values omitted", () => {
    const params = buildQuery({ a: "x", b: undefined, c: [1, 2] as const });
    expect(params.get("a")).toBe("x");
    expect(params.has("b")).toBe(false);
    expect(params.getAll("c")).toEqual(["1", "2"]);
  });
});

describe("REQ-04: affine enforcement", () => {
  it("first consume() returns the RequestSpec", () => {
    const req = Request.create({ method: "GET", responses: {} });
    expect(() => req.consume()).not.toThrow();
  });

  it("second consume() throws TypeError with exact message (D-07)", () => {
    const req = Request.create({ method: "GET", responses: {} });
    req.consume();
    expect(() => req.consume()).toThrow(TypeError);
    expect(() => {
      const r = Request.create({ method: "GET", responses: {} });
      r.consume();
      r.consume();
    }).toThrow("Request has already been consumed and cannot be sent again");
  });
});
