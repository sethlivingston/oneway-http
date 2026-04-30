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

Publishing is handled by the `Release Package` GitHub Actions workflow, triggered by creating a matching `vX.Y.Z` tag.

### Release Prerequisites

1. This repository must be configured as a trusted publisher for `@sethlivingston/oneway-http` in the npm account settings (OAuth2 OIDC via GitHub Actions).
2. The `npm-publish` GitHub Environment must be created on this repository and configured as needed (optional reviewers, deployment rules, etc.).
3. The `main` branch must be up-to-date and ready for the release version.

### Release Process

1. **Bump the version**: Update `package.json` to the release version (follow semver: `MAJOR.MINOR.PATCH`).
2. **Push to main**: Commit and push the version bump to the `main` branch.
3. **Create the tag**: Create and push a git tag matching the version: `vX.Y.Z` (e.g., `v0.1.5`).

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Release Workflow Details

When the tag is pushed, the `Release Package` workflow:
1. **Validates** the repository in a separate job:
   - Installs dependencies with `npm ci`
   - Installs Playwright browsers for test parity across runtimes
   - Runs the full verification suite (`npm run verify`: typecheck, lint, build, test)
2. **Publishes** (only after validation succeeds):
   - Extracts the version from the tag name (e.g., `v0.1.5` → `0.1.5`)
   - Verifies the tag version matches `package.json`
   - Builds the package
   - Publishes to npm with OIDC trusted publishing and provenance
   - Generates release notes from git commit history
   - Creates a GitHub release with those notes

The workflow uses full git history (`fetch-depth: 0`) to ensure tag and commit history are available for version verification and release notes generation.

### Rollback

If a release fails:
- Delete the tag locally: `git tag -d vX.Y.Z`
- Delete the tag remotely: `git push origin :vX.Y.Z`
- Fix the issue and retry with a new or bumped tag

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
