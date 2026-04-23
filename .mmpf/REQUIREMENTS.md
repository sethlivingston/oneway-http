# Requirements: oneway-http

## Requirements

### Package

- **PKG-01**: The library is published as a single package named `oneway-http` with author metadata for Seth Livingston and repository metadata for `github.com/sethlivingston/oneway-http`.
- **PKG-02**: The package is ESM-only.
- **PKG-03**: The package exposes runtime-specific resolution for Node.js and browser consumers from one package.
- **PKG-04**: The package includes placeholder entrypoints and publish-ready metadata so the repository is structurally ready before HTTP client implementation begins.

### Build

- **BUILD-01**: The library build is driven by `tsup`.
- **BUILD-02**: The build produces browser-targeted and Node.js-targeted outputs plus type declarations from one source package.
- **BUILD-03**: The core package build runs locally through predictable, non-interactive scripts.

### Test

- **TEST-01**: The same complete unit test suite can run in Node.js.
- **TEST-02**: The same complete unit test suite can run in real browser engines: Chromium, Firefox, and WebKit.
- **TEST-03**: The test infrastructure is designed for runtime-parity testing of behavior-sensitive cases, not just packaging smoke tests.

### CI

- **CI-01**: CI runs the build and the full test matrix across Node.js and the browser engines.
- **CI-02a**: An initial CI scaffold is introduced early in infrastructure work to catch package and build regressions before the full test matrix exists.
- **CI-02b**: CI expands to catch packaging, resolution, and runtime-environment regressions once the full parity-oriented test infrastructure is in place.

### Developer Experience

- **DEV-02**: Local scripts make the core development flows obvious: build, test in Node.js, test in browsers, and CI-equivalent verification.

### Repository

- **REPO-01**: The project is initialized as a local Git repository.
- **REPO-02**: The repository is published to GitHub using the `gh` CLI.

## Out of Scope

- Implementing the actual HTTP client behavior described in `docs/SPEC.md`
- Shipping production request, transport, retry, or decode logic
- Proving runtime semantics beyond what the infrastructure, placeholders, and parity-oriented test harness need
- Integrating the `the-typescript-narrows` Claude plugin or ESLint configuration during the scaffold phases
