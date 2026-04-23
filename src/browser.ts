import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
} from "./shared.js";

const browserSurface = createPlaceholderSurface("browser");

export const runtimeTarget = browserSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = browserSurface.describe;
