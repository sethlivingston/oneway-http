# Codebase Concerns

**Analysis Date:** 2026-05-04

---

## Tech Debt

**Entire library is a placeholder scaffold:**
- Issue: All three entrypoints (`src/index.ts`, `src/browser.ts`, `src/node.ts`) export only `createPlaceholderSurface(...)`. No HTTP client behavior exists. `docs/SPEC.md` defines the full target contract — request model, response matching, body decoding, retry, deadline, abort — but none of it is implemented.
- Files: `src/index.ts`, `src/browser.ts`, `src/node.ts`, `src/shared.ts`
- Impact: The published package `@sethlivingston/oneway-http` is a structural scaffold only. Every feature described in `docs/SPEC.md` (the entire `send()`, `Request`, `Body`, `Decode`, `Send.match` surface) is missing.
- Fix approach: Implement the spec incrementally: transport layer, request model, response matching, body decoders, retry/deadline logic, then the typed matcher helper.

**`ignoreDeprecations: "6.0"` in tsconfig.json:**
- Issue: `tsconfig.json` sets `"ignoreDeprecations": "6.0"` to suppress deprecation warnings about `module: "NodeNext"` and `moduleResolution: "NodeNext"`, which TypeScript 6 deprecated.
- Files: `tsconfig.json` line 15
- Impact: TypeScript's upgrade path is silently bypassed. Downstream TS6+ stricter module resolution behavior may surface unexpected errors when the flag is eventually removed or TypeScript drops support.
- Fix approach: Migrate `module`/`moduleResolution` to whatever TypeScript 6 recommends as the replacement (likely `module: "Preserve"` with `moduleResolution: "Bundler"` or a revised NodeNext equivalent) and remove `ignoreDeprecations`.

**No `engines` field in `package.json`:**
- Issue: `package.json` declares no `engines` constraint. CI uses Node 24, but consumers on older Node versions receive no warning.
- Files: `package.json`
- Impact: The future implementation requires `AbortSignal.any()` (Node 20+) to combine caller-supplied `AbortSignal` with deadline `AbortController`. Consumers on Node 18 or earlier would encounter a runtime error with no prior notice.
- Fix approach: Add `"engines": { "node": ">=20" }` (or `>=22` depending on final runtime compatibility decisions) before shipping the implementation.

**Zod not yet a dependency, no adapter interface defined:**
- Issue: `docs/SPEC.md` explicitly commits to Zod for `Decode.json(schema)` and states the public decode contract should remain thin enough to later swap to Valibot. Neither Zod nor any adapter abstraction exists in `package.json` or source.
- Files: `package.json`, `docs/SPEC.md` lines 396–402
- Impact: When implementation begins, the Zod version (peer vs. regular dependency), how schema errors are normalized to `DecodeIssue[]`, and the swap path to Valibot are all undefined. Coupling too tightly to Zod's public API early makes the swap harder.
- Fix approach: Define a thin schema-adapter interface before wiring Zod. Add Zod as a peer dependency (consumers should own their Zod version) or as a regular dependency with a clear adapter seam.

**`dist/` must exist before tests run:**
- Issue: Test cases dynamically import `@sethlivingston/oneway-http`, `@sethlivingston/oneway-http/browser`, and `@sethlivingston/oneway-http/node`. These resolve via ESM self-referencing to the `dist/` folder. Running `vitest run` directly without a prior build silently fails to resolve those imports.
- Files: `tests/parity/entrypoint-cases.ts` lines 25–49, `vitest.config.ts`, `package.json` (pretest scripts)
- Impact: Developers who invoke `npx vitest run` or `vitest` directly (outside npm scripts) hit unresolvable imports. No guardrail or warning exists.
- Fix approach: Add a Vite `resolve.alias` in `vitest.config.ts` that maps the package name to source entrypoints for each project, removing the dist dependency from the test layer entirely.

---

## Known Bugs

