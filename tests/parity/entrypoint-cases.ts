import { expect } from "vitest";

import { expectPlaceholderSurface } from "./placeholder-assertions.js";
import { parityRuntimeContext } from "./runtime-context.js";

interface ParityCase {
  readonly enabled?: boolean;
  readonly name: string;
  readonly run: () => void | Promise<void>;
}

export function createEntrypointParityCases(): readonly ParityCase[] {
  return [
    {
      name: "executes the shared parity suite in the configured runtime",
      run: (): void => {
        expect(parityRuntimeContext.projectName.length).toBeGreaterThan(0);
        expect(parityRuntimeContext.expectedRootTarget).toMatch(
          /^(browser|node)$/,
        );
      },
    },
    {
      name: `loads the root package entrypoint for ${parityRuntimeContext.expectedRootTarget}`,
      run: async () => {
        const module = await import("@slivingston/oneway-http");

          expectPlaceholderSurface(
            module,
            parityRuntimeContext.expectedRootTarget,
          );
      },
    },
    {
      name: "loads the explicit browser entrypoint",
      run: async () => {
        const module = await import("@slivingston/oneway-http/browser");

        expectPlaceholderSurface(module, "browser");
      },
    },
    {
      enabled: parityRuntimeContext.supportsExplicitNodeEntrypoint,
      name: "loads the explicit node entrypoint when the runtime supports it",
      run: async () => {
        const module = await import("@slivingston/oneway-http/node");

        expectPlaceholderSurface(module, "node");
      },
    },
  ];
}
