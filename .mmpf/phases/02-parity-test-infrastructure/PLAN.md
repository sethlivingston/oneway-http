---
phase: 2
name: parity test infrastructure
requirements: [TEST-01, TEST-02, TEST-03, DEV-02]
depends_on: [1]
---

# Phase 2: parity test infrastructure

## Goal

The repository can run one parity-oriented unit test suite across Node.js, Chromium, Firefox, and WebKit using a test harness that is ready for runtime-sensitive HTTP client behavior.

## Truths

Verifiable assertions that prove the goal is met:

- [ ] A single test authoring pattern is shared across Node.js and browser-engine runs rather than maintaining separate disconnected suites.
- [ ] The full unit suite can be executed in Node.js and in real Chromium, Firefox, and WebKit browser engines from repository scripts.
- [ ] The initial test harness includes placeholder parity-oriented cases that prove runtime-specific execution paths and shared expectations are wired correctly.
- [ ] A repository-level verification command exists for developers to run the same build-and-test flow expected by CI.

## Tasks

### Task 1: Configure the cross-runtime test runner
Add the test tooling needed to run the suite in Node.js and real browser engines. Use a configuration that makes Chromium, Firefox, and WebKit first-class targets instead of optional smoke lanes.

Acceptance criteria: test runner configuration is committed, all agreed runtimes are represented, and repository scripts can invoke Node-only, browser-only, and full verification flows.

### Task 2: Build a parity-oriented test harness
Create the shared test layout, helpers, and placeholder fixtures needed to express the same behavioral expectations across runtimes.

Acceptance criteria: tests are not duplicated by copy-paste per runtime, the harness leaves room for future decode-error and transport-shaping cases, and runtime-specific setup is isolated to clear boundaries.

### Task 3: Add initial placeholder parity tests
Add placeholder tests that validate package loading, runtime-specific entrypoint selection, and cross-runtime execution of the shared suite.

Acceptance criteria: the tests prove the infrastructure is correctly wired, failures clearly identify the runtime that broke, and the suite is ready to grow into full HTTP client behavior coverage.
