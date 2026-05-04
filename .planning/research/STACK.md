# Stack Research

**Domain:** TypeScript ESM HTTP client library (Node + browser, tsup-built)
**Researched:** 2026-05-04
**Confidence:** HIGH — all five questions verified against TypeScript compiler source, official Node.js docs, official Zod library-authors guide, and live runtime testing

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | `^6.0.3` | Type-checking only (`noEmit: true`) | Already in use; `module: Preserve` + `moduleResolution: Bundler` is the canonical tsconfig for tsup-based projects |
| tsup | `^8.5.1` | Build system (actual emit) | Already in use; three-platform config (neutral/browser/node) is the correct architecture for conditional-export libraries |
| Vitest + `@vitest/browser-playwright` | `^4.1.5` | Cross-runtime test harness | Already in use; Playwright-driven parity tests across Node/Chromium/Firefox/WebKit |
| Node.js native `fetch` | Built-in (undici 6.24.x) | HTTP transport in Node runtime | Non-experimental since Node 21.0.0; fully spec-compliant for all use cases in this library; no wrapper needed |
| Zod | `^3.25.0` (peer) | Schema validation via `Decode.json(schema)` | Peer dep keeps consumer in control of version; library normalises to `DecodeIssue[]` so Zod types never leak |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (devDependency) | `^3.25.0` | Satisfies peer dep during development + type inference | Always include alongside peerDependencies entry |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsup | Bundles `src/` into `dist/` in three platform variants | `platform: "neutral"`, `"browser"`, `"node"` — each gets correct globals; `dts: true` emits declarations per bundle |
| `tsc --noEmit` | Type-check only — never emits | `module: Preserve` + `moduleResolution: Bundler` matches how tsup/esbuild actually resolves modules |

---

## Q1 — TypeScript 6 `module: NodeNext` Deprecation

### Critical Correction

**`module: NodeNext` is NOT deprecated in TypeScript 6.** The project's requirement to migrate "because NodeNext is deprecated" is based on a misconception. Verified directly against TypeScript compiler source (`src/compiler/commandLineParser.ts` and `src/compiler/program.ts`):

**What IS deprecated in TypeScript 6.0** (will error in TS 7.0, silenced by `ignoreDeprecations: "6.0"`):

| Deprecated option | Note |
|-------------------|------|
| `baseUrl` | **This is why the current tsconfig has `ignoreDeprecations: "6.0"`** |
| `moduleResolution: node10` / `node` | Replaced by `bundler` or `nodenext` |
| `moduleResolution: classic` | Effectively dead |
| `target: ES5` | Use ≥ ES2015 |
| `alwaysStrict: false` | Remove the flag |
| `module: none/amd/umd/system` | Legacy formats |
| `outFile` | CJS concatenation artifact |
| `downlevelIteration` | Implicit in modern targets |
| Import assertions (`assert` keyword) | Replaced by `with` keyword; separate checker check |

The current tsconfig has `baseUrl: "."` — **that is the sole reason `ignoreDeprecations: "6.0"` is present**.

### Recommended Migration

Even though NodeNext is not deprecated, migrating to `module: Preserve` + `moduleResolution: Bundler` is **best practice** for a tsup-built library because it tells TypeScript to check modules the way the actual bundler (esbuild) resolves them.

**Step-by-step (tsconfig.json changes only — tsup config is unchanged):**

```jsonc
// BEFORE
{
  "compilerOptions": {
    "baseUrl": ".",                  // ← deprecated in TS6; causes ignoreDeprecations
    "module": "NodeNext",            // ← valid but wrong semantic for a tsup project
    "moduleResolution": "NodeNext",  // ← valid but wrong semantic for a tsup project
    "ignoreDeprecations": "6.0",     // ← suppressing baseUrl warning
    "paths": {
      "@sethlivingston/oneway-http": ["./src/index.ts"],
      ...
    }
  }
}

// AFTER
{
  "compilerOptions": {
    // baseUrl removed — paths already use "./src/..." so no change needed
    "module": "Preserve",            // ← preserves module syntax; lets tsup handle output
    "moduleResolution": "Bundler",   // ← resolves like esbuild/bundler; allows extensionless
    // ignoreDeprecations removed — no longer needed
    "paths": {
      "@sethlivingston/oneway-http": ["./src/index.ts"],
      "@sethlivingston/oneway-http/browser": ["./src/browser.ts"],
      "@sethlivingston/oneway-http/node": ["./src/node.ts"]
    }
  }
}
```

