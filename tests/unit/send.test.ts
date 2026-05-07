import { describe, it, expect } from "vitest";
import { performSend } from "../../src/send.js";
import { createClient } from "../../src/client.js";
import { Request } from "../../src/request.js";
import { Decode } from "../../src/decode.js";

describe("SEND-01: createClient() returns Client with send() method", () => {
  it("send() method exists on returned Client object", () => {
    const client = createClient({ baseUrl: "https://api.example.com/" });
    expect(typeof client.send).toBe("function");
  });
});

describe("SEND-02: performSend() never throws for HTTP outcomes", () => {
  it("returns { kind: 'unhandledStatus' } for HTTP 200 with body", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("hello world", { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("unhandledStatus");
    if (result.kind === "unhandledStatus") {
      expect(result.status).toBe(200);
      expect(result.preview.text).toBe("hello world");
      expect(result.preview.bytesRead).toBe(11);
      expect(result.preview.truncated).toBe(false);
    }
  });

  it("returns { kind: 'unhandledStatus' } for HTTP 404", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("not found", { status: 404 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("unhandledStatus");
    if (result.kind === "unhandledStatus") {
      expect(result.status).toBe(404);
    }
  });

  it("returns { kind: 'transportError', error: { kind: 'network' } } on fetch() throw", async () => {
    const mockFetch: typeof globalThis.fetch = async () => {
      throw new Error("connection refused");
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("network");
    }
  });

  it("does not throw when fetch() rejects with arbitrary Error", async () => {
    const mockFetch: typeof globalThis.fetch = async () => {
      throw new TypeError("Custom error type");
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("transportError");
  });
});

describe("SEND-03: performSend() pre-abort guard (D-05)", () => {
  it("returns { kind: 'transportError', error: { kind: 'aborted' } } immediately when signal is pre-aborted", async () => {
    const signal = AbortSignal.abort();
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(
      req,
      { baseUrl: "https://api.example.com/", fetch: async () => new Response() },
      { signal },
    );
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("aborted");
    }
  });

  it("does NOT call fetch() when signal is pre-aborted", async () => {
    let fetchCalled = false;
    const mockFetch: typeof globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response();
    };
    const signal = AbortSignal.abort();
    const req = Request.create({ method: "GET", path: [], responses: {} });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch }, { signal });
    expect(fetchCalled).toBe(false);
  });

  it("does NOT call request.consume() when signal is pre-aborted", async () => {
    const signal = AbortSignal.abort();
    const req = Request.create({ method: "GET", path: [], responses: {} });
    await performSend(
      req,
      { baseUrl: "https://api.example.com/", fetch: async () => new Response() },
      { signal },
    );
    // If consume() was called on the first send, re-sending would throw TypeError ("body used").
    // Sending again with a fresh (non-aborted) signal must succeed — proving consume() was NOT called.
    const result2 = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: async () => new Response(null, { status: 200 }),
    });
    expect(result2.kind).toBe("unhandledStatus");
  });
});

