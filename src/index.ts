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
