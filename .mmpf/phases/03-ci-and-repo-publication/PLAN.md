---
phase: 3
name: ci and repo publication
requirements: [CI-01, CI-02b, REPO-01, REPO-02]
depends_on: [1, 2]
---

# Phase 3: ci and repo publication

## Goal

The repository is version-controlled, published to GitHub, and protected by CI that runs the build plus the full Node.js and browser-engine test matrix.

## Truths

Verifiable assertions that prove the goal is met:

- [ ] A GitHub Actions workflow runs the repository build and the complete Node.js, Chromium, Firefox, and WebKit verification suite.
- [ ] The local repository is initialized as Git and has an initial conventional-commit history that reflects the scaffolded infrastructure work.
- [ ] The GitHub repository `sethlivingston/oneway-http` exists and the local repository is connected to it through the normal `origin` remote.
- [ ] The documented verification flow for developers matches the workflow exercised in CI closely enough to minimize "works locally but not in CI" gaps.

## Threats

- **T1**: CI workflows could run with broader GitHub permissions than needed or expose sensitive data in logs -> Use minimal workflow permissions, avoid hardcoded secrets, and keep authentication in local `gh` usage rather than committed configuration.
- **T2**: Repository publication could create an incorrect remote target or accidental public state that is hard to unwind -> Explicitly configure the intended `sethlivingston/oneway-http` remote and verify remote settings before pushing.

## Tasks

### Task 1: Create CI workflow and verification wiring
Add GitHub Actions workflow files and any supporting scripts needed to run the agreed build and parity test matrix in automation.

Acceptance criteria: CI covers the same major verification flow as local development, browser-engine lanes are explicit, and failures point to the affected runtime or build step.

### Task 2: Ensure Git history is conventional and ready to publish
Initialize the repository as Git if it is not already, stage the infrastructure scaffold in coherent units, and ensure the existing local history uses conventional commit messages without parenthetical scopes.

Acceptance criteria: the repository has a usable local history, commit messages follow the requested convention, and the resulting history is ready to push.

### Task 3: Publish the repository to GitHub with gh
Use the `gh` CLI to create or connect the `sethlivingston/oneway-http` GitHub repository and push the local history.

Acceptance criteria: the GitHub repository exists at the agreed location, the local `origin` remote points there, and the initial branch is published.
