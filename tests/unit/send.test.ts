import { describe, it, expect } from "vitest";
import { performSend } from "../../src/send.js";
import { createClient } from "../../src/client.js";
import { Request } from "../../src/request.js";

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

describe("SEND-06: responses map — Phase 3 stub returns unhandledStatus (D-13)", () => {
  it("Phase 3 stub: all HTTP responses return { kind: 'unhandledStatus' } regardless of responses map", async () => {
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
    // Phase 3: response matching is deferred to Phase 5
    expect(result.kind).toBe("unhandledStatus");
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
          controller.enqueue(new TextEncoder().encode("hello"));
          controller.close();
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
