import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const parityInclude = ["tests/parity/**/*.test.ts"];

function createBrowserProject(
  browser: "chromium" | "firefox" | "webkit",
) {
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
  test: {
    projects: [
      {
        define: {
          __ONEWAY_HTTP_EXPECTED_ROOT_TARGET__: JSON.stringify("node"),
          __ONEWAY_HTTP_TEST_PROJECT__: JSON.stringify("node"),
        },
        test: {
          environment: "node",
          include: parityInclude,
          name: "node",
        },
      },
      createBrowserProject("chromium"),
      createBrowserProject("firefox"),
      createBrowserProject("webkit"),
    ],
  },
});
