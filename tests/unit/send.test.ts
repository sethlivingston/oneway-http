import { describe, it, expect } from "vitest";
import { performSend } from "../../src/send.js";
import { Request } from "../../src/request.js";
import type { ClientSpec, SendOptions } from "../../src/types.js";

describe("SEND-01: createClient() returns Client with send() method", () => {
  it.todo("send() method exists on returned Client object");
});

describe("SEND-02: performSend() never throws for HTTP outcomes", () => {
  it.todo("returns { kind: 'unhandledStatus' } for HTTP 200 with body");
  it.todo("returns { kind: 'unhandledStatus' } for HTTP 404");
  it.todo("returns { kind: 'transportError', error: { kind: 'network' } } on fetch() throw");
  it.todo("does not throw when fetch() rejects with arbitrary Error");
});

describe("SEND-02: performSend() pre-abort guard (D-05)", () => {
  it.todo("returns { kind: 'transportError', error: { kind: 'aborted' } } immediately when signal is pre-aborted");
  it.todo("does NOT call fetch() when signal is pre-aborted");
  it.todo("does NOT call request.consume() when signal is pre-aborted");
});

describe("SEND-02: deadlineMs validation (D-07)", () => {
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
    expect(result.kind).not.toBe("rangeError" as never);
  });
});

describe("SEND-03: Header merge (D-19) — case-insensitive, request wins", () => {
  it.todo("request headers override client headers (same key)");
  it.todo("client-only headers are included");
  it.todo("request-only headers are included");
  it.todo("header key normalization: 'Content-Type' and 'content-type' treated as same key");
  it.todo("undefined header values are filtered (not passed to fetch)");
});

describe("SEND-04: responses maps not pre-merged (D-13 stub)", () => {
  it.todo("Phase 3 stub: all HTTP responses return { kind: 'unhandledStatus' }");
});

describe("SEND-05: effectiveDeadlineMs = requestSpec.deadlineMs ?? clientSpec.deadlineMs (D-20)", () => {
  it("request deadlineMs overrides client deadlineMs when both present", async () => {
    let fetchStarted = false;
    const mockFetch: typeof globalThis.fetch = (_url, init) => {
      fetchStarted = true;
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
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
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
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

describe("SEND-06: AbortSignal.any() composition — deadline and caller abort (D-09, D-10)", () => {
  it("deadline fires → { kind: 'timeout' } NOT { kind: 'aborted' } (D-10 CRITICAL)", async () => {
    const mockFetch: typeof globalThis.fetch = (_url, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
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
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        // Abort the controller shortly after fetch starts (simulates mid-flight abort)
        setTimeout(() => controller.abort(), 10);
        // Simulates native fetch rejecting with signal.reason on abort
        signal?.addEventListener("abort", () => reject(signal.reason));
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

  it.todo("body-read abort → { kind: 'transportError', error: { kind: 'timeout' } } (D-12)");
});

describe("SEND-06: body preview reading (D-15, D-16, D-17)", () => {
  it.todo("preview.bytesRead reflects actual bytes read");
  it.todo("preview.truncated is false when body shorter than bodyPreviewBytes");
  it.todo("preview.truncated is false when body length exactly equals bodyPreviewBytes (peek pattern)");
  it.todo("preview.truncated is true when body longer than bodyPreviewBytes");
  it.todo("preview.text is UTF-8 decoded string of preview bytes");
  it.todo("response.body === null returns { text: '', bytesRead: 0, truncated: false }");
});
