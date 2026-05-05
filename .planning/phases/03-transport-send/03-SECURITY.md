---
phase: 3
slug: transport-send
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-05
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Caller → `performSend()` | Caller passes Request, ClientSpec, optional SendOptions with AbortSignal | Request body, headers, URL — caller-controlled |
| `ClientSpec.fetch` → remote server | Outbound HTTP call through injectable fetch | HTTP request bytes |
| Caller → `options.signal` | External AbortSignal controlled by caller — may fire at any time | Abort reason (DOMException) |
| `setTimeout` callback → `deadlineController.abort()` | Timer fires after effectiveDeadlineMs | Abort reason (DOMException "TimeoutError") |
| `fetch()` throw site → catch block | `fetch()` throws `signal.reason` directly | Error object |
| Remote server → `response.body` stream | Untrusted byte stream; may be large, malformed, or never terminate | Response body bytes |
| `response.body` bytes → `TextDecoder` | Raw bytes decoded to string | UTF-8 text (possibly malformed) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Spoofing | `options?.signal` | mitigate | Pre-abort guard at `send.ts:150-151` checks `signal.aborted` before `request.consume()` | closed |
| T-03-02 | Tampering | `ClientSpec.headers` / `RequestSpec.headers` | mitigate | `mergeEffectiveHeaders()` at `send.ts:45-57` lowercases all keys, filters `undefined` values | closed |
| T-03-03 | Information Disclosure | URL construction | accept | URL passed only to caller-controlled endpoint; no logging or external exposure | closed |
| T-03-04 | Denial of Service | `deadlineMs` validation | mitigate | `deadlineMs <= 0` throws `RangeError` at `send.ts:161-163` before any async work | closed |
| T-03-05 | Elevation of Privilege | `spec.body as BodyInit` cast | accept | Body is caller-supplied; no privilege boundary in single-caller library | closed |
| T-03-06 | Spoofing | `classifyTransportError` — `error.name` access | mitigate | `error instanceof Error ? error.name : ""` at `send.ts:64` — unknown objects yield `""` → safe `"network"` branch | closed |
| T-03-07 | Denial of Service | `deadlineTimer` leak | mitigate | `clearTimeout(deadlineTimer)` in `finally` at `send.ts:224-227` — fires unconditionally | closed |
| T-03-08 | Tampering | DOMException name — silent misclassification | mitigate | `new DOMException("Deadline exceeded", "TimeoutError")` at `send.ts:180-182`; test asserts `error.kind === "timeout"` | closed |
| T-03-09 | Information Disclosure | `combinedSignal` in `AbortSignal.any()` | accept | Function-local variable; never returned or exposed to caller | closed |
| T-03-10 | Elevation of Privilege | `AbortSignal.any([callerSignal, deadlineSignal])` | accept | Only terminates outbound fetch; grants no access to data or system resources | closed |
| T-03-11 | Information Disclosure | Body preview exposes response content | mitigate | `clientSpec.diagnostics?.bodyPreviewBytes ?? 8192` cap at `send.ts:212` | closed |
| T-03-12 | Denial of Service | Response body stream never terminates | mitigate | `maxBytes` while-loop + chunk slice + deadline re-throw at `send.ts:94-117` | closed |
| T-03-13 | Denial of Service | reader not cancelled — TCP socket held open | mitigate | `reader.cancel()` in `finally` at `send.ts:118-123`; cancel errors swallowed | closed |
| T-03-14 | Denial of Service | TextDecoder throws on malformed UTF-8 | mitigate | `TextDecoder("utf-8", { fatal: false })` + try/catch with `text = ""` fallback at `send.ts:134-139` | closed |
| T-03-15 | Tampering | `value.slice(0, remaining)` with large chunk | accept | `slice()` returns independent copy; original chunk not retained; no mutation | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-03 | URL is sent only to the caller-controlled endpoint; the library performs no logging or external exposure. Risk owned by the caller. | gsd-security-auditor | 2026-05-05 |
| AR-03-02 | T-03-05 | `spec.body` is a type-cast on caller-supplied data within a single-caller library. No privilege boundary is crossed; the caller provides and controls the body value. | gsd-security-auditor | 2026-05-05 |
| AR-03-03 | T-03-09 | `combinedSignal` is a function-local variable never returned to the caller. There is no exposure surface. | gsd-security-auditor | 2026-05-05 |
| AR-03-04 | T-03-10 | `AbortSignal.any()` only terminates an outbound fetch; it grants no access to resources or data. | gsd-security-auditor | 2026-05-05 |
| AR-03-05 | T-03-15 | `Uint8Array.slice()` produces an independent copy; the original chunk from the stream is not retained. No caller data is mutated. | gsd-security-auditor | 2026-05-05 |

*Accepted risks do not resurface in future audit runs.*

---

## Closed Mitigations Detail

| Threat ID | Mitigation | Location |
|-----------|------------|----------|
| T-03-01 | Pre-abort guard before `request.consume()` | `send.ts:150-151` |
| T-03-02 | `mergeEffectiveHeaders()` — lowercase keys, filter undefined | `send.ts:45-57` |
| T-03-04 | `deadlineMs <= 0` → `RangeError` before any async work | `send.ts:161-163` |
| T-03-06 | `error instanceof Error ? error.name : ""` in classifier | `send.ts:64` |
| T-03-07 | `clearTimeout(deadlineTimer)` in `finally` block | `send.ts:224-227` |
| T-03-08 | `new DOMException("Deadline exceeded", "TimeoutError")` as abort reason | `send.ts:180-182` |
| T-03-11 | `bodyPreviewBytes ?? 8192` caps preview read | `send.ts:212` |
| T-03-12 | `maxBytes` while-loop + slice cap + re-throw from `readBodyPreview` | `send.ts:94-117` |
| T-03-13 | `reader.cancel()` in `finally` inside `readBodyPreview` | `send.ts:118-123` |
| T-03-14 | `TextDecoder("utf-8", { fatal: false })` + try/catch with `text = ""` fallback | `send.ts:134-139` |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-05 | 15 | 15 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-05
