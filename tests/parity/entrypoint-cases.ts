import { expect } from "vitest";

import { expectPlaceholderSurface, type PlaceholderSurface } from "./placeholder-assertions.js";
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
        // In browser/node environments, the conditional export resolves to the platform-specific
        // placeholder build (dist/browser/index.js or dist/node/index.js). TypeScript infers
        // the neutral dist/index.d.ts types here, so a cast is required to test runtime shape.
        const module = (await import("@sethlivingston/oneway-http")) as unknown as PlaceholderSurface;

        expectPlaceholderSurface(module, parityRuntimeContext.expectedRootTarget);
      },
    },
    {
      name: "loads the explicit browser entrypoint",
      run: async () => {
        const module = await import("@sethlivingston/oneway-http/browser");

        expectPlaceholderSurface(module, "browser");
      },
    },
    {
      enabled: parityRuntimeContext.supportsExplicitNodeEntrypoint,
      name: "loads the explicit node entrypoint when the runtime supports it",
      run: async () => {
        const module = await import("@sethlivingston/oneway-http/node");

        expectPlaceholderSurface(module, "node");
      },
    },
  ];
}
