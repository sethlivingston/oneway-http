# External Integrations

**Analysis Date:** 2026-05-04

## APIs & External Services

**None (runtime):**
- This library has zero production dependencies and makes no calls to external APIs at runtime.
- It is an HTTP client library itself — callers supply their own endpoints.

## Data Storage

**Databases:** None — not applicable for a client library.

**File Storage:** Not applicable.

**Caching:** Not applicable.

## Authentication & Identity

**Auth Provider:** None — the library does not implement authentication. It is designed to carry auth headers/credentials as part of the caller-supplied request spec.

## Monitoring & Observability

**Error Tracking:** None configured.

**Logs:** None — no logging infrastructure. Transport failures are returned as structured values per the library's core principle (errors are values, not exceptions).

## CI/CD & Deployment

**Hosting / Registry:**
- Published to **npm** as `@sethlivingston/oneway-http` (public, scoped package)
- Registry URL: `https://registry.npmjs.org/`

**CI Pipeline:**
- **GitHub Actions** — two workflows in `.github/workflows/`

  | Workflow | File | Trigger |
  |---|---|---|
  | CI (quality + tests) | `.github/workflows/package-foundation.yml` | Push to `main`, pull requests |
  | Release Package | `.github/workflows/release-package.yml` | Push of `v*` tags |

**CI Jobs (`package-foundation.yml`):**
- `quality` — typechecks, lints, and builds on Ubuntu / Node 24
- `node` — runs `npm run test:node` (Vitest Node project)
- `browsers` (matrix) — runs `npm run test:chromium`, `test:firefox`, `test:webkit` via Playwright on Ubuntu / Node 24

**Release Job (`release-package.yml`):**
- `validate` — runs full `npm run verify` (typecheck + lint + all tests) including Playwright browser install
- `publish` — runs `npm publish --access public --provenance` using `NODE_AUTH_TOKEN` from the `npm-publish` GitHub environment; requires `id-token: write` for npm provenance attestation
- Creates a GitHub Release with auto-generated notes from `git log` range between tags

**Dependency Automation:**
- **Dependabot** (`.github/dependabot.yml`) — weekly checks for both `github-actions` and `npm` package updates

## Webhooks & Callbacks

**Incoming:** None.

**Outgoing:** None.

## Environment Configuration

**Required env vars (CI only):**
- `NODE_AUTH_TOKEN` — npm publish token; set via GitHub Actions `npm-publish` environment secret
- `GH_TOKEN` — automatically provided by GitHub Actions (`secrets.GITHUB_TOKEN`) for creating GitHub Releases

**Secrets location:**
- GitHub Actions environment named `npm-publish` (holds npm token)
- No `.env` files; no secrets required for local development or testing

## Browser Platform Integration

**Playwright** (`^1.59.1`) — used exclusively for cross-browser test execution (not for production HTTP transport):
- Test provider: `@vitest/browser-playwright` bridging Vitest ↔ Playwright
- Browsers tested: Chromium, Firefox, WebKit (all headless)
- Install command: `npm run test:browser:install` → `playwright install chromium firefox webkit`
- In CI, installed with: `npx playwright install --with-deps chromium firefox webkit`

---

*Integration audit: 2026-05-04*
