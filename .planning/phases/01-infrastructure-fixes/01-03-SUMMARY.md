# Plan 01-03 Summary — Runtime Detection in src/index.ts

## Outcome

✅ Complete

## What Was Done

**Task 1 — Replaced hardcoded "browser" with runtime detection:**
- Changed `createPlaceholderSurface("browser")` to `createPlaceholderSurface(typeof globalThis.document !== "undefined" ? "browser" : "node")`
- Uses `globalThis.document` (not `window`) — correct for Deno, Bun, Cloudflare Workers, Node
- `npm run typecheck` exits 0

**Discovered deviation — tsup DTS injects baseUrl:**
- `npm run build` failed with TS5101: tsup's rollup DTS pipeline (node_modules/tsup/dist/rollup.js) injects `baseUrl: "."` synthetically when the tsconfig doesn't have one. TypeScript 6 treats `Bundler + baseUrl` as a deprecated combination and errors.
- Resolution: restored `"ignoreDeprecations": "6.0"` to tsconfig.json. This silences the tsup-generated error. Our tsconfig correctly omits `baseUrl` — the suppression is required only because of tsup's internal behavior, not our config.

**Task 2 — Full parity suite:**
- All 4 projects pass: node (4/4), chromium (3/4, 1 skipped), firefox (3/4, 1 skipped), webkit (3/4, 1 skipped)
- Skipped test is node-only explicit entrypoint (correct — browser projects skip it)

## Verification

```
grep 'typeof globalThis.document' src/index.ts              ✓
grep -c 'createPlaceholderSurface("browser")' src/index.ts  → 0 ✓
npm run typecheck                                            → exit 0 ✓
npm run build                                               → exit 0 ✓
npx vitest run                                              → 4 passed ✓
```

## Commit

`389c9c8` fix(infra): runtime detection in src/index.ts; restore ignoreDeprecations for tsup
