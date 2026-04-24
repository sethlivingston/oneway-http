---
phase: 1
completed: 2026-04-23
commits: [b14f077, e2e7ca5, 47a2df9, 4bf078d, c3b9eff]
---

# Phase 1: Done

## What Was Built

Established the initial `oneway-http` package scaffold as a single ESM-only TypeScript package with publish-ready metadata, `tsup`-driven root, browser, and Node.js builds, runtime-specific exports, placeholder entrypoints for each runtime, and an initial GitHub Actions workflow that installs dependencies and runs the scaffold verification flow.

## Truths Verified

- [x] `package.json` identifies the package as `oneway-http`, includes Seth Livingston and `github.com/sethlivingston/oneway-http`, and declares an ESM-only package surface. — Verified from `package.json` fields (`name`, `author`, `homepage`, `repository`, `type: "module"`) and the absence of any CommonJS export conditions.
- [x] The package exports and source layout provide distinct Node.js and browser entrypoints from one package without creating separate publishable packages. — Verified by self-importing `oneway-http`, `oneway-http/browser`, and `oneway-http/node`, which resolved to the expected placeholder runtime targets from one package.
- [x] Running the package build emits browser-targeted output, Node.js-targeted output, and type declarations through tsup. — Verified by `npm run verify`, which produced `dist/index.*`, `dist/browser/index.*`, and `dist/node/index.*` successfully.
- [x] An initial CI workflow exists early enough to validate the package build scaffold before the full cross-runtime test matrix is added. — Verified from `.github/workflows/package-foundation.yml`, which triggers on `push` to `main` and `pull_request`, runs `npm ci`, and then runs `npm run verify`.

## Tests

No test files were added in this scaffold phase. Verification coverage came from the repository's existing commands and package-shape checks: `npm run verify`, self-import checks for `oneway-http`, `oneway-http/browser`, and `oneway-http/node`, plus `npm pack --dry-run` to confirm publish contents.

## Code Review

### Medium

- Duplicate `sourceMappingURL` comments in generated JS created a downstream source-map risk. Fixed by disabling source-map emission in the scaffold `tsup` build.
- The root `"."` export forced Node.js declaration files for all consumers. Fixed by nesting browser and node runtime conditions with target-aware declaration paths in `package.json`.
- The root fallback still mixed browser runtime code with node-specific declarations for unmatched conditions. Fixed by adding a shared root declaration build and pointing the root `types` fallback to `dist/index.d.ts`.

## Notes

- Deviation from plan: `the-typescript-narrows` plugin and ESLint-config integration were removed from scope during execution at the user's direction so Phase 1 stayed focused on the package scaffold.
- Git initialization happened during Phase 1 execution to support atomic commits and later diff-based review, while GitHub publication remains scoped to Phase 3.
- Independent verification passed all four truths and reported no remaining gaps after the final root-types fix.
