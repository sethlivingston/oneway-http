import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
  type RuntimeTarget,
} from "./shared.js";

const rootSurface = createPlaceholderSurface(
  typeof globalThis.document !== "undefined" ? "browser" : "node",
);

export const runtimeTarget: RuntimeTarget = rootSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = rootSurface.describe;

// --- Phase 4: Body producers, decoders, and associated types ---

// Body namespace value (factory methods: Body.none(), Body.json(), etc.)
export { Body } from "./body.js";

// Decoder class and Decode namespace (Decode.none(), Decode.json(), etc.)
export { Decoder, Decode } from "./decode.js";

// Type-only exports — nominal types and structured result types
// Body type (declare class) is re-exported via body.ts which body.js's export { Body } carries
export type {
  RequestError,
  SendResult,
  DecodeError,
  DecodeIssue,
  BodyPreview,
  TransportError,
} from "./types.js";

// RequestSpec is the primary request configuration type
export type { RequestSpec } from "./types.js";