**Neutral entrypoint hardcodes `"browser"` as runtime target:**
- Symptoms: Importing `@sethlivingston/oneway-http` from a runtime that resolves without a `browser` or `node` export condition (Deno, Bun, edge workers, any tooling environment that does not set these conditions) receives `runtimeTarget: "browser"` from the neutral build.
- Files: `src/index.ts` line 7, `dist/index.js` (built output), `package.json` exports `"."` fallback
- Trigger: Any consumer runtime that hits the root `"."` `default` export condition rather than the `browser` or `node` conditions.
- Workaround: Use the explicit subpath entrypoints `@sethlivingston/oneway-http/browser` or `@sethlivingston/oneway-http/node` until the neutral build is corrected.

---

## Security Considerations

**Hardcoded npm and action versions without a single-source-of-truth:**
- Risk: The known-good npm version (`npm@11.13.0`) is hardcoded as a shell command in every CI job (`npm install --global npm@11.13.0`). GitHub Action SHAs are pinned but managed separately from the npm lockfile. Divergence between jobs is possible and would not be caught by Dependabot until a PR is opened for each.
- Files: `.github/workflows/package-foundation.yml` lines 35, 68, 100; `.github/workflows/release-package.yml` lines 32, 64
- Current mitigation: SHA-pinned actions (no floating tag refs); Dependabot weekly updates for both `github-actions` and `npm` ecosystems via `.github/dependabot.yml`.
- Recommendations: Consider a reusable workflow or composite action to centralize the npm installation step, reducing the number of places the pinned version must be updated.

**Release workflow `contents: write` scope is broader than needed per job:**
- Risk: The `publish` job in `release-package.yml` holds `contents: write` (needed for GitHub release creation) alongside `id-token: write` (needed for OIDC npm publishing). Both are in the same job.
- Files: `.github/workflows/release-package.yml` lines 53–55
- Current mitigation: The `npm-publish` environment gate provides an additional approval layer.
- Recommendations: Split the publish job into two jobs — one for npm publish (`id-token: write`, `contents: read`) and one for GitHub release creation (`contents: write`, no `id-token: write`) — to apply least-privilege per job step.

---

## Performance Bottlenecks

**Not applicable at current state.** The library contains no implementation code. Performance analysis is deferred until the HTTP transport, body reading, and decoding layers are built. Key areas to benchmark at implementation time:
- Body preview truncation (`diagnostics.bodyPreviewBytes` default 8192) for large-body responses
- Retry backoff jitter calculation under high-volume usage
- JSON decode path for large response payloads (especially `Decode.json(schema)` with Zod)

---

## Fragile Areas

**Vitest define-based runtime context injection:**
- Files: `vitest.config.ts` lines 10–13, `tests/parity/runtime-context.ts` lines 5–6
- Why fragile: `__ONEWAY_HTTP_EXPECTED_ROOT_TARGET__` and `__ONEWAY_HTTP_TEST_PROJECT__` are injected via Vitest's `define` block and declared as bare `declare const` globals. If a project definition omits a define key, TypeScript will not catch it — the constant will be `undefined` at runtime and the test suite will silently produce incorrect expectations.
- Safe modification: Any new Vitest project must include both defines. Consider extracting a `createParityProject()` helper that enforces both keys so the defines cannot be partially omitted.
- Test coverage: The first parity case checks `parityRuntimeContext.projectName.length > 0` and `expectedRootTarget` matches `browser|node`, which partially guards against undefined injection, but does not fail with a clear message.

**Three-bundle tsup build shares a single `sharedOptions` object without type enforcement:**
- Files: `tsup.config.ts`
- Why fragile: `sharedOptions` uses a `Pick<Options, ...>` intersection but tsup's `Options` typing does not prevent `platform` from inadvertently leaking through spread. Adding a new property to `sharedOptions` that has platform-specific meaning (e.g., `external`) would silently apply it to all three builds.
- Safe modification: Document intentional per-build overrides as explicit properties (not spread mutations) and verify each build's output when adding shared options.

---

## Scaling Limits

