# External Integrations

**Analysis Date:** 2026-04-27

## APIs & External Services

**Package publishing and source hosting:**
- npm registry - package distribution target for `@sethlivingston/oneway-http`.
  - SDK/Client: npm CLI invoked from `.github/workflows/release-package.yml` with `npm publish --access public --provenance --ignore-scripts`
  - Auth: GitHub Actions trusted publishing / OIDC in `.github/workflows/release-package.yml`; no static npm token is checked into the repo
- GitHub repository services - source hosting, issues, releases, and workflow execution are wired through `package.json`, `README.md`, `.github/workflows/package-foundation.yml`, and `.github/workflows/release-package.yml`.
  - SDK/Client: GitHub Actions plus `gh` CLI release creation in `.github/workflows/release-package.yml`
  - Auth: `secrets.GITHUB_TOKEN` in `.github/workflows/release-package.yml`

**Browser test infrastructure:**
- Playwright browser binaries - downloaded for cross-runtime verification from `package.json`, `.github/workflows/package-foundation.yml`, and `.github/workflows/release-package.yml`.
  - SDK/Client: `playwright` and `@vitest/browser-playwright`
  - Auth: None required by repository code

**Runtime HTTP services:**
- Not detected - `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `src/shared.ts` do not call any live third-party API, cloud SDK, or remote HTTP service.

## Data Storage

**Databases:**
- Not detected - no database client, ORM, connection string, or persistence layer is present in `src/`, `tests/`, or `package.json`.
  - Connection: Not applicable
  - Client: Not applicable

**File Storage:**
- Local filesystem only for build artifacts and package metadata in `dist/`, `package.json`, and `package-lock.json`.

**Caching:**
- npm dependency caching in GitHub Actions via `actions/setup-node` with `cache: npm` in `.github/workflows/package-foundation.yml` and `.github/workflows/release-package.yml`.
- No application-level cache service is present in `src/`.

## Authentication & Identity

**Auth Provider:**
- None in library runtime code - there is no user auth flow, identity SDK, or token exchange under `src/`.
  - Implementation: Not applicable

**Automation identity:**
- GitHub Actions OIDC trusted publishing is the only concrete auth integration detected, in `.github/workflows/release-package.yml`.
  - Implementation: workflow `id-token: write` permission plus npm trusted publishing configuration described in `README.md`

## Monitoring & Observability

**Error Tracking:**
- None detected - no Sentry, Datadog, Rollbar, or similar client appears in `src/`, `tests/`, or workflow files.

**Logs:**
- CI and release logging rely on GitHub Actions step output in `.github/workflows/package-foundation.yml` and `.github/workflows/release-package.yml`.
- No runtime logging subsystem is implemented in `src/`.

## CI/CD & Deployment

**Hosting:**
- GitHub - repository hosting and workflow execution via `.github/workflows/*.yml`.
- npm - package hosting and distribution target via `package.json` metadata and `.github/workflows/release-package.yml`.
- No server, container platform, or edge deployment target is configured.

**CI Pipeline:**
- GitHub Actions - pull request and `main` branch verification in `.github/workflows/package-foundation.yml`.
- GitHub Actions - tag-based release validation, npm publish, and GitHub release creation in `.github/workflows/release-package.yml`.

## Environment Configuration

**Required env vars:**
- No application runtime environment variables are required by code in `src/`.
- Release workflow uses GitHub-provided context/env values in `.github/workflows/release-package.yml`, including `GITHUB_REF_NAME`, `GITHUB_TOKEN`, and step-local `TAG_VERSION`.
- Tests use build-time defines from `vitest.config.ts` rather than OS environment variables.

**Secrets location:**
- GitHub-managed secrets and identity are expected in GitHub Actions; `README.md` names the `npm-publish` GitHub Environment for publish controls.
- No secret file is read by repository code, and no secret value is stored in tracked source files reviewed here.

## Webhooks & Callbacks

**Incoming:**
- No HTTP webhook endpoints are implemented in `src/`.
- Repository automation reacts to GitHub events only: `push`, `pull_request`, and tag pushes in `.github/workflows/package-foundation.yml` and `.github/workflows/release-package.yml`.

**Outgoing:**
- npm publish requests are sent from `.github/workflows/release-package.yml`.
- GitHub release creation is sent through `gh release create` in `.github/workflows/release-package.yml`.
- Playwright browser downloads are triggered by `npm run test:browser:install` in `package.json` and by `npx playwright install` steps in the workflow files.

---

*Integration audit: 2026-04-27*
