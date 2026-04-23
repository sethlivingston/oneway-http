import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
  type RuntimeTarget,
} from "./shared.js";

const rootSurface = createPlaceholderSurface("browser");

export const runtimeTarget: RuntimeTarget = rootSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = rootSurface.describe;
