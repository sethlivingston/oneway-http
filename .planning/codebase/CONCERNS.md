# Codebase Concerns

**Analysis Date:** 2026-04-27

## Tech Debt

**Placeholder package released as a real client:**
- Issue: The published surface is still a placeholder scaffold even though `package.json` declares version `0.1.5` and the repository has a release workflow. `src/index.ts`, `src/browser.ts`, `src/node.ts`, and `src/shared.ts` only export `runtimeTarget` and `describe()`, while `README.md` and `docs/SPEC.md` describe a much larger HTTP client contract.
- Files: `package.json`, `README.md`, `docs/SPEC.md`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, `src/shared.ts`, `dist/index.d.ts`
- Impact: Consumers can install `@sethlivingston/oneway-http` expecting request/send behavior and receive a semantically empty API instead. The repository can still publish a green release because the current checks only validate the scaffold.
- Fix approach: Either keep the package clearly marked as scaffold-only in `package.json` and `README.md`, or implement the spec-backed client surface before further stable releases.

**Source/runtime resolution can drift silently:**
- Issue: `tsconfig.json` maps `@sethlivingston/oneway-http*` imports to `src/*.ts`, while `package.json` exports the built `dist/*` files. Type-checking and editor resolution can succeed against source files even if the emitted package diverges.
- Files: `tsconfig.json`, `package.json`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, `dist/index.js`, `dist/browser/index.js`, `dist/node/index.js`
- Impact: Future build-only regressions, missing declarations, or export-map mistakes can slip through local development until consumers install the packaged artifact.
- Fix approach: Add a packed-artifact smoke test that installs the tarball or exercises the published `dist/*` entrypoints from an external fixture instead of relying only on in-repo imports.

**Neutral root build hardcodes the browser surface:**
- Issue: `src/index.ts` always creates the `"browser"` placeholder surface, and `tsup.config.ts` emits that file as the neutral root build. Correct runtime behavior depends on consumers honoring the conditional exports in `package.json`.
- Files: `src/index.ts`, `tsup.config.ts`, `package.json`
- Impact: Any toolchain that falls back to `main` or ignores the `browser`/`node` conditions can load browser behavior in a Node context. This is low impact today because both surfaces are placeholders, but it becomes a real break once the implementations diverge.
- Fix approach: Make the neutral entrypoint safe for unsupported resolvers, or fail loudly when the wrong build is loaded instead of silently presenting browser behavior.

## Known Bugs

**Root import can resolve to the wrong runtime in non-condition-aware tooling:**
- Symptoms: A Node consumer that does not honor `package.json` export conditions can see the browser root surface from `src/index.ts` instead of the node-specific surface from `src/node.ts`.
- Files: `package.json`, `src/index.ts`, `src/node.ts`, `dist/index.js`, `dist/node/index.js`
- Trigger: Importing `@sethlivingston/oneway-http` from bundlers, test runners, or loaders that prefer `main`/default resolution over the `node` condition.
- Workaround: Import `@sethlivingston/oneway-http/node` explicitly until the neutral entrypoint is made runtime-safe.

## Security Considerations

**Release pipeline can publish provenance-backed placeholder code:**
- Risk: `.github/workflows/release-package.yml` verifies quality and runtime parity, but the parity suite only asserts placeholder exports. The workflow can therefore publish a signed, provenance-backed package that does not implement the behavior promised by `docs/SPEC.md`.
- Files: `.github/workflows/release-package.yml`, `tests/parity/entrypoints.test.ts`, `tests/parity/entrypoint-cases.ts`, `README.md`, `docs/SPEC.md`
- Current mitigation: Tag/version matching, npm trusted publishing, and GitHub release creation are in place in `.github/workflows/release-package.yml`.
- Recommendations: Add release-blocking behavior tests for the intended client API, or keep releases on an explicitly pre-release/scaffold channel until `src/` implements the spec.

## Performance Bottlenecks

**Verification cost is dominated by browser infrastructure, not product behavior:**
- Problem: `npm run verify` builds the package and runs four Vitest projects, and both CI and release workflows install Playwright browsers. That cost exists even though the shipped code is only a few small placeholder modules.
- Files: `package.json`, `vitest.config.ts`, `.github/workflows/package-foundation.yml`, `.github/workflows/release-package.yml`
- Cause: Browser parity is treated as release-critical from the start, and every test lane rebuilds or reinstalls the same supporting toolchain.
- Improvement path: Keep fast packaging/export checks on every change, and reserve the full browser matrix for browser-specific behavior once the HTTP client actually contains browser/runtime divergence.

