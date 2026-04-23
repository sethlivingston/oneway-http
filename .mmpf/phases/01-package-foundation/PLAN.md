---
phase: 1
name: package foundation
requirements: [PKG-01, PKG-02, PKG-03, PKG-04, BUILD-01, BUILD-02, BUILD-03, CI-02a]
depends_on: []
---

# Phase 1: package foundation

## Goal

The repository builds as a single ESM-only TypeScript package with tsup, publish-ready metadata, and runtime-specific entrypoints for Node.js and browsers.

## Truths

Verifiable assertions that prove the goal is met:

- [ ] `package.json` identifies the package as `oneway-http`, includes Seth Livingston and `github.com/sethlivingston/oneway-http`, and declares an ESM-only package surface.
- [ ] The package exports and source layout provide distinct Node.js and browser entrypoints from one package without creating separate publishable packages.
- [ ] Running the package build emits browser-targeted output, Node.js-targeted output, and type declarations through tsup.
- [ ] An initial CI workflow exists early enough to validate the package build scaffold before the full cross-runtime test matrix is added.

## Tasks

### Task 1: Create package manifest and dependency baseline
Create `package.json` with the final package identity, ESM-only configuration, initial scripts, and dependency metadata.

Execution note: initialize local Git before the first commit if needed so Phase 1 can preserve atomic commits and support diff-based review. GitHub publication remains Phase 3 work.

Acceptance criteria: package metadata matches the agreed project identity, scripts are non-interactive and predictable, and dependency installation works through the normal package-manager flow.

### Task 2: Add TypeScript and tsup build configuration
Create the TypeScript compiler configuration and tsup configuration needed to build a single package with browser-targeted and Node.js-targeted outputs plus type declarations.

Acceptance criteria: the build configuration is committed to the repo, output structure is intentional and inspectable, and the build can be invoked from package scripts.

### Task 3: Create placeholder runtime entrypoints and package exports
Add the initial source tree and placeholder entrypoints for shared, Node.js, and browser surfaces. Wire `exports` and related publish metadata so consumers resolve the correct runtime-specific entrypoint from one package.

Acceptance criteria: source placeholders compile, package exports are explicit, and the package is structurally ready for later HTTP client implementation without redoing the layout.

### Task 4: Add an early CI scaffold for package validation
Create an initial GitHub Actions workflow that validates the phase 1 package scaffold, such as dependency install and build, before the full parity test matrix is available.

Acceptance criteria: CI exists during early infrastructure work, the workflow exercises the package build path, and later phases can extend it rather than replacing it wholesale.
