import { expect } from "vitest";

import type {
  PlaceholderDescription,
  RuntimeTarget,
} from "../../src/shared.js";

export interface PlaceholderSurface {
  readonly runtimeTarget: RuntimeTarget;
  describe: () => PlaceholderDescription;
}

export function expectPlaceholderSurface(
  surface: PlaceholderSurface,
  expectedRuntime: RuntimeTarget,
): void {
  expect(surface.runtimeTarget).toBe(expectedRuntime);
  expect(surface.describe()).toEqual({
    implementation: "placeholder",
    runtime: expectedRuntime,
  });
}
