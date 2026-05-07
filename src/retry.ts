// src/retry.ts — retry policy resolution, jitter delay, abort-aware sleep
// Dependency direction: send.ts → retry.ts → types.ts

import type { Method, RetryOptions, RetryPolicy } from "./types.js";

// ─── Resolved types ─────────────────────────────────────────────────────────

/**
 * Fully resolved retry policy — all fields are required (no optionals).
 * Returned by resolveRetryPolicy(); null means no retry (maxAttempts effectively 1).
 */
export interface ResolvedRetryPolicy {
  readonly maxAttempts: number;
  readonly methods: readonly Method[];
  readonly retryableStatuses: readonly number[];
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}

// ─── Library defaults (D-02) ─────────────────────────────────────────────────

export const RETRY_DEFAULTS = {
  maxAttempts: 3,
  methods: ["GET", "HEAD", "QUERY"] as const satisfies readonly Method[],
  retryableStatuses: [502, 503, 504] as const,
  initialDelayMs: 200,
  maxDelayMs: 10_000,
} as const;

// ─── Policy resolution (D-10) ────────────────────────────────────────────────

/**
 * Resolves the effective retry policy from request-level and client-level settings.
 *
 * D-10 semantics (NO field-level merge between request and client):
 * - request undefined → inherit client policy
 * - client undefined → no retry (null)
 * - false at either level → no retry (null); request false terminates immediately
 * - true at either level → library defaults (RETRY_DEFAULTS)
 * - RetryOptions → merge with LIBRARY DEFAULTS only; client values are IGNORED
 */
export function resolveRetryPolicy(
  requestRetry: RetryPolicy | undefined,
  clientRetry: RetryPolicy | undefined,
): ResolvedRetryPolicy | null {
  // D-10: request false → no retry regardless of client
  if (requestRetry === false) return null;

  // Determine effective policy: request takes precedence over client
  const effective: RetryPolicy | undefined =
    requestRetry !== undefined ? requestRetry : clientRetry;

  // No policy at either level → no retry
  if (effective === undefined || effective === false) return null;

  // true → all library defaults
  if (effective === true) {
    return { ...RETRY_DEFAULTS };
  }

  // RetryOptions: merge with library defaults ONLY (not client values — D-10)
  return {
    maxAttempts: effective.maxAttempts ?? RETRY_DEFAULTS.maxAttempts,
    methods: effective.methods ?? RETRY_DEFAULTS.methods,
    retryableStatuses: effective.retryableStatuses ?? RETRY_DEFAULTS.retryableStatuses,
    initialDelayMs: effective.initialDelayMs ?? RETRY_DEFAULTS.initialDelayMs,
    maxDelayMs: effective.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs,
  };
}

// ─── Jitter delay (D-08) ─────────────────────────────────────────────────────

/**
 * Computes a jittered exponential backoff delay.
 *
 * D-08: Math.min(maxDelayMs, ...) is applied BEFORE Math.random() — cap first.
 * Reversing the order: base * 2^60 ≈ 1.15e18 → effectively infinite setTimeout (P7 pitfall).
 */
export function jitterDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  // D-08: cap applied BEFORE random multiplication — prevents P7 jitter overflow
  return Math.floor(
    Math.random() * Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt)),
  );
}

// ─── Abort-aware sleep (D-09) ────────────────────────────────────────────────

/**
 * Sleeps for `ms` milliseconds, resolving normally or rejecting immediately
 * if `signal` fires during the sleep window.
 *
 * D-09: If signal is already aborted on entry, rejects synchronously (no setTimeout).
 * If signal fires during sleep: clearTimeout cancels the timer, reject(signal.reason) fires.
 * The rejection reason has .name === "AbortError" or "TimeoutError" — classifyTransportError handles it.
 */
export function sleepWithAbort(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // D-09: early exit if already aborted before sleep starts
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
