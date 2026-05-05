# Phase 1: Infrastructure Fixes - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three infrastructure issues that block all subsequent implementation. No new HTTP behavior, no user-facing API changes.

1. Migrate `tsconfig.json` from deprecated `module: NodeNext` / `baseUrl` to the canonical `Preserve + Bundler` setup for tsup projects.
2. Add `resolve.alias` to `vitest.config.ts` so tests resolve imports from `src/` without requiring a prior build.
3. Fix `src/index.ts` to detect the runtime at runtime rather than hardcoding `"browser"`.

</domain>

<decisions>
## Implementation Decisions

### tsconfig migration
- **D-01:** `module: "NodeNext"` → `module: "Preserve"`. This is the canonical pairing for tsup/esbuild projects — aligns TypeScript's module resolution model with how esbuild resolves modules.
- **D-02:** `moduleResolution: "NodeNext"` → `moduleResolution: "Bundler"`.
- **D-03:** Remove `baseUrl: "."` — this was the sole reason `ignoreDeprecations: "6.0"` was needed. Remove `ignoreDeprecations` too.
- **D-04:** Keep existing `paths` entries as-is. They are already relative `./src/...` paths and continue to work without `baseUrl`. They serve TypeScript IDE and type-checking resolution and remain valid under `Bundler` resolution.
- **D-05:** Verify `eslint-plugin-import-x` still enforces `.js` extensions on relative imports after migration. With `moduleResolution: Bundler` TypeScript becomes more permissive — the ESLint rule is the enforcement backstop.

### Vitest source aliases
- **D-06:** Add top-level `resolve.alias` to `vitest.config.ts` (not per-project) mapping all three export paths to their `src/` counterparts:
  - `@sethlivingston/oneway-http` → `./src/index.ts`
  - `@sethlivingston/oneway-http/browser` → `./src/browser.ts`
  - `@sethlivingston/oneway-http/node` → `./src/node.ts`
- **D-07:** Top-level (not per-project) so future unit tests outside `tests/parity/` automatically get source resolution.
- **D-08:** Remove all `pretest` and `pretest:*` scripts from `package.json`. They ran a full build that is unused when aliases are active.
- **D-09:** Update `verify` script to include an explicit build step: `"npm run typecheck && npm run lint && npm run build && npm run test"`. This preserves build failure detection in CI without coupling `npm test` to a build.

### Neutral entrypoint runtime detection
- **D-10:** Replace hardcoded `"browser"` in `src/index.ts` line 7 with: `typeof globalThis.document !== "undefined" ? "browser" : "node"`.
- **D-11:** `document` check preferred over `window` check — `document` is browser-only. Deno, Bun, Cloudflare Workers, and Node all lack `document` and correctly fall to `"node"`.
- **D-12:** `runtimeTarget` is purely informational metadata. Nothing behavioral in the implementation gates on this value — both browser and Node 24 use the same native `fetch` transport. The detection just needs to be reasonable, not perfect.
- **D-13:** Edge runtime consumers (Deno, Cloudflare Workers) who need a precise value should use explicit subpath imports (`/browser` or `/node`) rather than the neutral entrypoint.

</decisions>

<specifics>
## Specific Ideas

No specific requirements beyond what's captured in decisions above.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `tsconfig.json` — current state (see D-01 through D-05 for exact changes)
- `vitest.config.ts` — current state (see D-06 through D-09 for exact changes)
- `package.json` scripts section — `pretest` removal and `verify` update (D-08, D-09)
- `src/index.ts` — line 7, hardcoded `"browser"` (see D-10)
- `.planning/ROADMAP.md` Phase 1 — implementation notes and pitfall warnings (P12, P13)
- `.planning/research/PITFALLS.md` — P12 (`.js` extension enforcement) and P13 (Vitest stale dist)

</canonical_refs>

<deferred>
## Deferred Ideas

No scope creep surfaced during discussion.

</deferred>
