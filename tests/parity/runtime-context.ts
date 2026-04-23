import type { RuntimeTarget } from "../../src/shared.js";

type ParityProjectName = "node" | "chromium" | "firefox" | "webkit";

declare const __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: RuntimeTarget;
declare const __ONEWAY_HTTP_TEST_PROJECT__: ParityProjectName;

export interface ParityRuntimeContext {
  readonly expectedRootTarget: RuntimeTarget;
  readonly isBrowserProject: boolean;
  readonly projectName: ParityProjectName;
  readonly supportsExplicitNodeEntrypoint: boolean;
}

export const parityRuntimeContext: ParityRuntimeContext = {
  expectedRootTarget: __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__,
  isBrowserProject: __ONEWAY_HTTP_TEST_PROJECT__ !== "node",
  projectName: __ONEWAY_HTTP_TEST_PROJECT__,
  supportsExplicitNodeEntrypoint: __ONEWAY_HTTP_TEST_PROJECT__ === "node",
};