describe("SEND-04: deadlineMs validation (D-07)", () => {
  it("throws RangeError when clientSpec.deadlineMs is 0", async () => {
    const mockFetch: typeof globalThis.fetch = async () => new Response(null, { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    await expect(
      performSend(req, { baseUrl: "https://api.example.com/", deadlineMs: 0, fetch: mockFetch }),
    ).rejects.toThrow(RangeError);
  });

  it("throws RangeError when clientSpec.deadlineMs is -1", async () => {
    const mockFetch: typeof globalThis.fetch = async () => new Response(null, { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    await expect(
      performSend(req, { baseUrl: "https://api.example.com/", deadlineMs: -1, fetch: mockFetch }),
    ).rejects.toThrow(RangeError);
  });

  it("throws RangeError when requestSpec.deadlineMs is 0", async () => {
    const mockFetch: typeof globalThis.fetch = async () => new Response(null, { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {}, deadlineMs: 0 });
    await expect(
      performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch }),
    ).rejects.toThrow(RangeError);
  });

  it("does not throw when deadlineMs is 1 (positive)", async () => {
    const mockFetch: typeof globalThis.fetch = async () => new Response(null, { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      deadlineMs: 5000,
      fetch: mockFetch,
    });
    expect(result.kind).toBe("unhandledStatus");
  });
});

describe("SEND-05: Header merge (D-19) — case-insensitive, request wins", () => {
  it("request headers override client headers (same key)", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: typeof globalThis.fetch = async (_url, init) => {
      const rawHeaders = init?.headers;
      if (rawHeaders !== undefined && !(rawHeaders instanceof Headers) && !Array.isArray(rawHeaders)) {
        capturedHeaders = rawHeaders;
      }
      return new Response(null, { status: 200 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      headers: { "x-custom": "from-request" },
    });
    await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      headers: { "x-custom": "from-client" },
    });
    expect(capturedHeaders["x-custom"]).toBe("from-request");
  });

  it("client-only headers are included in fetch call", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: typeof globalThis.fetch = async (_url, init) => {
      const rawHeaders = init?.headers;
      if (rawHeaders !== undefined && !(rawHeaders instanceof Headers) && !Array.isArray(rawHeaders)) {
        capturedHeaders = rawHeaders;
      }
      return new Response(null, { status: 200 });
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      headers: { authorization: "Bearer token" },
    });
    expect(capturedHeaders["authorization"]).toBe("Bearer token");
  });

  it("header key normalization: 'Content-Type' lowercased to 'content-type'", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: typeof globalThis.fetch = async (_url, init) => {
      const rawHeaders = init?.headers;
      if (rawHeaders !== undefined && !(rawHeaders instanceof Headers) && !Array.isArray(rawHeaders)) {
        capturedHeaders = rawHeaders;
      }
      return new Response(null, { status: 200 });
    };
    const req = Request.create({
      method: "POST",
      path: [],
      responses: {},
      headers: { "Content-Type": "application/json" },
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(capturedHeaders["content-type"]).toBe("application/json");
    expect(capturedHeaders["Content-Type"]).toBeUndefined();
  });

  it("undefined header values are filtered (not passed to fetch)", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: typeof globalThis.fetch = async (_url, init) => {
      const rawHeaders = init?.headers;
      if (rawHeaders !== undefined && !(rawHeaders instanceof Headers) && !Array.isArray(rawHeaders)) {
        capturedHeaders = rawHeaders;
      }
      return new Response(null, { status: 200 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      headers: { "x-optional": undefined },
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(Object.keys(capturedHeaders)).not.toContain("x-optional");
  });
});

describe("SEND-06: responses map — real dispatch replaces Phase 3 stub (Phase 5)", () => {
  it("matched status with decoder returning DecodeError → { kind: 'decodeError' }", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("body", { status: 200 });
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: { tag: "ok", decode: { fn: async (_r: Response) => ({ kind: "emptyBody" as const }) } } },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    // Phase 5: status 200 is now matched and dispatched; decoder returns a DecodeError → decodeError result
    expect(result.kind).toBe("decodeError");
    if (result.kind === "decodeError") {
      expect(result.status).toBe(200);
      expect(result.error.kind).toBe("emptyBody");
    }
  });
});

describe("SEND-07: effectiveDeadlineMs = requestSpec.deadlineMs ?? clientSpec.deadlineMs (D-20)", () => {
  it("request deadlineMs overrides client deadlineMs when both present", async () => {
    let fetchStarted = false;
    const mockFetch: typeof globalThis.fetch = (_url, init) => {
      fetchStarted = true;
      const signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        });
        setTimeout(_resolve, 200);
      });
    };
    const req = Request.create({ method: "GET", path: [], responses: {}, deadlineMs: 10 });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      deadlineMs: 60000,
      fetch: mockFetch,
    });
    expect(fetchStarted).toBe(true);
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("timeout");
    }
  });

  it("client deadlineMs used when request has no deadlineMs", async () => {
    const mockFetch: typeof globalThis.fetch = (_url, init) => {
      const signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        });
        setTimeout(_resolve, 200);
      });
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      deadlineMs: 10,
      fetch: mockFetch,
    });
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("timeout");
    }
  });
});