**Single-file source per entrypoint:**
- Current capacity: Each entrypoint (`src/index.ts`, `src/browser.ts`, `src/node.ts`) is a single file.
- Limit: As the HTTP client implementation grows, all three files will need to import from a shared implementation layer. The current flat `src/` structure has no subdirectory conventions for that growth.
- Scaling path: Introduce `src/internal/` for shared runtime-agnostic implementation, `src/internal/node/` for Node-specific adapters (e.g., native `fetch` configuration, stream handling), and `src/internal/browser/` for browser-specific adapters. Entrypoints remain thin wrappers that re-export from the internal layer.

---

## Dependencies at Risk

**`@sethlivingston/eslint-plugin-typescript-narrows` is a private/personal plugin:**
- Risk: This is a `@sethlivingston`-namespaced package with no public documentation linked in the repository. Its availability depends entirely on the maintainer's npm account.
- Files: `package.json` devDependency, `eslint.config.mjs` lines 2, 4
- Impact: A version bump, rename, or npm account issue would break `npm ci` and fail CI quality checks.
- Migration plan: Document the plugin's rules in `copilot-instructions.md` or `docs/`; keep a fork or mirror if the plugin becomes unavailable.

**All devDependencies use `^` semver ranges:**
- Risk: Major version updates to `vitest`, `tsup`, `eslint`, `typescript`, or `playwright` could be picked up by Dependabot PRs that pass CI on the current placeholder source but introduce breaking changes during the implementation phase.
- Files: `package.json` devDependencies
- Impact: Low now (no implementation to break), but increases as HTTP implementation is added.
- Migration plan: Review Dependabot PRs against the spec's compatibility requirements (especially `AbortSignal.any()`, streaming body APIs) as implementation progresses.

---

## Missing Critical Features

**Entire HTTP client surface is unimplemented:**
- Problem: `send()`, `Request.*`, `Body.*`, `Decode.*`, `Send.match()` — the complete public API defined in `docs/SPEC.md` — does not exist.
- Blocks: The package cannot be used for its intended purpose. All consumers would receive only placeholder runtime-target information.

**No response-body streaming or disposal implementation:**
- Problem: The spec (`docs/SPEC.md` lines 333–334) states `Decode.discard()` "safely disposes of [the body] without exposing a value — disposal strategy is implementation-defined: cancel or drain". Neither the disposal strategy nor the affine-resource runtime enforcement (spec principle 8) is designed beyond the spec text.
- Blocks: Correct body lifecycle management across Node.js (which has distinct fetch/stream behaviors) and browsers requires explicit implementation decisions before the rest of the decoder surface can be implemented correctly.

**No header-deletion mechanism:**
- Problem: `docs/SPEC.md` lines 113–116 explicitly documents: "This version of the spec does not provide a mechanism for explicitly removing inherited headers or query parameters." A client-level default header cannot be suppressed per-request.
- Blocks: Consumers cannot opt out of a client-default `Authorization` or `Accept` header for specific requests.

---

## Test Coverage Gaps

**Zero behavioral tests:**
- What's not tested: All of `send()`, `Request`, `Body`, `Decode`, retry logic, deadline enforcement, abort signal handling, header/query merging, response matching, body preview — everything in `docs/SPEC.md`.
- Files: `tests/parity/` (only 4 structural entrypoint cases)
- Risk: The first implementation commit will be entirely untested until dedicated behavioral tests are added in the same phase.
- Priority: High — tests must be co-developed with each implementation layer, not deferred.

**Neutral-build runtime target regression not tested:**
- What's not tested: No test verifies that the neutral `dist/index.js` (the `default` fallback) behaves correctly for runtimes that resolve `.` without a `browser`/`node` condition. The existing parity suite only exercises the `browser` and `node` conditions.
- Files: `tests/parity/entrypoint-cases.ts`, `src/index.ts`
- Risk: The known `src/index.ts` hardcoded `"browser"` issue (see Known Bugs) would not be caught by the existing suite if a new runtime or tool resolves the neutral export.
- Priority: Medium — add a dedicated test project or case that imports via the neutral condition once the neutral build's intended behavior is decided.

---

*Concerns audit: 2026-05-04*
