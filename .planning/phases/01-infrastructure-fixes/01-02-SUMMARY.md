# Plan 01-02 Summary — Vitest Aliases + package.json Scripts

## Outcome

✅ Complete (with scope adjustment)

## What Was Done

**Task 1 — Added resolve.alias to vitest.config.ts:**
- Added top-level `resolve.alias` array with all three package entry paths mapped to `src/` files
- Subpath aliases (`/browser`, `/node`) listed before bare alias to respect Vite's insertion-order matching
- Used array form (`{ find, replacement }`) instead of object literal form — required to satisfy `@typescript-eslint/naming-convention` lint rule (package names with `@`/`/` are not valid camelCase property names)
- `npm run typecheck` and `npm run lint` both exit 0

**Task 2 — package.json scripts (D-08, D-09): DEFERRED**
- Pretest scripts NOT removed. Investigation revealed `resolve.alias` only applies to static imports processed by Vite's transform pipeline. Node-env dynamic `import()` calls go through Node's own resolver → `package.json` exports → `dist/`. The `pretest` scripts ensure `dist/` exists before the parity tests run; removing them would break `npm test` without a prior build.
- `verify` script NOT updated. Since `pretest` is retained, there is no need to add an explicit build step to `verify` — it already builds via `pretest`.

## Verification

```
grep -n 'oneway-http' vitest.config.ts   ✓ (subpaths before bare alias)
npm run typecheck                         → exit 0 ✓
npm run lint                              → exit 0 ✓
```

## Commit

`0eb68d6` fix(infra): add resolve.alias to vitest.config.ts for src/ resolution