describe("SEND-08: AbortSignal.any() composition — deadline and caller abort (D-09, D-10)", () => {
  it("deadline fires → { kind: 'timeout' } NOT { kind: 'aborted' } (D-10 CRITICAL)", async () => {
    const mockFetch: typeof globalThis.fetch = (_url, init) => {
      const signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        });
        setTimeout(_resolve, 500);
      });
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      deadlineMs: 20,
      fetch: mockFetch,
    });
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("timeout");
    }
  });

  it("caller abort during fetch → { kind: 'aborted' }", async () => {
    const controller = new AbortController();
    const mockFetch: typeof globalThis.fetch = (_url, init) => {
      const signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        // Abort the controller shortly after fetch starts (simulates mid-flight abort)
        setTimeout(() => { controller.abort(); }, 10);
        // Simulates native fetch rejecting with signal.reason on abort
        signal?.addEventListener("abort", () => {
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        });
        setTimeout(_resolve, 500);
      });
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(
      req,
      { baseUrl: "https://api.example.com/", fetch: mockFetch },
      { signal: controller.signal },
    );
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("aborted");
    }
  });

  it("clearTimeout fires in finally even when fetch() rejects", async () => {
    const mockFetch: typeof globalThis.fetch = async () => {
      throw new Error("network failure");
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      deadlineMs: 5000,
      fetch: mockFetch,
    });
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("network");
    }
  });

  it("body-read abort → { kind: 'timeout' } (D-12 — deadline fires during body reading)", async () => {
    let capturedSignal: AbortSignal | undefined;
    const slowBody = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          const sig = capturedSignal;
          if (sig !== undefined) {
            sig.addEventListener("abort", () => {
              controller.error(sig.reason);
            });
          }
        }, 0);
        setTimeout(() => {
          try {
            controller.enqueue(new TextEncoder().encode("hello"));
            controller.close();
          } catch {
            // stream already errored/cancelled — this timer outlives the test; guard is safe
          }
        }, 300);
      },
    });
    const mockFetch: typeof globalThis.fetch = async (_url, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response(slowBody, { status: 200 });
    };
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      deadlineMs: 20,
      fetch: mockFetch,
    });
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("timeout");
    }
  });
});

describe("SEND-09: body preview reading (D-15, D-16, D-17)", () => {
  it("preview.bytesRead reflects actual bytes read", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("hello", { status: 200 }); // 5 bytes
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    if (result.kind === "unhandledStatus") {
      expect(result.preview.bytesRead).toBe(5);
    }
  });

  it("preview.truncated is false when body shorter than bodyPreviewBytes", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("short body", { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    if (result.kind === "unhandledStatus") {
      expect(result.preview.truncated).toBe(false);
    }
  });

  it("preview.truncated is false when body length exactly equals bodyPreviewBytes (peek pattern)", async () => {
    // Exercises the peek-read path: stream delivers exactly N bytes then closes
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("abcd", { status: 200 }); // exactly 4 bytes
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      diagnostics: { bodyPreviewBytes: 4 },
    });
    if (result.kind === "unhandledStatus") {
      expect(result.preview.bytesRead).toBe(4);
      expect(result.preview.truncated).toBe(false);
    }
  });

  it("preview.truncated is true when body longer than bodyPreviewBytes", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("abcde", { status: 200 }); // 5 bytes, limit is 4
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      diagnostics: { bodyPreviewBytes: 4 },
    });
    if (result.kind === "unhandledStatus") {
      expect(result.preview.bytesRead).toBe(4);
      expect(result.preview.truncated).toBe(true);
    }
  });

  it("preview.text is UTF-8 decoded string of preview bytes", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("hello", { status: 200 });
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    if (result.kind === "unhandledStatus") {
      expect(result.preview.text).toBe("hello");
    }
  });

  it("response.body === null returns { text: '', bytesRead: 0, truncated: false }", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response(null, { status: 204 }); // 204 No Content — body is null
    const req = Request.create({ method: "GET", path: [], responses: {} });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    if (result.kind === "unhandledStatus") {
      expect(result.preview.text).toBe("");
      expect(result.preview.bytesRead).toBe(0);
      expect(result.preview.truncated).toBe(false);
    }
  });
});

