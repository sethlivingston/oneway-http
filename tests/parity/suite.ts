import { describe, it } from "vitest";

import { createEntrypointParityCases } from "./entrypoint-cases.js";
import { parityRuntimeContext } from "./runtime-context.js";

export function defineEntrypointParitySuite(): void {
  describe(`entrypoint parity (${parityRuntimeContext.projectName})`, () => {
    for (const parityCase of createEntrypointParityCases()) {
      if (parityCase.enabled === false) {
        it.skip(parityCase.name, parityCase.run);
        continue;
      }

      it(parityCase.name, parityCase.run);
    }
  });
}
