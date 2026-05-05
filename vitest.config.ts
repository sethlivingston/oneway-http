import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath } from "node:url";
import { defineConfig, type TestProjectConfiguration } from "vitest/config";

const parityInclude: string[] = ["tests/parity/**/*.test.ts"];
const unitInclude: string[] = ["tests/unit/**/*.test.ts"];

function createBrowserProject(
  browser: "chromium" | "firefox" | "webkit",
): TestProjectConfiguration {
  return {
    define: {
      __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: JSON.stringify("browser"),
      __ONEWAY_HTTP_TEST_PROJECT__: JSON.stringify(browser),
    },
    test: {
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser }],
        provider: playwright(),
      },
      include: parityInclude,
      name: browser,
    },
  };
}

export default defineConfig({
  resolve: {
    alias: [
      { find: "@sethlivingston/oneway-http/browser", replacement: fileURLToPath(new URL("./src/browser.ts", import.meta.url)) },
      { find: "@sethlivingston/oneway-http/node", replacement: fileURLToPath(new URL("./src/node.ts", import.meta.url)) },
      { find: "@sethlivingston/oneway-http", replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
    ],
  },
  test: {
    projects: [
      {
        define: {
          __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: JSON.stringify("node"),
          __ONEWAY_HTTP_TEST_PROJECT__: JSON.stringify("node"),
        },
        test: {
          environment: "node",
          include: [...parityInclude, ...unitInclude],
          name: "node",
        },
      },
      createBrowserProject("chromium"),
      createBrowserProject("firefox"),
      createBrowserProject("webkit"),
    ],
  },
});
