export type RuntimeTarget = "browser" | "node";

export interface PlaceholderDescription {
  readonly implementation: "placeholder";
  readonly runtime: RuntimeTarget;
}

export interface OnewayHttpSurface {
  readonly runtimeTarget: RuntimeTarget;
  describe: () => PlaceholderDescription;
}

export function createPlaceholderSurface(
  runtimeTarget: RuntimeTarget,
): OnewayHttpSurface {
  return {
    runtimeTarget,
    describe: () => ({
      implementation: "placeholder",
      runtime: runtimeTarget,
    }),
  };
}
