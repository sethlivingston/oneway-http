import { describe, it, expect } from "vitest";
import { createClient, mergeHeaders, mergeQuery } from "../../src/client.js";

describe("createClient()", () => {
  it("returns baseUrl and deadlineMs from spec", () => {
    const client = createClient({ baseUrl: "https://example.com", deadlineMs: 5000 });
    expect(client.baseUrl).toBe("https://example.com");
    expect(client.deadlineMs).toBe(5000);
  });

  it("preserves headers in the returned spec", () => {
    const client = createClient({
      headers: { authorization: "Bearer token" },
    });
    expect(client.headers?.["authorization"]).toBe("Bearer token");
  });

  it("preserves query in the returned spec (D-06)", () => {
    const client = createClient({ query: { version: "2" } });
    expect(client.query?.["version"]).toBe("2");
  });
});

describe("mergeHeaders()", () => {
  it("override value wins on conflict", () => {
    const merged = mergeHeaders(
       
      { "content-type": "text/plain" },
       
      { "content-type": "application/json" },
    );
    expect(merged["content-type"]).toBe("application/json");
  });

  it("undefined override value does NOT erase base value (D-09)", () => {
    const merged = mergeHeaders(
       
      { "content-type": "application/json" },
       
      { "content-type": undefined },
    );
    expect(merged["content-type"]).toBe("application/json");
  });

  it("normalizes keys to lowercase (D-10)", () => {
     
    const merged = mergeHeaders({ "Content-Type": "application/json" }, {});
    expect(merged["content-type"]).toBe("application/json");
    expect(merged["Content-Type"]).toBeUndefined();
  });

  it("base and override are both optional", () => {
    expect(mergeHeaders(undefined, undefined)).toEqual({});
    expect(mergeHeaders({ a: "1" }, undefined)).toEqual({ a: "1" });
    expect(mergeHeaders(undefined, { b: "2" })).toEqual({ b: "2" });
  });

  it("case-insensitive dedup: Content-Type and content-type are the same key", () => {
    const merged = mergeHeaders(
       
      { "Content-Type": "text/plain" },
       
      { "content-type": "application/json" },
    );
    expect(Object.keys(merged)).toHaveLength(1);
    expect(merged["content-type"]).toBe("application/json");
  });
});

describe("mergeQuery()", () => {
  it("override value wins on conflict", () => {
    const merged = mergeQuery({ page: "1" }, { page: "2" });
    expect(merged["page"]).toBe("2");
  });

  it("undefined override value does NOT erase base value (D-09)", () => {
    const merged = mergeQuery({ page: "1" }, { page: undefined });
    expect(merged["page"]).toBe("1");
  });

  it("base and override are both optional", () => {
    expect(mergeQuery(undefined, undefined)).toEqual({});
  });

  it("array values are preserved", () => {
    const merged = mergeQuery({ tags: ["a", "b"] as const }, {});
    expect(merged["tags"]).toEqual(["a", "b"]);
  });
});