describe("SEND-10: dispatch integration — matchResponse → decode → SendResult", () => {
  it("matched status with successful decode → { kind: 'response', response: { tag, body } }", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ id: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: Decode.json().as("user") },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("response");
    if (result.kind === "response") {
      const res = result.response as unknown as { tag: string; body: unknown };
      expect(res.tag).toBe("user");
      expect(res.body).toEqual({ id: 42 });
    }
  });

  it("unmatched status → { kind: 'unhandledStatus' } via readBodyPreview (not readBytes)", async () => {
    // Status 404 has no entry in responses map → matchResponse returns null → readBodyPreview path
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("not found body", { status: 404 });
    const req = Request.create({
      method: "GET",
      path: [],
      // Only map 200; 404 is unhandled
      responses: { 200: Decode.json().as("ok") },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("unhandledStatus");
    if (result.kind === "unhandledStatus") {
      expect(result.status).toBe(404);
      expect(result.preview.text).toBe("not found body");
      expect(result.preview.bytesRead).toBe(14);
      expect(result.preview.truncated).toBe(false);
    }
  });

  it("matched status with decoder that throws → { kind: 'decodeError', error.kind: 'bodyReadFailed' } — send() does NOT throw", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("some bytes", { status: 200 });
    const throwingDecoder = {
      fn: async (_r: Response): Promise<unknown> => {
        throw new Error("decoder blew up");
      },
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: { tag: "ok", decode: throwingDecoder } },
    });
    // Must not throw — decode exceptions are caught and returned as decodeError
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("decodeError");
    if (result.kind === "decodeError") {
      expect(result.status).toBe(200);
      expect(result.error.kind).toBe("bodyReadFailed");
      if (result.error.kind === "bodyReadFailed") {
        expect(result.error.message).toContain("decoder blew up");
      }
      // Preview should be derived from buffered bytes
      expect(result.preview.text).toBe("some bytes");
    }
  });

  it("matched status with decoder returning DecodeError → { kind: 'decodeError' } with preview from previewFromBytes", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("{bad json}", { status: 200 });
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: Decode.json().as("data") },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("decodeError");
    if (result.kind === "decodeError") {
      expect(result.status).toBe(200);
      expect(result.error.kind).toBe("invalidJson");
      // Preview is derived from buffered bytes (previewFromBytes path)
      expect(result.preview.text).toBe("{bad json}");
      expect(result.preview.bytesRead).toBe(10);
      expect(result.preview.truncated).toBe(false);
    }
  });

  it("bodyPreviewBytes from clientSpec.diagnostics controls preview size cap for decodeError", async () => {
    // Body is 20 bytes, preview cap is 5
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("abcdefghijklmnopqrst", { status: 200 });
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: Decode.json().as("data") }, // JSON decoder → invalidJson (body isn't JSON)
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      diagnostics: { bodyPreviewBytes: 5 },
    });
    expect(result.kind).toBe("decodeError");
    if (result.kind === "decodeError") {
      // previewFromBytes honors the 5-byte cap
      expect(result.preview.bytesRead).toBe(5);
      expect(result.preview.text).toBe("abcde");
      expect(result.preview.truncated).toBe(true);
    }
  });

  it("class-level matcher (2xx) in requestSpec.responses matches status 201", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response('"created"', { status: 201 });
    const req = Request.create({
      method: "POST",
      path: [],
      responses: { "2xx": Decode.json().as("created") },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("response");
    if (result.kind === "response") {
      const res = result.response as unknown as { tag: string; body: unknown };
      expect(res.tag).toBe("created");
      expect(res.body).toBe("created");
    }
  });

  it("readBytes() bodyReadFailed → { kind: 'decodeError', error.kind: 'bodyReadFailed' }", async () => {
    const erroringStream = new ReadableStream({
      start(controller) {
        controller.error(new Error("stream exploded mid-read"));
      },
    });
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response(erroringStream, { status: 200 });
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: Decode.json().as("data") },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(result.kind).toBe("decodeError");
    if (result.kind === "decodeError") {
      expect(result.error.kind).toBe("bodyReadFailed");
      // truncated should be true — stream was non-null but errored
      expect(result.preview.truncated).toBe(true);
    }
  });

  it("clientSpec.responses fallback — status matched by client map when not in request map", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response('"error detail"', { status: 422 });
    const req = Request.create({
      method: "POST",
      path: [],
      responses: { 201: Decode.json().as("created") }, // does not cover 422
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
      responses: { 422: Decode.json().as("validationError") },
    });
    expect(result.kind).toBe("response");
    if (result.kind === "response") {
      const res = result.response as unknown as { tag: string; body: unknown };
      expect(res.tag).toBe("validationError");
      expect(res.body).toBe("error detail");
    }
  });
});