## Fragile Areas

**Entrypoint behavior is spread across config, source, build, and tests:**
- Files: `package.json`, `tsup.config.ts`, `src/index.ts`, `src/browser.ts`, `src/node.ts`, `vitest.config.ts`, `tests/parity/runtime-context.ts`, `tests/parity/entrypoint-cases.ts`
- Why fragile: A single runtime-target change requires coordinated edits across export conditions, build outputs, runtime defines, and parity expectations. Missing one location can break consumers without obvious source-level errors.
- Safe modification: Change entrypoint behavior only as a coordinated package-export change, then verify both explicit subpaths and the root import in Node plus every configured browser project.
- Test coverage: `tests/parity/*.ts` cover the runtime matrix, but there is no tarball-install smoke test and no external-consumer fixture.

**Spec and implementation are far apart:**
- Files: `docs/SPEC.md`, `src/`, `tests/`
- Why fragile: The design surface in `docs/SPEC.md` is large and specific, but `src/` contains no incremental implementation markers, adapters, or test scaffolding for request construction, sending, retries, decoding, or affine-resource enforcement.
- Safe modification: Translate spec sections into executable tests in `tests/` before adding implementation so future work lands in small, verifiable slices instead of one large rewrite.
- Test coverage: There are no behavior tests for the API described in `docs/SPEC.md`; the current suite only checks entrypoint parity.

## Scaling Limits

**Runtime matrix maintenance scales linearly with each supported environment:**
- Current capacity: `vitest.config.ts` hardcodes four projects (`node`, `chromium`, `firefox`, `webkit`), and `.github/workflows/package-foundation.yml` mirrors that split with one Node lane and a browser matrix.
- Limit: Every additional runtime or browser mode increases config surface, CI time, and release validation cost. The release workflow in `.github/workflows/release-package.yml` currently installs all three Playwright browsers before publishing.
- Scaling path: Keep one shared contract suite, isolate truly runtime-specific assertions, and avoid making every browser lane release-blocking until the runtime-specific HTTP behavior exists.

## Dependencies at Risk

**`playwright` and `@vitest/browser-playwright`:**
- Risk: Browser binary installation is an external dependency for both CI and release validation even though the package does not yet perform browser-specific HTTP work.
- Impact: Playwright download outages, OS package changes, or browser-provider breakage can block merges and releases for reasons unrelated to the actual library code.
- Migration plan: Keep lightweight export/parity checks in the default pipeline and move heavyweight browser validation to a narrower set of browser-specific scenarios once `src/browser.ts` contains real logic.

## Missing Critical Features

**The actual HTTP client contract is not implemented:**
- Problem: The behaviors defined in `docs/SPEC.md`—request construction, `send()`, structured result unions, retries, deadlines, response matching, body previews, decode helpers, and matcher helpers—do not exist anywhere under `src/`.
- Blocks: Real consumer usage, meaningful API review, interoperability testing, performance work, and security review of request/response handling are all blocked until the package does more than expose placeholder metadata.

## Test Coverage Gaps

**No tests cover the documented client semantics:**
- What's not tested: Everything described in `docs/SPEC.md` beyond entrypoint selection, including request validation, transport-error normalization, decode behavior, retry rules, deadline handling, and response matching.
- Files: `docs/SPEC.md`, `tests/parity/entrypoints.test.ts`, `tests/parity/entrypoint-cases.ts`
- Risk: The repository can remain green while the real client contract is absent or later implemented incorrectly.
- Priority: High

**No packed-artifact or consumer-install validation exists:**
- What's not tested: The exact npm artifact shape, export-map behavior after packing, and whether an external consumer resolves `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, and `@sethlivingston/oneway-http/node` correctly outside the repository.
- Files: `package.json`, `tsconfig.json`, `tests/`, `.github/workflows/release-package.yml`
- Risk: Source-level and built-package behavior can diverge, especially once the placeholder implementation is replaced with real runtime-specific code.
- Priority: High

**Browser projects intentionally skip the explicit node entrypoint case:**
- What's not tested: Cross-runtime failure modes around importing `@sethlivingston/oneway-http/node` from browser projects.
- Files: `tests/parity/entrypoint-cases.ts`, `tests/parity/runtime-context.ts`
- Risk: Unsupported-resolution behavior stays implicit, so future packaging changes can accidentally expose or break the node subpath without a documented expectation.
- Priority: Medium

---

*Concerns audit: 2026-04-27*
