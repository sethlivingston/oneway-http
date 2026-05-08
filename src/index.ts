// src/index.ts — public API surface for @sethlivingston/oneway-http
// Scaffolding exports (runtimeTarget, describe) removed per D-06.

// Body value type and producers (Body.none(), Body.json(), Body.text(), Body.bytes(), Body.formUrlEncoded())
export { Body } from "./body.js";

// Decoder class and Decode namespace producers (Decode.none(), Decode.json(), Decode.text(), etc.)
export { Decoder, Decode } from "./decode.js";

// Request class — use Request.create() to build a typed request
export { Request } from "./request.js";

// Client factory — use createClient(spec) to build a Client instance
export { createClient } from "./client.js";
export type { Client } from "./client.js";

// Send.match() dispatcher and Matcher<R,T> exhaustive handler type
export { Send } from "./matcher.js";
export type { Matcher } from "./matcher.js";

// All public types
export type {
  Method,
  QueryValue,
  StatusMatcher,
  Schema,
  DecodeIssue,
  DecodeError,
  BodyPreview,
  TransportError,
  RequestError,
  SendResult,
  DecoderLike,
  TaggedEntry,
  ResponseMap,
  InferResponseUnion,
  RetryOptions,
  RetryPolicy,
  RequestSpecBase,
  RequestSpec,
  SendOptions,
  ClientSpec,
} from "./types.js";