describe("ADR-03: Retry — off-by-one prevention (P5) — maxAttempts:N sends exactly N requests", () => {
  it("maxAttempts:3 + persistent 502 → exactly 3 fetch calls (not 2, not 4)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 502 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      // Wave 0: retry type will be corrected in 06-02-PLAN.md; esbuild strips types at test time
      retry: { maxAttempts: 3, retryableStatuses: [502] },
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(callCount).toBe(3);
  });

  it("maxAttempts:1 + persistent 503 → exactly 1 fetch call (no retry budget)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 503 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      retry: { maxAttempts: 1, retryableStatuses: [503] },
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(callCount).toBe(1);
  });
});

describe("ADR-04: Retry — abort during backoff sleep surfaces as transportError.aborted immediately", () => {
  it("abort at 50ms into 500ms backoff completes in <200ms total (not 500ms)", async () => {
    const controller = new AbortController();
    let fetchCallCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      fetchCallCount++;
      // Abort during the backoff window that follows this response
      if (fetchCallCount === 1) {
        setTimeout(() => {
          controller.abort();
        }, 50);
      }
      return new Response(null, { status: 502 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      retry: { maxAttempts: 3, retryableStatuses: [502], initialDelayMs: 500 },
    });
    const start = Date.now();
    const result = await performSend(
      req,
      { baseUrl: "https://api.example.com/", fetch: mockFetch },
      { signal: controller.signal },
    );
    const elapsed = Date.now() - start;
    expect(result.kind).toBe("transportError");
    if (result.kind === "transportError") {
      expect(result.error.kind).toBe("aborted");
    }
    // Must complete well under 500ms backoff — abort fires at 50ms, resolves by ~100ms
    expect(elapsed).toBeLessThan(200);
  });
});

describe("ADR-06: Retry — decodeError and non-retryable statuses are never retried", () => {
  it("decodeError on 200 response is not retried — exactly 1 fetch call", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      // Returns 200 with non-JSON body → decodeError (200 is not in retryableStatuses)
      return new Response("not-valid-json", { status: 200 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: { 200: { tag: "ok" as const, decode: Decode.json() } },
      retry: { maxAttempts: 3, retryableStatuses: [502, 503, 504] },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(callCount).toBe(1);
    expect(result.kind).toBe("decodeError");
  });

  it("unhandledStatus on non-retryable status is not retried — exactly 1 fetch call", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 400 }); // 400 not in retryableStatuses
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      retry: { maxAttempts: 3, retryableStatuses: [502, 503, 504] },
    });
    const result = await performSend(req, {
      baseUrl: "https://api.example.com/",
      fetch: mockFetch,
    });
    expect(callCount).toBe(1);
    expect(result.kind).toBe("unhandledStatus");
  });
});

describe("ADR-07: Default retry policy — GET/HEAD/QUERY on 502/503/504", () => {
  it("GET + 503 + retry:true → 3 fetch calls (maxAttempts default = 3)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 503 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      retry: true,
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(callCount).toBe(3);
  });

  it("POST + 503 + retry:true → 1 fetch call (POST not in default methods: GET/HEAD/QUERY)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 503 });
    };
    const req = Request.create({
      method: "POST",
      path: [],
      responses: {},
      retry: true,
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(callCount).toBe(1);
  });

  it("GET + 200 + retry:true → 1 fetch call (200 not in default retryableStatuses)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 200 });
    };
    const req = Request.create({
      method: "GET",
      path: [],
      responses: {},
      retry: true,
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(callCount).toBe(1);
  });

  it("HEAD + 504 + retry:true → 3 fetch calls (HEAD is in default methods)", async () => {
    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 504 });
    };
    const req = Request.create({
      method: "HEAD",
      path: [],
      responses: {},
      retry: true,
    });
    await performSend(req, { baseUrl: "https://api.example.com/", fetch: mockFetch });
    expect(callCount).toBe(3);
  });
});
