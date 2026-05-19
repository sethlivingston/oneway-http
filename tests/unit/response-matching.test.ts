import { describe, it, expect } from "vitest";
import { matchResponse } from "../../src/response-matching.js";
import type { ResponseMap, TaggedEntry } from "../../src/types.js";

// Minimal TaggedEntry stub for testing — only tag and decode are required at runtime.
function makeEntry(tag: string): TaggedEntry {
  return {
    tag,
    decode: {
      fn: async (_response: Response) => undefined,
    },
  };
}

describe("RESP-01: matchResponse — requestMap exact match", () => {
  it("returns the entry when requestMap has an exact status match", () => {
    const entry = makeEntry("ok");
    const requestMap: ResponseMap = { 200: entry };
    const result = matchResponse(200, requestMap, undefined);
    expect(result).toBe(entry);
  });
});

describe("RESP-01: matchResponse — requestMap class match", () => {
  it("returns the entry when requestMap has a class match (2xx)", () => {
    const entry = makeEntry("created");
    const requestMap: ResponseMap = { "2xx": entry };
    const result = matchResponse(201, requestMap, undefined);
    expect(result).toBe(entry);
  });
});

describe("RESP-02: matchResponse — clientMap exact match", () => {
  it("returns the entry when clientMap has an exact status match", () => {
    const entry = makeEntry("ok");
    const clientMap: ResponseMap = { 200: entry };
    const result = matchResponse(200, undefined, clientMap);
    expect(result).toBe(entry);
  });
});

describe("RESP-02: matchResponse — clientMap class match", () => {
  it("returns the entry when clientMap has a class match (2xx)", () => {
    const entry = makeEntry("created");
    const clientMap: ResponseMap = { "2xx": entry };
    const result = matchResponse(201, undefined, clientMap);
    expect(result).toBe(entry);
  });
});

describe("RESP-01/RESP-02: matchResponse — specificity-first precedence", () => {
  it("client exact match beats request class match", () => {
    const reqEntry = makeEntry("req-2xx");
    const cliEntry = makeEntry("cli-201");
    const requestMap: ResponseMap = { "2xx": reqEntry };
    const clientMap: ResponseMap = { 201: cliEntry };
    const result = matchResponse(201, requestMap, clientMap);
    expect(result).toBe(cliEntry);
  });

  it("request exact match beats client exact match", () => {
    const reqEntry = makeEntry("req-200");
    const cliEntry = makeEntry("cli-200");
    const requestMap: ResponseMap = { 200: reqEntry };
    const clientMap: ResponseMap = { 200: cliEntry };
    const result = matchResponse(200, requestMap, clientMap);
    expect(result).toBe(reqEntry);
  });

  it("request class match beats client class match", () => {
    const reqEntry = makeEntry("req-2xx");
    const cliEntry = makeEntry("cli-2xx");
    const requestMap: ResponseMap = { "2xx": reqEntry };
    const clientMap: ResponseMap = { "2xx": cliEntry };
    const result = matchResponse(201, requestMap, clientMap);
    expect(result).toBe(reqEntry);
  });
});

describe("RESP-01: matchResponse — no match", () => {
  it("returns null when no requestMap or clientMap entry matches", () => {
    const entry = makeEntry("ok");
    const requestMap: ResponseMap = { 200: entry };
    const result = matchResponse(418, requestMap, undefined);
    expect(result).toBeNull();
  });
});

describe("matchResponse — both maps undefined", () => {
  it("returns null when both maps are undefined", () => {
    const result = matchResponse(200, undefined, undefined);
    expect(result).toBeNull();
  });
});
