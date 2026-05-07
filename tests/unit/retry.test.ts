// tests/unit/retry.test.ts — unit tests for sleepWithAbort, jitterDelay, resolveRetryPolicy
// Wave 0: this file is intentionally RED — src/retry.ts does not exist yet
// These tests drive the Wave 1 implementation in 06-02-PLAN.md

import { describe, it, expect } from "vitest";
import {
  sleepWithAbort,
  jitterDelay,
  resolveRetryPolicy,
} from "../../src/retry.js";

describe("RETRY-01: sleepWithAbort — resolves after ms with no signal", () => {
  it("resolves after the specified delay (no signal)", async () => {
    const start = Date.now();
    await sleepWithAbort(50, undefined);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe("RETRY-01: sleepWithAbort — rejects immediately on pre-aborted signal (P6)", () => {
  it("rejects immediately when signal is already aborted before sleep starts", async () => {
    const signal = AbortSignal.abort();
    const start = Date.now();
    await expect(sleepWithAbort(500, signal)).rejects.toBeDefined();
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("rejects with the signal reason when pre-aborted", async () => {
    const reason = new DOMException("test abort", "AbortError");
    const signal = AbortSignal.abort(reason);
    await expect(sleepWithAbort(500, signal)).rejects.toBe(reason);
  });
});

describe("RETRY-01: sleepWithAbort — rejects immediately when signal fires during sleep (P6)", () => {
  it("ADR-04: abort at 50ms into 500ms sleep completes in <150ms total", async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 50);
    const start = Date.now();
    await expect(sleepWithAbort(500, controller.signal)).rejects.toBeDefined();
    expect(Date.now() - start).toBeLessThan(150);
  });

  it("ADR-04: sleep with undefined signal resolves normally (no abort)", async () => {
    // Confirm undefined signal does not throw
    await expect(sleepWithAbort(10, undefined)).resolves.toBeUndefined();
  });
});

describe("RETRY-02: jitterDelay — Math.min cap applied before Math.random (P7 jitter overflow prevention)", () => {
  it("ADR-05: delay never exceeds maxDelayMs across attempts 0..99", () => {
    const maxDelayMs = 10_000;
    for (let attempt = 0; attempt < 100; attempt++) {
      const delay = jitterDelay(attempt, 200, maxDelayMs);
      expect(delay).toBeLessThanOrEqual(maxDelayMs);
    }
  });

  it("ADR-05: delay is always non-negative", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(jitterDelay(attempt, 200, 10_000)).toBeGreaterThanOrEqual(0);
    }
  });

  it("ADR-05: delay is always an integer (Math.floor applied)", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const delay = jitterDelay(attempt, 200, 10_000);
      expect(delay).toBe(Math.floor(delay));
    }
  });

  it("ADR-05: delay with maxDelayMs=0 is always 0", () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(jitterDelay(attempt, 200, 0)).toBe(0);
    }
  });

  it("ADR-05: very high attempt number does not overflow (attempt=60, base*2^60 ≈ 1.15e18)", () => {
    // This test catches the P7 bug: Math.random() * (200 * 2^60) ≈ huge number
    // Correct formula: Math.floor(Math.random() * Math.min(10_000, 200 * 2^60)) ≤ 10_000
    const delay = jitterDelay(60, 200, 10_000);
    expect(delay).toBeLessThanOrEqual(10_000);
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});

describe("RETRY-03: resolveRetryPolicy — null for all no-retry cases (D-10)", () => {
  it("(undefined, undefined) → null", () => {
    expect(resolveRetryPolicy(undefined, undefined)).toBeNull();
  });

  it("(undefined, false) → null", () => {
    expect(resolveRetryPolicy(undefined, false)).toBeNull();
  });

  it("(false, undefined) → null — request false terminates regardless of client", () => {
    expect(resolveRetryPolicy(false, undefined)).toBeNull();
  });

  it("(false, true) → null — request false overrides client true", () => {
    expect(resolveRetryPolicy(false, true)).toBeNull();
  });

  it("(false, { maxAttempts: 5 }) → null — request false overrides RetryOptions client", () => {
    expect(resolveRetryPolicy(false, { maxAttempts: 5 })).toBeNull();
  });
});

describe("RETRY-03: resolveRetryPolicy — library defaults when policy is true (D-02)", () => {
  it("(undefined, true) → all library defaults", () => {
    const result = resolveRetryPolicy(undefined, true);
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.maxAttempts).toBe(3);
      expect(result.initialDelayMs).toBe(200);
      expect(result.maxDelayMs).toBe(10_000);
      expect([...result.methods]).toEqual(["GET", "HEAD", "QUERY"]);
      expect([...result.retryableStatuses]).toEqual([502, 503, 504]);
    }
  });

  it("(true, undefined) → all library defaults regardless of client undefined", () => {
    const result = resolveRetryPolicy(true, undefined);
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.maxAttempts).toBe(3);
      expect(result.initialDelayMs).toBe(200);
      expect(result.maxDelayMs).toBe(10_000);
    }
  });

  it("(true, { maxAttempts: 99 }) → library defaults; client RetryOptions IGNORED (D-10)", () => {
    const result = resolveRetryPolicy(true, { maxAttempts: 99 });
    expect(result).not.toBeNull();
    if (result !== null) {
      // D-10: request true → library defaults, NOT client's maxAttempts:99
      expect(result.maxAttempts).toBe(3);
    }
  });
});

describe("RETRY-03: resolveRetryPolicy — RetryOptions merge with library defaults only (D-10)", () => {
  it("(RetryOptions, anything) → specified fields used; unspecified fall back to LIBRARY defaults (not client)", () => {
    const result = resolveRetryPolicy(
      { maxAttempts: 5 },
      { maxAttempts: 99, initialDelayMs: 9999 },
    );
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.maxAttempts).toBe(5);          // from request
      expect(result.initialDelayMs).toBe(200);     // library default (NOT client's 9999 — D-10)
      expect(result.maxDelayMs).toBe(10_000);      // library default
    }
  });

  it("(undefined, RetryOptions) → specified client fields used; unspecified fall back to library defaults", () => {
    const result = resolveRetryPolicy(undefined, { maxAttempts: 5 });
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.maxAttempts).toBe(5);      // from client
      expect(result.initialDelayMs).toBe(200); // library default
      expect(result.maxDelayMs).toBe(10_000);  // library default
    }
  });

  it("all fields specified in RetryOptions → all override library defaults", () => {
    const result = resolveRetryPolicy({
      maxAttempts: 2,
      methods: ["POST"],
      retryableStatuses: [429],
      initialDelayMs: 100,
      maxDelayMs: 5_000,
    }, undefined);
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.maxAttempts).toBe(2);
      expect([...result.methods]).toEqual(["POST"]);
      expect([...result.retryableStatuses]).toEqual([429]);
      expect(result.initialDelayMs).toBe(100);
      expect(result.maxDelayMs).toBe(5_000);
    }
  });
});
