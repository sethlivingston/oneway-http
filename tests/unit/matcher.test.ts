import { describe, it, expect } from "vitest";
import { Send } from "../../src/index.js";
import type { Matcher } from "../../src/index.js";
import type {
  BodyPreview,
  DecodeError,
  RequestError,
  SendResult,
  TransportError,
} from "../../src/types.js";

// ---------------------------------------------------------------------------
// Test response union used throughout this file
// ---------------------------------------------------------------------------

type TestResponse =
  | { tag: "ok"; body: string }
  | { tag: "notFound"; body: null };

// ---------------------------------------------------------------------------
// Complete Matcher<TestResponse, string> — reused across dispatch tests
// ---------------------------------------------------------------------------

const allHandlers: Matcher<TestResponse, string> = {
  ok: (r) => `ok:${r.body}`,
  notFound: (_r) => "notFound",
  transportError: (e) => `transport:${e.kind}`,
  decodeError: (_e, status) => `decode:${_e.kind}:${String(status)}`,
  unhandledStatus: (status) => `unhandled:${String(status)}`,
  requestError: (e) => `request:${e.kind}`,
};

// ---------------------------------------------------------------------------
// MATCH-02: Compile-time exhaustiveness enforcement
// These are module-level assignments — validated by `npm run typecheck` (tsc --noEmit).
// Each ts-expect-error comment below suppresses the expected TypeScript error on the
// following line. If TypeScript stops reporting the error, tsc flags the directive as
// unused — itself a typecheck failure, enforcing the invariant both ways.
// ---------------------------------------------------------------------------

// Missing "notFound" tagged handler must be a compile error
// @ts-expect-error: Matcher<TestResponse, string> requires "notFound" handler; object literal is missing it
const missingNotFound: Matcher<TestResponse, string> = {
  ok: (r) => r.body,
  transportError: (_e) => "err",
  decodeError: (_e) => "err",
  unhandledStatus: (_s) => "err",
  requestError: (_e) => "err",
};

// Missing "requestError" fixed handler must be a compile error
// @ts-expect-error: Matcher<TestResponse, string> requires "requestError" handler; object literal is missing it
const missingRequestError: Matcher<TestResponse, string> = {
  ok: (r) => r.body,
  notFound: (_r) => "nf",
  transportError: (_e) => "err",
  decodeError: (_e) => "err",
  unhandledStatus: (_s) => "err",
};

// ---------------------------------------------------------------------------
// MATCH-01: Runtime dispatch tests
// ---------------------------------------------------------------------------

describe("MATCH-01: Send.match — response dispatch", () => {
  it("calls the tagged response handler for kind='response' with tag='ok'", () => {
    const result: SendResult<TestResponse> = {
      kind: "response",
      response: { tag: "ok", body: "hello" },
    };
    expect(Send.match(result, allHandlers)).toBe("ok:hello");
  });

  it("dispatches to the correct tag when response tag is 'notFound'", () => {
    const result: SendResult<TestResponse> = {
      kind: "response",
      response: { tag: "notFound", body: null },
    };
    expect(Send.match(result, allHandlers)).toBe("notFound");
  });
});

describe("MATCH-01: Send.match — transportError dispatch", () => {
  it("calls transportError handler for kind='transportError'", () => {
    const error: TransportError = { kind: "aborted" };
    const result: SendResult<TestResponse> = { kind: "transportError", error };
    expect(Send.match(result, allHandlers)).toBe("transport:aborted");
  });
});

describe("MATCH-01: Send.match — decodeError dispatch", () => {
  it("calls decodeError handler with error, status, headers, preview", () => {
    const error: DecodeError = { kind: "invalidJson", message: "bad json" };
    const headers = new Headers();
    const preview: BodyPreview = { text: "", bytesRead: 0, truncated: false };
    const result: SendResult<TestResponse> = {
      kind: "decodeError",
      error,
      status: 200,
      headers,
      preview,
    };
    expect(Send.match(result, allHandlers)).toBe("decode:invalidJson:200");
  });
});

describe("MATCH-01: Send.match — unhandledStatus dispatch", () => {
  it("calls unhandledStatus handler with status, headers, preview", () => {
    const headers = new Headers();
    const preview: BodyPreview = { text: "", bytesRead: 0, truncated: false };
    const result: SendResult<TestResponse> = {
      kind: "unhandledStatus",
      status: 418,
      headers,
      preview,
    };
    expect(Send.match(result, allHandlers)).toBe("unhandled:418");
  });
});

describe("MATCH-01: Send.match — requestError dispatch", () => {
  it("calls requestError handler for kind='requestError'", () => {
    const error: RequestError = { kind: "requestConsumed" };
    const result: SendResult<TestResponse> = { kind: "requestError", error };
    expect(Send.match(result, allHandlers)).toBe("request:requestConsumed");
  });
});

// ---------------------------------------------------------------------------
// MATCH-02: Compile-time exhaustiveness — marker test
// The actual exhaustiveness enforcement is in the @ts-expect-error blocks above.
// ---------------------------------------------------------------------------

describe("MATCH-02: Matcher exhaustiveness — compile-time enforcement", () => {
  it("@ts-expect-error blocks above enforce missing handlers at compile time", () => {
    // The _missingNotFound and _missingRequestError assignments above this describe block
    // are the real MATCH-02 tests — validated by `npm run typecheck` not by Vitest.
    // This it() confirms the describe block is non-empty and the file loads without error.
    expect(missingNotFound).toBeDefined();
    expect(missingRequestError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// MATCH-03: Handler composability with Partial<Matcher<R,T>> + spread
// ---------------------------------------------------------------------------

describe("MATCH-03: handler composability with Partial<Matcher<R,T>> + spread", () => {
  it("composes error handler fragment via object spread at Send.match() call site", () => {
    // Error-handling fragment — reusable across call sites.
    // satisfies Partial<Matcher<...>> preserves per-handler inferred return types
    // while confirming the fragment is a valid subset of the full Matcher shape.
    const errorHandlers = {
      transportError: (_e: TransportError): string => "transport",
      decodeError: (_e: DecodeError): string => "decode",
      unhandledStatus: (_s: number): string => "unhandled",
      requestError: (_e: RequestError): string => "request",
    } satisfies Partial<Matcher<TestResponse, string>>;

    // Compose at call site via spread — tagged response handlers complete the contract.
    // Explicit type parameters fix inference when spread mixes handler sources.
    const result: SendResult<TestResponse> = {
      kind: "response",
      response: { tag: "ok", body: "world" },
    };
    const outcome = Send.match<TestResponse, string>(result, {
      ...errorHandlers,
      ok: (r) => `spread:${r.body}`,
      notFound: (_r) => "spread:notFound",
    });
    expect(outcome).toBe("spread:world");
  });

  it("composed handler dispatches to the spread error fragment for transportError", () => {
    const errorHandlers = {
      transportError: (_e: TransportError): string => "spread-transport",
      decodeError: (_e: DecodeError): string => "spread-decode",
      unhandledStatus: (_s: number): string => "spread-unhandled",
      requestError: (_e: RequestError): string => "spread-request",
    } satisfies Partial<Matcher<TestResponse, string>>;

    const result: SendResult<TestResponse> = {
      kind: "transportError",
      error: { kind: "timeout" },
    };
    const outcome = Send.match<TestResponse, string>(result, {
      ...errorHandlers,
      ok: (_r) => "ok",
      notFound: (_r) => "notFound",
    });
    expect(outcome).toBe("spread-transport");
  });
});
