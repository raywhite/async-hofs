---
'@raywhite/async-hofs': major
---

Modernise package: TypeScript source, dual ESM+CJS publishing via tsup, ava 8, eslint 10 flat config.

- Package is now `"type": "module"` with a proper `exports` map serving both ESM (`import`) and CJS (`require`) consumers from a built `dist/`.
- TypeScript declarations (`.d.ts` / `.d.cts`) are shipped for both module systems.
- Source moved to `src/*.ts`; the published tarball only contains `dist/`.
- Tests upgraded to ava 8 (ESM). `test.cb` usage replaced with promise-returning tests.
- Deprecated devDependency `got` removed (no longer required by ava). Babel/airbnb-base eslint stack replaced with typescript-eslint + @stylistic on eslint 10 flat config.
- No public API changes — all 21 named exports and all four alias groups (`clock`/`createCLockedFn`/`createConcurrencyLockedFn`, `mutex`/`createCLock`/`createConcurrencyLock`, `limit`/`createRateLimitedFn`, `retry`/`createRetrierFn`) are preserved.

**Breaking for consumers who:**
- Imported internal files directly (e.g. `require('@raywhite/async-hofs/src/memoize')`) — only `.` is exposed via `exports`.
- Pinned `engines.node` below 24 — the package now declares `engines.node: ">=24"` to match the mise-pinned dev/CI runtime and the ava 8 + Node typings baseline.
