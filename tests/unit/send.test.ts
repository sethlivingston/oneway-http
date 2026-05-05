import { describe, it } from "vitest";
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
  it.todo("throws RangeError when clientSpec.deadlineMs is 0");
  it.todo("throws RangeError when clientSpec.deadlineMs is -1");
  it.todo("throws RangeError when requestSpec.deadlineMs is 0");
  it.todo("does not throw when deadlineMs is 1 (positive)");
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
  it.todo("request deadlineMs overrides client deadlineMs when both present");
  it.todo("client deadlineMs used when request has no deadlineMs");
});

describe("SEND-06: AbortSignal.any() composition (D-09)", () => {
  it.todo("deadline fires → { kind: 'transportError', error: { kind: 'timeout' } }");
  it.todo("caller abort → { kind: 'transportError', error: { kind: 'aborted' } }");
  it.todo("clearTimeout fires in finally even when fetch() throws");
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
