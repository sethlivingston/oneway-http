import { defineConfig, type Options } from "tsup";

const sharedOptions: Pick<
  Options,
  "bundle" | "dts" | "format" | "sourcemap" | "splitting" | "target" | "treeshake"
> = {
  bundle: true,
  dts: true,
  format: ["esm"],
  sourcemap: false,
  splitting: false,
  target: "es2022",
  treeshake: true,
};

export default defineConfig([
  {
    ...sharedOptions,
    clean: true,
    entry: {
      index: "src/browser.ts",
    },
    outDir: "dist/browser",
    platform: "browser",
  },
  {
    ...sharedOptions,
    clean: false,
    entry: {
      index: "src/node.ts",
    },
    outDir: "dist/node",
    platform: "node",
  },
]);
