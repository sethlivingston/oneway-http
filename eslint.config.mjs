import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import tsnarrows from "@sethlivingston/eslint-plugin-typescript-narrows";

const typeAwareNarrowsConfig = [
  ...tsnarrows.configs.strict,
  ...tsnarrows.configs.test,
  ...tsnarrows.configs.tooling,
].map((config) => ({
  ...config,
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        }),
      ],
    },
  },
  ...typeAwareNarrowsConfig,
];
