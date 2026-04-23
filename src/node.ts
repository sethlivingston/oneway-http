import {
  createPlaceholderSurface,
  type OnewayHttpSurface,
} from "./shared.js";

const nodeSurface = createPlaceholderSurface("node");

export const runtimeTarget = nodeSurface.runtimeTarget;
export const describe: OnewayHttpSurface["describe"] = nodeSurface.describe;
