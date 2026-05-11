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
  // Typed as `unknown` because the vitest alias causes TypeScript to type
  // dynamic root-entrypoint imports as the real public API, while the
  // runtime resolves to the placeholder build via package.json exports.
  surface: unknown,
  expectedRuntime: RuntimeTarget,
): void {
  const s = (surface as unknown) as PlaceholderSurface;
  expect(s.runtimeTarget).toBe(expectedRuntime);
  expect(s.describe()).toEqual({
    implementation: "placeholder",
    runtime: expectedRuntime,
  });
}