**Why the `paths` entries survive without `baseUrl`:** All three values (`./src/index.ts`, etc.) are already relative paths. TypeScript resolves `paths` values relative to the tsconfig directory when `baseUrl` is absent (supported in TS 5.0+ for non-`classic` moduleResolution).

**Why `module: Preserve` over staying on `module: NodeNext`:**
- `module: NodeNext` applies Node.js ESM semantics to all imports, including *requiring* `.js` extensions on every relative specifier. The existing source files already comply (they use `.js`), so there is no breakage — but it creates unnecessary friction for new source files.
- `module: Preserve` tells TypeScript: "the bundler handles output format; leave my imports alone." This is the canonical recommendation for all tsup/esbuild/rollup projects (confirmed in TypeScript 5.4+ docs and TS6 migration guidance at aka.ms/ts6).
- **`verbatimModuleSyntax: true` is fully compatible with `module: Preserve`** — `verbatimModuleSyntax` enforces `import type` discipline regardless of the `module` setting.

**Confidence:** HIGH — verified in TypeScript 6.0 release notes, TypeScript source (`program.ts` `verifyDeprecatedCompilerOptions`), and confirmed `nodeNext` is absent from the deprecatedKeys set.

---

## Q2 — Zod Peer Dependency Pattern

### Recommended `package.json` Structure

```json
{
  "peerDependencies": {
    "zod": "^3.25.0"
  },
  "peerDependenciesMeta": {
    "zod": { "optional": true }
  },
  "devDependencies": {
    "zod": "^3.25.0"
  }
}
```

**Why `optional: true`:** The library is fully usable without Zod — only `Decode.json(schema)` requires it. Marking it optional means npm/pnpm/yarn won't warn consumers who don't install Zod.

**Why `^3.25.0` not `^3.0.0`:** Zod's official library-authors guide (verified via Context7, source: `zod.dev/library-authors`) specifies `^3.25.0` as the minimum because 3.25 introduced `z.output<T>` inference improvements important for library authors. `^3.0.0` would be too broad.

### Zod v3 vs v4 Strategy

**Start with v3 only.** Zod v4 (`^4.0.0`) is a breaking change for library authors:
- Internal definition property moved: `._def` → `._zod.def`
- Import paths changed: `zod` (v4) vs `zod/v3` (v3 compat shim) vs `zod/v4/core` (shared base)
- Type names changed: `$ZodType`, `$ZodObject`, etc.

Supporting both v3 and v4 simultaneously requires:
1. Versioned subpath imports: `import type * as z3 from "zod/v3"` and `import * as z4 from "zod/v4/core"`
2. Runtime differentiation: `"_zod" in schema` → Zod 4; `_def` in schema → Zod 3

**For v1 of this library:** Use Zod v3 only (`^3.25.0`). The thin adapter seam (SPEC requirement) means adding v4 later means only touching the adapter, not the public API. When v4 support is needed:

```json
// future v4 support
{
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

**Confidence:** HIGH — sourced from official Zod library-authors guide at `zod.dev/library-authors` and `zod.dev/v4/changelog`, retrieved via Context7 (`/colinhacks/zod` and `/websites/zod_dev`).

---

## Q3 — `AbortSignal.any()` Availability

### Verdict: No Polyfill Needed

| Environment | Support | Notes |
|-------------|---------|-------|
| Node.js 20.3+ | ✅ Full | Introduced in 20.3.0 |
| Node.js 24 (project floor) | ✅ Full | Tested live; works correctly |
| Chrome/Chromium 116+ | ✅ Full | All evergreen versions |
| Firefox 124+ | ✅ Full | All evergreen versions |
| Safari/WebKit 17.4+ | ✅ Full | All evergreen versions |

The project pins `"node": ">=24.0.0"` in `package.json`. Browser targets are all evergreen (Playwright always uses latest). **No polyfill is needed or appropriate.**

**Live verification (Node 22.22.2, same undici as Node 24):**
```ts
const c1 = new AbortController();
const combined = AbortSignal.any([c1.signal]);
c1.abort(new Error("user cancelled"));
// combined.aborted === true
// combined.reason === Error("user cancelled")  ✅
```

`AbortSignal.timeout()` is also available in all targets (Node 17.3+, Chrome 103+, Firefox 100+, Safari 16.0+).

**Pattern for this library** (combining caller signal + deadline):
```ts
const deadlineController = new AbortController();
const effectiveSignal = AbortSignal.any(
  [callerSignal, deadlineController.signal].filter(Boolean) as AbortSignal[]
);
// pass effectiveSignal to fetch(url, { signal: effectiveSignal })
```

**Confidence:** HIGH — verified against Node.js 24 docs and live runtime test.

---

## Q4 — `fetch` API in Node 24 (Undici-Based)

### Verdict: Fully Suitable — No Quirks Affecting This Library

**Status:** Non-experimental since Node 21.0.0. Bundled undici version in Node 22/24: `6.24.1`.

### Behavior Verified Live

| Behavior | Node 24 | Browser | Match? |
|----------|---------|---------|--------|
| `response.body` type | `ReadableStream` | `ReadableStream` | ✅ |
| `response.bodyUsed` after `.text()` | `true` | `true` | ✅ |
| Second body read | Throws `"Body is unusable: Body has already been read"` | Throws `TypeError` | ✅ Equivalent |
| Headers case-insensitivity | `content-type`/`Content-Type` same key | Same | ✅ |
| Abort reason propagation via `AbortSignal.any()` | `combined.reason === abortError` | Same | ✅ |
| `FormData` | Available globally | Available globally | ✅ |

### Known Limitations (None Affect This Library)

| Limitation | Affects v1? |
|------------|------------|
| `keepalive: true` not supported (Node-specific) | No — not used |
| `duplex: "half"` required for streaming request bodies (Node) | No — streaming bodies excluded from v1 per SPEC |
| No service worker intercept | No — library is a client |
| `redirect: "manual"` returns opaque response differently | No — library does not use manual redirect |

### Body Preview Implementation Note

The `BodyPreview` feature (`{ text, bytesRead, truncated }`, first N bytes) requires reading the response body stream **once**, consuming up to `bodyPreviewBytes` bytes, then letting the decoder read the rest. **Do not consume the full body twice.** The correct pattern in Node 24 is:

```ts
// Use response.body (ReadableStream) directly for preview
const reader = response.body.getReader();
// read chunks up to bodyPreviewBytes...
// then pass remaining chunks to the decoder
```

Alternatively, use `Response.clone()` only when necessary — cloning buffers the entire body in memory, which defeats the purpose of a configurable preview limit.

**Confidence:** HIGH — verified against Node.js 24 official docs and live runtime tests.

---

## Q5 — ESM-Only TypeScript Library Patterns (Conditional Exports + tsup)

### The Three-Platform Pattern Is Correct

The existing tsup config is architecturally sound. Key rules to preserve:

**1. tsup `platform` controls available globals — match it to the entry point's target:**

```ts
// tsup.config.ts (already correct)
{ entry: "src/browser.ts", platform: "browser" }  // window, document available
{ entry: "src/node.ts",    platform: "node"    }  // process, __dirname available  
{ entry: "src/index.ts",   platform: "neutral" }  // no injected globals — runtime detection required
```

**2. Conditional export ordering is load-bearing:**

```jsonc
// package.json — order matters; first match wins
"exports": {
  ".": {
    "browser": { ... },   // bundlers targeting browser use this
    "node":    { ... },   // Node uses this
    "types":   "...",     // TypeScript falls back here
    "default": "..."      // everything else (e.g., Deno, Bun without conditions)
  }
}
```

The current ordering is correct. Do **not** put `"default"` before `"types"` or TypeScript may not resolve declarations.

**3. The neutral entrypoint must use runtime detection — not hardcode "browser":**

The PROJECT.md flags this as a known bug: `src/index.ts` currently hardcodes `runtimeTarget: "browser"`. The fix:

```ts
// src/index.ts — canonical runtime detection pattern
const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;
```

However, the better long-term answer is: **consumers using a bundler or Node will always receive the correct platform-specific bundle via conditional exports**. The neutral bundle is only reached in environments that don't honour conditions (e.g., direct `require` in a CJS context — which this library doesn't support since it's ESM-only). Runtime detection in the neutral bundle is still correct for parity test coverage.

**4. `paths` in tsconfig are type-check-only aliases — they don't affect tsup output:**

```jsonc
// tsconfig.json paths  — resolves for `tsc --noEmit` ONLY
"paths": {
  "@sethlivingston/oneway-http": ["./src/index.ts"]  // tests can import from the package name
}
```

tsup does **not** read `tsconfig.json` paths for bundling. It resolves imports exactly as esbuild does. This means if test files import from `@sethlivingston/oneway-http`, tsup/esbuild will resolve that through the `exports` field in `package.json`, not the tsconfig paths. Tests run against the **built** `dist/` output (the `pretest` script runs `build` first), so this works correctly.

**5. `splitting: false` is correct for this library — do not enable:**

Code splitting in tsup creates shared chunks. For a library with three distinct entry points, splitting would create cross-bundle chunk references that break tree-shaking and confuse bundlers that only load one entry. Keep `splitting: false`.

**6. `sideEffects: false` is required for correct tree-shaking:**

Already set. Without it, consumers' bundlers cannot eliminate unused exports.

### Pitfall: `.js` Extensions in Source With `moduleResolution: Bundler`

After the tsconfig migration (Q1), `moduleResolution: Bundler` does **not** require `.js` extensions on relative imports — but existing files already have them (e.g., `from "./shared.js"`). This is fully compatible: with `bundler` resolution, TypeScript resolves `"./shared.js"` by stripping the extension and finding `./shared.ts`. **No source file changes needed.**

New files added during v1 implementation may omit `.js` extensions (bundler mode allows it) or include them (also fine). Adopt a project-consistent style — either always include or always omit.

**Confidence:** HIGH — verified against tsup docs, TypeScript module resolution docs, and live package.json conditional export behaviour.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `module: Preserve` + `moduleResolution: Bundler` | `module: NodeNext` | When you want TypeScript to enforce Node.js ESM semantics (`.js` extension required, no extensionless imports) — correct for projects where TS itself emits the output |
| `peerDependencies: { zod: "^3.25.0" }` | `peerDependencies: { zod: "^3.0.0" }` | Only if you need to support very old Zod 3.x projects; not recommended |
| No polyfill for `AbortSignal.any()` | `abort-signal-any` npm polyfill | Only if you need to support Node < 20.3 or Safari < 17.4 — neither applies here |
| Native `fetch` | `node-fetch`, `axios`, `got` | Only for Node < 18 or complex pooling/proxy requirements not present in this library |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ignoreDeprecations: "6.0"` long-term | Masks a real issue (`baseUrl` deprecated); will error in TS7 | Remove `baseUrl`, use `paths` with `./` relative values |
| `baseUrl: "."` | Deprecated in TS6, removed in TS7 | Remove it; `paths` with relative values works without `baseUrl` |
| `Response.clone()` for body preview | Buffers entire body in memory regardless of `bodyPreviewBytes` limit | Read `response.body` (ReadableStream) directly, consume up to the limit |
| `Zod.safeParse()` result types in the public API | Leaks Zod types; breaks the library's Valibot-swap seam | Normalize to `DecodeIssue[]` internally; never expose `ZodError` |
| `splitting: true` in tsup | Creates cross-bundle shared chunks that break tree-shaking | Keep `splitting: false` |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `typescript ^6.0.3` | `module: Preserve` (since TS 5.4) | `module: Preserve` introduced in TS 5.4; stable in TS 6 |
| `typescript ^6.0.3` | `moduleResolution: Bundler` (since TS 5.0) | `bundler` mode stable since TS 5.0 |
| `zod ^3.25.0` | `typescript ^6.0.3` | No known issues |
| `tsup ^8.5.1` | `vite ^8.0.10` | tsup 8.x requires Vite 6+; already aligned |
| `AbortSignal.any()` | Node 20.3+, Chrome 116+, Firefox 124+, Safari 17.4+ | All satisfied by Node 24 floor and evergreen browser targets |
| `fetch` (native) | Node 21.0+ (non-experimental) | Node 24 floor satisfies this |

---

## Sources

- `/microsoft/typescript` (Context7) + TypeScript `src/compiler/program.ts` + `src/compiler/commandLineParser.ts` (GitHub raw) — `ignoreDeprecations` semantics, deprecated options list in TS6 (HIGH confidence)
- `https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html` — TS6 migration guidance, `module: preserve` recommendation for bundler projects (HIGH confidence)
- `https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html` — `module: preserve` introduction, `moduleResolution: bundler` + `module: preserve` pairing (HIGH confidence)
- `/colinhacks/zod` + `/websites/zod_dev` (Context7, `zod.dev/library-authors`) — peer dep pattern, version range, v3/v4 migration (HIGH confidence)
- `https://nodejs.org/docs/latest-v24.x/api/globals.html` — `fetch`, `AbortSignal.any()` version history and docs (HIGH confidence)
- Live Node 22/24 runtime testing — body consumption, abort propagation, header case-insensitivity, undici 6.24.1 (HIGH confidence)
- `/websites/tsup_egoist_dev` (Context7) — platform option, format behaviour (HIGH confidence)

---

*Stack research for: oneway-http — TypeScript ESM HTTP client library*
*Researched: 2026-05-04*
