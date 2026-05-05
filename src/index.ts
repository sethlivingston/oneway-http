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

// Body value (factory methods: Body.none(), Body.json(), etc.)
// NOTE: `import type { Body }` resolves to the factory namespace type.
// To annotate opaque body instances, use: type BodyValue = ReturnType<typeof Body.none>
// TypeScript 6 with verbatimModuleSyntax does not allow re-exporting a value and a type
// under the same name from different modules into the same file.
export { Body } from "./body.js";

// Decoder class and Decode namespace (Decode.none(), Decode.json(), etc.)
export { Decoder, Decode } from "./decode.js";

// Type-only exports — nominal types and structured result types
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
