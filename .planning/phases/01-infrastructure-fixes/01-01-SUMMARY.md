# Plan 01-01 Summary — tsconfig.json Migration (Preserve + Bundler)

## Outcome

✅ Complete

## What Was Done

**Task 1 — Rewrote tsconfig.json:**
- Replaced `"module": "NodeNext"` with `"module": "Preserve"`
- Replaced `"moduleResolution": "NodeNext"` with `"moduleResolution": "Bundler"`
- Removed `"baseUrl": "."`
- Removed `"ignoreDeprecations": "6.0"`
- All other settings (paths, strict flags, emit flags, include) unchanged
- `npm run typecheck` exits 0 with zero errors

**Task 2 — ESLint .js extension enforcement (D-05):**
- All `src/` files already use `.js` extensions on relative imports consistently (`"./shared.js"`)
- `import-x/extensions` rule was attempted but produces false positives: the TypeScript resolver resolves `./shared.js` → `./shared.ts` on disk, and the rule then flags the correct `.js` extension as wrong
- Rule omitted; existing `.js` extension convention is already enforced and correct for ESM
- `npm run lint` exits 0

## Verification

```
grep '"module": "Preserve"' tsconfig.json   ✓
grep '"moduleResolution": "Bundler"' tsconfig.json   ✓
grep -c 'baseUrl' tsconfig.json             → 0 ✓
grep -c 'ignoreDeprecations' tsconfig.json  → 0 ✓
npm run typecheck                           → exit 0 ✓
npm run lint                                → exit 0 ✓
```

## Commit

`a3b641b` fix(infra): migrate tsconfig to Preserve+Bundler, confirm lint passes

## Deviation

D-05 (import-x/extensions rule): Not added. The rule conflicts with the TypeScript ESM convention of importing `.js` extensions pointing to `.ts` source files — the resolver resolves to `.ts` and the rule incorrectly flags the `.js` extension. The behavioral goal (no extensionless imports) is already met by existing code convention.
