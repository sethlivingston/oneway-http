# oneway-http

`oneway-http` is a runtime-aware TypeScript HTTP client scaffold that is being built for both Node.js and browser consumers from a single ESM package.

The published npm package is `@sethlivingston/oneway-http`.

The repository currently focuses on package structure, build tooling, and runtime-parity verification. The actual HTTP client behavior described in `docs/SPEC.md` has not been implemented yet.

## Development

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the shared, browser, and node entrypoints with `tsup`. |
| `npm run typecheck` | Run the TypeScript no-emit check. |
| `npm run lint` | Run the repository ESLint configuration. |
| `npm run test:node` | Run the parity suite in the Node.js project. |
| `npm run test:chromium` | Run the parity suite in Chromium. |
| `npm run test:firefox` | Run the parity suite in Firefox. |
| `npm run test:webkit` | Run the parity suite in WebKit. |
| `npm run test:browser:install` | Install the local Playwright browser binaries used by the browser projects. |
| `npm run verify` | Run the closest local equivalent to CI: typecheck, lint, build, and the full runtime parity suite. |

## CI

GitHub Actions runs the same major verification flow in explicit lanes:

- quality checks for typecheck, lint, and build
- a dedicated Node.js parity lane
- dedicated Chromium, Firefox, and WebKit parity lanes

That split keeps runtime-specific failures isolated while still matching the repository's local development scripts closely.

## Release

Publishing is handled by the `Release Package` GitHub Actions workflow.

1. Ensure the npm package `@sethlivingston/oneway-http` trusts this repository's `release-package.yml` workflow for trusted publishing.
2. Configure the `npm-publish` GitHub Environment with any required reviewers before enabling automated publish.
3. Bump `package.json` to the release version, push to `main`, and create a matching `vX.Y.Z` tag.

When that tag is pushed, the workflow validates the repository, publishes the package to npm with provenance, and creates the matching GitHub release.
