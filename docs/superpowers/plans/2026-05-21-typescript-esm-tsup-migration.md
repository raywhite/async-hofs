# async-hofs Modernisation: ESM + TypeScript + tsup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernise `@raywhite/async-hofs` to a TypeScript ESM-first package built with `tsup`, ship dual ESM+CJS+types, upgrade `ava` to v8 with native ESM tests, and retire the babel/airbnb-base eslint stack.

**Architecture:** Source moves from CommonJS `.js` (`module.exports`) under `src/` to TypeScript `.ts` (`export` statements) under `src/`. Build with `tsup` produces `dist/` containing both `*.mjs` (ESM) and `*.cjs` (CJS) plus `*.d.ts` / `*.d.cts` declarations. `package.json` declares `"type": "module"` and uses `exports` conditional resolution. Tests stay as plain JS (`.test.js`) under `test/`, written as ESM, importing from the built `dist/` to verify the actual shipped artefact. Linting moves to flat-config `eslint.config.js` with `typescript-eslint` and `@stylistic` rules ported from the current `.eslintrc`. The existing changesets release flow is preserved; only a `prepublishOnly` build step is added.

**Tech Stack:** TypeScript 5.x, tsup 8.x, ava 8.x, eslint 9.x (flat config), typescript-eslint 8.x, @stylistic/eslint-plugin, changesets (unchanged), Node 24 (mise-pinned, unchanged).

**Branch:** Create a new branch `lo/modernise-esm-ts-tsup` from `main`. Close dependabot PR #28 (`dependabot/npm_and_yarn/multi-1e42e99ce6`) after this lands — its scope (ava + got removal) is subsumed here.

**Out of scope:** Changing the public API surface, renaming exports, changing concurrency semantics, dropping aliases, adding new features. This is a packaging/tooling migration only.

---

## File Structure

**Files to create:**
- `src/index.ts` — primary entry; re-exports + sequence/compose/mutex/queue/pool/clock/limit/benchmark (port of `src/index.js`)
- `src/utilities.ts` — `isPromise`, `isNumber`, `sleep` (port of `src/utilities.js`)
- `src/memoize.ts` — `memoize` (port of `src/memoize.js`)
- `src/retrier.ts` — `createLinear`, `zero`, `createExponential`, `createRetrierFn`, `retry` (port of `src/retrier.js`)
- `src/buffer.ts` — `buffer` with `buffer.LIMIT_EXCEEDED` (port of `src/buffer.js`)
- `tsconfig.json` — strict TS config targeting ES2022, `moduleResolution: bundler`
- `tsup.config.ts` — dual ESM/CJS build emitting to `dist/`
- `eslint.config.js` — flat-config ESLint with typescript-eslint + @stylistic rules
- `.changeset/modernise-esm-ts-tsup.md` — major version bump changeset

**Files to delete:**
- `.eslintrc` (replaced by `eslint.config.js`)
- `src/index.js`, `src/utilities.js`, `src/memoize.js`, `src/retrier.js`, `src/buffer.js` (replaced by `.ts` equivalents)

**Files to modify:**
- `package.json` — add `"type": "module"`, set `main`/`module`/`types`/`exports`/`files`, replace devDependencies, replace scripts
- `test/buffer.js`, `test/index.js`, `test/memoize.js`, `test/retrier.js` — convert to ESM `import`, drop `test.cb` (use promise-returning tests), import from `dist/`
- `.gitignore` — add `dist/`
- `README.md` — update install/test notes (no API changes)

**Files unchanged:** `mise.toml`, `mise.lock`, `.github/workflows/*`, `.changeset/config.json`, `zizmor.yml`, `LICENSE.md`.

---

## Task 1: Branch setup

**Files:**
- None (git operations only)

- [ ] **Step 1: Create the migration branch**

```bash
git checkout main
git pull --ff-only
git checkout -b lo/modernise-esm-ts-tsup
```

- [ ] **Step 2: Confirm clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean` on branch `lo/modernise-esm-ts-tsup`.

---

## Task 2: Update package.json devDependencies and scripts

**Files:**
- Modify: `/Users/loboyle/src/async-hofs/package.json`

- [ ] **Step 1: Rewrite package.json**

Replace the entire file with:

```json
{
  "name": "@raywhite/async-hofs",
  "version": "2.0.0",
  "description": "Async / Promise related higher order functions and utils",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "repository": "https://github.com/raywhite/async-hofs.git",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "prepublishOnly": "npm run build",
    "test": "npm run test:lint && npm run test:types && npm run test:node",
    "test:lint": "eslint .",
    "test:types": "tsc --noEmit",
    "test:node": "npm run build && ava -v -s -c 1",
    "test:node_match": "npm run build && ava -v -s -c 1 --match",
    "release": "changeset publish"
  },
  "author": "axdg <axdg@dfant.asia>",
  "license": "MIT",
  "devDependencies": {
    "@changesets/cli": "^2.31.0",
    "@stylistic/eslint-plugin": "^5.10.0",
    "@types/node": "^25.9.0",
    "ava": "^8.0.1",
    "eslint": "^10.4.0",
    "tsup": "^8.5.0",
    "typescript": "^6.0.0",
    "typescript-eslint": "^8.59.0"
  }
}
```

Note: keep `version` at `2.0.0` — the changeset added in Task 11 drives the bump.

- [ ] **Step 2: Install the new dep tree**

Run: `rm -rf node_modules package-lock.json && npm install`
Expected: clean install, regenerated `package-lock.json`.

- [ ] **Step 3: Sanity check the binaries**

Run: `npx tsup --version && npx ava --version && npx eslint --version && npx tsc --version`
Expected: each prints a version (`tsup 8.x`, `ava 8.x`, `eslint 9.x`, `tsc 5.x`). If any fails, investigate before proceeding.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: switch devDeps to tsup + ts + ava 8 + flat eslint"
```

---

## Task 3: TypeScript and gitignore configuration

**Files:**
- Create: `/Users/loboyle/src/async-hofs/tsconfig.json`
- Modify: `/Users/loboyle/src/async-hofs/.gitignore`

- [ ] **Step 1: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

Rationale: `noEmit: true` because tsup handles emit. `tsc` is only used for type-checking via `npm run test:types`.

- [ ] **Step 2: Append dist to .gitignore**

The current `.gitignore` contains:

```
.DS_Store
node_modules
npm-debug.log
```

Append `dist` so the file becomes:

```
.DS_Store
node_modules
npm-debug.log
dist
```

- [ ] **Step 3: Verify tsc works (no source yet, will show no input)**

Run: `npx tsc --noEmit`
Expected: error about no input files — that's fine, we add sources in Task 5. Do NOT proceed if there's any tsconfig parse error.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json .gitignore
git commit -m "chore: add tsconfig and ignore dist"
```

---

## Task 4: tsup build configuration

**Files:**
- Create: `/Users/loboyle/src/async-hofs/tsup.config.ts`

- [ ] **Step 1: Write tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  splitting: false,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
})
```

Notes:
- `entry` is `src/index.ts` only — `index.ts` re-exports from the other modules so tsup produces one bundle (matching how downstream consumers import the package today via `require('@raywhite/async-hofs')`).
- `dts: true` emits both `.d.ts` and `.d.cts` (tsup auto-handles this when format includes both).
- `target: 'node22'` aligns with the AVA 8 / mise Node 24 baseline (Node 22 LTS is the floor).

- [ ] **Step 2: Commit**

```bash
git add tsup.config.ts
git commit -m "chore: add tsup config for dual esm/cjs build"
```

---

## Task 5: Port src/utilities.js → src/utilities.ts

**Files:**
- Create: `/Users/loboyle/src/async-hofs/src/utilities.ts`
- Delete: `/Users/loboyle/src/async-hofs/src/utilities.js`

- [ ] **Step 1: Write src/utilities.ts**

```typescript
/**
 * Determines whether a value is a thenable, or a standard promise.
 */
export const isPromise = (value: unknown): value is PromiseLike<unknown> => {
  if (value instanceof Promise) return true
  if (value === null || typeof value !== 'object') return false
  return typeof (value as { then?: unknown }).then === 'function'
}

export const isNumber = (value: unknown): value is number => typeof value === 'number'

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export const sleep = (ms = 1000): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms)
})
```

Note: the original `isPromise` called `.then` on `value` without a null-check; the new version guards against `null`/non-objects, which is a behaviour-preserving safety fix (the original would throw on `isPromise(null)` — no caller exercises that path today, but the typed version makes the contract clearer).

- [ ] **Step 2: Delete the old file**

```bash
git rm src/utilities.js
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: still complains about other files needing porting — that's expected since they reference utilities. We continue porting the other src files in the next tasks; full type-check passes at Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/utilities.ts
git commit -m "refactor: port utilities to typescript"
```

---

## Task 6: Port src/memoize.js → src/memoize.ts

**Files:**
- Create: `/Users/loboyle/src/async-hofs/src/memoize.ts`
- Delete: `/Users/loboyle/src/async-hofs/src/memoize.js`

- [ ] **Step 1: Write src/memoize.ts**

```typescript
import { isPromise } from './utilities.js'

type AnyFn = (...args: any[]) => unknown
type Stringify = (...args: any[]) => string

const defaultStringify: Stringify = (...args) => String(args[0])

export interface MemoizedFn<F extends AnyFn> {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>
  readonly cache: Record<string, Awaited<ReturnType<F>>>
}

export function memoize<F extends AnyFn>(
  fn: F,
  s: Stringify | number = defaultStringify,
  ms = -1,
): MemoizedFn<F> {
  if (typeof s === 'number') {
    ms = s
    s = defaultStringify
  }

  const stringify = s
  const cache = new Map<string, Awaited<ReturnType<F>>>()
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>()

  const append = (key: string, value: Awaited<ReturnType<F>>): Awaited<ReturnType<F>> => {
    if (ms !== -1) {
      timeouts.set(key, setTimeout(() => {
        timeouts.delete(key)
        cache.delete(key)
      }, ms))
    }
    cache.set(key, value)
    return value
  }

  const m = ((...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => {
    const key = stringify(...args)
    if (cache.has(key)) return Promise.resolve(cache.get(key) as Awaited<ReturnType<F>>)

    return new Promise((resolve, reject) => {
      let promise: PromiseLike<unknown>
      try {
        const raw = fn(...args)
        promise = isPromise(raw) ? raw : Promise.resolve(raw)
      } catch (err) {
        if (cache.has(key)) cache.delete(key)
        if (timeouts.has(key)) timeouts.delete(key)
        reject(err)
        return
      }

      promise.then(
        (value) => resolve(append(key, value as Awaited<ReturnType<F>>)),
        (err) => {
          if (cache.has(key)) cache.delete(key)
          if (timeouts.has(key)) timeouts.delete(key)
          reject(err)
        },
      )
    })
  }) as MemoizedFn<F>

  Object.defineProperty(m, 'cache', {
    get(): Record<string, Awaited<ReturnType<F>>> {
      const out: Record<string, Awaited<ReturnType<F>>> = {}
      for (const [k, v] of cache.entries()) out[k] = v
      return out
    },
  })

  return m
}
```

The `./utilities.js` import (not `./utilities`) is deliberate — TypeScript's NodeNext-style ESM resolution requires the runtime extension. tsup will rewrite this correctly for the CJS output.

- [ ] **Step 2: Delete the old file**

```bash
git rm src/memoize.js
```

- [ ] **Step 3: Commit**

```bash
git add src/memoize.ts
git commit -m "refactor: port memoize to typescript"
```

---

## Task 7: Port src/retrier.js → src/retrier.ts

**Files:**
- Create: `/Users/loboyle/src/async-hofs/src/retrier.ts`
- Delete: `/Users/loboyle/src/async-hofs/src/retrier.js`

- [ ] **Step 1: Write src/retrier.ts**

```typescript
import { isNumber } from './utilities.js'

export interface LinearConstants {
  m?: number
  b?: number
}

export interface ExponentialConstants {
  a?: number
  b?: number
}

export type Curve = (x: number) => number

export const createLinear = (constants: LinearConstants = {}): Curve => {
  const { m = 1, b = 0 } = constants
  return (x: number): number => (m * x) + b
}

export const zero: Curve = createLinear({ m: 0 })

export const createExponential = (constants: ExponentialConstants = {}, m = 1): Curve => {
  const { a = 2, b = 1 } = constants
  return (x: number): number => Math.pow(a * b, x) * m
}

type AnyAsyncFn = (...args: any[]) => any
type ShouldRetry = (error: unknown) => boolean

export function createRetrierFn<F extends AnyAsyncFn>(
  fn: F,
  curve: Curve | number = 2,
  limit = 2,
  shouldRetry?: ShouldRetry,
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>> {
  let resolvedCurve: Curve
  let resolvedLimit: number

  if (isNumber(curve)) {
    resolvedLimit = curve
    resolvedCurve = zero
  } else {
    resolvedCurve = curve
    resolvedLimit = limit
  }

  return function retrier(...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> {
    return new Promise((resolve, reject) => {
      const recurse = (attempt: number): void => {
        const retry = (error: unknown): void => {
          const errorCount = attempt + 1
          if (resolvedLimit && errorCount >= resolvedLimit) {
            reject(error)
            return
          }
          if (shouldRetry && !shouldRetry(error)) {
            reject(error)
            return
          }
          recurse(errorCount)
        }

        setTimeout(() => {
          try {
            Promise.resolve(fn(...args))
              .then((v) => resolve(v as Awaited<ReturnType<F>>))
              .catch((asyncErr) => retry(asyncErr))
          } catch (syncErr) {
            retry(syncErr)
          }
        }, resolvedCurve(attempt))
      }
      recurse(0)
    })
  }
}

export const retry = createRetrierFn
```

- [ ] **Step 2: Delete the old file**

```bash
git rm src/retrier.js
```

- [ ] **Step 3: Commit**

```bash
git add src/retrier.ts
git commit -m "refactor: port retrier to typescript"
```

---

## Task 8: Port src/buffer.js → src/buffer.ts

**Files:**
- Create: `/Users/loboyle/src/async-hofs/src/buffer.ts`
- Delete: `/Users/loboyle/src/async-hofs/src/buffer.js`

- [ ] **Step 1: Write src/buffer.ts**

```typescript
import type { Readable } from 'node:stream'

const LIMIT_EXCEEDED = 'Byte limit exceeded.'
const map = new WeakMap<Readable, Promise<Buffer>>()

const createError = (str: string): Error & { type: string } => {
  const err = new Error(str) as Error & { type: string }
  err.type = str
  return err
}

export interface BufferFn {
  (readable: Readable, limit?: number): Promise<Buffer>
  readonly LIMIT_EXCEEDED: typeof LIMIT_EXCEEDED
}

const bufferImpl = (readable: Readable, limit = 1000 * 1024): Promise<Buffer> => {
  const cached = map.get(readable)
  if (cached) return cached

  const promise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let len = 0

    readable.on('data', (chunk: Buffer) => {
      len += chunk.length
      if (len > limit) {
        reject(createError(LIMIT_EXCEEDED))
        return
      }
      chunks.push(chunk)
    })

    readable.on('end', () => resolve(Buffer.concat(chunks, len)))
    readable.on('error', (err) => reject(err))
  })

  map.set(readable, promise)
  return promise
}

export const buffer = bufferImpl as BufferFn
;(buffer as { LIMIT_EXCEEDED: string }).LIMIT_EXCEEDED = LIMIT_EXCEEDED
```

- [ ] **Step 2: Delete the old file**

```bash
git rm src/buffer.js
```

- [ ] **Step 3: Commit**

```bash
git add src/buffer.ts
git commit -m "refactor: port buffer to typescript"
```

---

## Task 9: Port src/index.js → src/index.ts

**Files:**
- Create: `/Users/loboyle/src/async-hofs/src/index.ts`
- Delete: `/Users/loboyle/src/async-hofs/src/index.js`

- [ ] **Step 1: Write src/index.ts**

```typescript
import { sleep, isPromise } from './utilities.js'

export { sleep } from './utilities.js'
export { memoize } from './memoize.js'
export {
  createLinear,
  zero,
  createExponential,
  createRetrierFn,
  retry,
} from './retrier.js'
export { buffer } from './buffer.js'

type AnyFn = (...args: any[]) => unknown
type SequencerMethod = (this: AnyFn[]) => AnyFn | undefined

const createSequencer = (method: SequencerMethod) => (...fns: AnyFn[]) => (value: unknown): Promise<unknown> => new Promise((resolve, reject) => {
  const args = [...fns]
  const recurse = (res: unknown): unknown => {
    const fn = method.call(args)
    try {
      if (fn) {
        let next: unknown = fn(res)
        if (!isPromise(next)) next = Promise.resolve(next)
        return (next as PromiseLike<unknown>).then(recurse, reject)
      }
    } catch (err) {
      reject(err)
      return undefined
    }
    return res
  }
  Promise.resolve(recurse(value)).then(resolve, reject)
})

export const sequence = createSequencer(Array.prototype.shift as SequencerMethod)
export const compose = createSequencer(Array.prototype.pop as SequencerMethod)

/**
 * Concurrency lock — returns a lock function that resolves with `release`.
 */
export interface ConcurrencyLock {
  (): Promise<() => number>
  readonly pending: number
  readonly queued: number
}

export const createConcurrencyLock = (concurrency = 3): ConcurrencyLock => {
  let pending = 0
  const scheduled: Array<(release: () => number) => void> = []

  const unlock = (): number => {
    pending--
    const next = scheduled.shift()
    if (next) next(unlock)
    return scheduled.length
  }

  const lock = ((): Promise<() => number> => {
    pending++
    return new Promise((resolve) => {
      if (pending > concurrency) {
        scheduled.push(resolve)
        return
      }
      resolve(unlock)
    })
  }) as ConcurrencyLock

  Object.defineProperty(lock, 'pending', { get: () => pending })
  Object.defineProperty(lock, 'queued', { get: () => scheduled.length })

  return lock
}

export const mutex = createConcurrencyLock
export const createCLock = createConcurrencyLock

type AnyAsyncFn = (...args: any[]) => any

export interface AsyncFnQueue {
  <F extends AnyAsyncFn>(fn: F, ...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>
  readonly pending: number
  readonly queued: number
}

export const createAsyncFnQueue = (concurrency = 1): AsyncFnQueue => {
  const lock = createConcurrencyLock(concurrency)

  const enqueue = (<F extends AnyAsyncFn>(fn: F, ...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => new Promise((resolve, reject) => {
    lock().then((release) => {
      try {
        const res: unknown = fn(...args)
        if (isPromise(res)) {
          ;(res as PromiseLike<unknown>).then(
            (value) => { resolve(value as Awaited<ReturnType<F>>); release() },
            (err) => { reject(err); release() },
          )
          return
        }
        resolve(res as Awaited<ReturnType<F>>)
        release()
      } catch (err) {
        reject(err)
        release()
      }
    })
  })) as AsyncFnQueue

  Object.defineProperty(enqueue, 'pending', { get: () => lock.pending })
  Object.defineProperty(enqueue, 'queued', { get: () => lock.queued })

  return enqueue
}

/**
 * Create a pool of `concurrency` invocations of `fn`.
 */
export const createAsyncFnPool = <F extends AnyAsyncFn>(
  fn: F,
  concurrency = 1,
  ...args: Parameters<F>
): Promise<Array<Awaited<ReturnType<F>>>> => {
  const queue: Array<Promise<Awaited<ReturnType<F>>>> = new Array(concurrency).fill(fn(...args))
  return Promise.all(queue)
}

export interface ConcurrencyLockedFn<F extends AnyAsyncFn> {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>
  readonly pending: number
  readonly queued: number
}

export function createConcurrencyLockedFn<F extends AnyAsyncFn>(fn: F, concurrency?: number): ConcurrencyLockedFn<F>
export function createConcurrencyLockedFn<F extends AnyAsyncFn>(fns: F[], concurrency?: number): Array<ConcurrencyLockedFn<F>>
export function createConcurrencyLockedFn(
  fns: AnyAsyncFn | AnyAsyncFn[],
  concurrency = 1,
): ConcurrencyLockedFn<AnyAsyncFn> | Array<ConcurrencyLockedFn<AnyAsyncFn>> | null {
  const list = typeof fns === 'function' ? [fns] : [...fns]
  const lock = createConcurrencyLock(concurrency)

  const create = (fn: AnyAsyncFn): ConcurrencyLockedFn<AnyAsyncFn> => {
    const clocked = ((...args: unknown[]): Promise<unknown> => new Promise((resolve, reject) => {
      lock().then((release) => fn(...args).then(
        (value: unknown) => { resolve(value); release() },
        (err: unknown) => { reject(err); release() },
      ))
    })) as ConcurrencyLockedFn<AnyAsyncFn>

    Object.defineProperty(clocked, 'pending', { get: () => lock.pending })
    Object.defineProperty(clocked, 'queued', { get: () => lock.queued })

    return clocked
  }

  if (list.length === 0) return null
  if (list.length === 1) return create(list[0]!)
  return list.map(create)
}

export const createCLockedFn = createConcurrencyLockedFn
export const clock = createConcurrencyLockedFn

/**
 * Returns a rate-limited version of `fn`.
 */
export interface RateLimitedFn<F extends AnyAsyncFn> {
  (...args: Parameters<F>): Promise<Awaited<ReturnType<F>>>
  readonly pending: number
  readonly queued: Array<() => void>
}

export const createRateLimitedFn = <F extends AnyAsyncFn>(
  fn: F,
  rate = 1,
  interval = 1000,
): RateLimitedFn<F> => {
  let count = 0
  const pending: Array<() => void> = []

  const tick = (): void => {
    count++
    sleep(interval).then(() => {
      count--
      if (count <= rate && pending.length) {
        pending.pop()!()
      }
    })
  }

  const schedule = (resolve: (v: unknown) => void, reject: (e: unknown) => void, args: Parameters<F>): void => {
    if (count >= rate) {
      pending.push(() => {
        tick()
        fn(...args).then(resolve, reject)
      })
      return
    }
    tick()
    fn(...args).then(resolve, reject)
  }

  const limited = ((...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> => new Promise((resolve, reject) => {
    schedule(resolve as (v: unknown) => void, reject, args)
  })) as RateLimitedFn<F>

  Object.defineProperty(limited, 'pending', { get: () => count })
  Object.defineProperty(limited, 'queued', { get: () => pending })

  return limited
}

export const limit = createRateLimitedFn

/**
 * Time the execution of `fn`.
 */
export type BenchmarkPrecision = 's' | 'ms' | 'ns'

export const benchmark = <F extends AnyAsyncFn>(
  fn: F,
  precision: BenchmarkPrecision | string = 'ms',
  ...args: Parameters<F>
): Promise<[number, Awaited<ReturnType<F>>]> => new Promise((resolve, reject) => {
  const t = process.hrtime()
  fn(...args).then((value: Awaited<ReturnType<F>>) => {
    const [s, ns] = process.hrtime(t)
    if (precision === 's') return resolve([Math.round(s + (ns / 1_000_000_000)), value])
    if (precision === 'ns') return resolve([Math.round((s * 1_000_000_000) + ns), value])
    return resolve([Math.round((s * 1000) + (ns / 1_000_000)), value])
  }, reject)
})
```

Aliases preserved per the existing test/aliases group: `clock`/`createCLockedFn`/`createConcurrencyLockedFn`, `mutex`/`createCLock`/`createConcurrencyLock`, `limit`/`createRateLimitedFn`, `retry`/`createRetrierFn`. The alias check in `test/index.js` compares `.toString()` of the functions, so they MUST be the same reference (which the `export const X = Y` form guarantees).

- [ ] **Step 2: Delete the old file**

```bash
git rm src/index.js
```

- [ ] **Step 3: Type-check the full source tree**

Run: `npx tsc --noEmit`
Expected: zero errors. If errors appear, fix in `src/` (do not silence with `any` unless porting an existing untyped pattern).

- [ ] **Step 4: Build to verify tsup output**

Run: `npm run build`
Expected: `dist/` populated with `index.js`, `index.cjs`, `index.d.ts`, `index.d.cts`, and `.map` files. No errors.

- [ ] **Step 5: Smoke-test both bundles**

Run:
```bash
node -e "import('./dist/index.js').then(m => console.log('esm:', Object.keys(m).sort().length, 'exports'))"
node -e "console.log('cjs:', Object.keys(require('./dist/index.cjs')).sort().length, 'exports')"
```
Expected: both print `21 exports` (matching the count in the test/index.js expected array: 21 names).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "refactor: port index to typescript with full type coverage"
```

---

## Task 10: ESLint flat config

**Files:**
- Create: `/Users/loboyle/src/async-hofs/eslint.config.js`
- Delete: `/Users/loboyle/src/async-hofs/.eslintrc`

- [ ] **Step 1: Write eslint.config.js**

```javascript
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@stylistic': stylistic },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/arrow-parens': 'off',
      '@stylistic/no-multiple-empty-lines': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-underscore-dangle': 'off',
      'no-param-reassign': 'off',
      'prefer-arrow-callback': 'off',
      'func-names': 'off',
      'no-plusplus': 'off',
      'no-loop-func': 'off',
      'no-await-in-loop': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'no-promise-executor-return': 'off',
      'prefer-promise-reject-errors': 'off',
      'prefer-exponentiation-operator': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
```

- [ ] **Step 2: Add eslint flat-config peer deps**

ESLint 9 flat config needs `@eslint/js` and `globals`. Add them:

```bash
npm install --save-dev @eslint/js globals
```

- [ ] **Step 3: Delete the old config**

```bash
git rm .eslintrc
```

- [ ] **Step 4: Run lint**

Run: `npm run test:lint`
Expected: passes (any stylistic violations should be fixed in source — re-edit the relevant `src/*.ts` files if needed).

If there are violations, fix them in the source rather than further loosening rules. The rule set deliberately mirrors the old `.eslintrc` (no semis, 2-space indent, single quotes, trailing commas in multiline).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json package-lock.json
git commit -m "chore: migrate to eslint 9 flat config with typescript-eslint"
```

---

## Task 11: Migrate test/buffer.js to ESM ava 8

**Files:**
- Modify: `/Users/loboyle/src/async-hofs/test/buffer.js`

- [ ] **Step 1: Rewrite test/buffer.js**

```javascript
import test from 'ava'
import { Readable } from 'node:stream'
import { buffer } from '../dist/index.js'

test('buffer - buffers a writable stream', async (t) => {
  const CHAR_STRING = 'some string of characters... :)'
  const LONG_STRING = 'this string of characters is too long...'
  const BYTE_LENGTH = Buffer.byteLength(LONG_STRING)

  const createReadStream = (str) => new Readable({
    read() {
      const chunk = Buffer.from(str.slice(0, 4))
      str = str.slice(4)
      return this.push(chunk.length ? chunk : null)
    },
  })

  let readable = createReadStream(CHAR_STRING)
  const b = await buffer(readable)
  t.true(String(b) === CHAR_STRING)

  readable = createReadStream(LONG_STRING)
  let message
  try {
    await buffer(readable, BYTE_LENGTH - 4)
  } catch (err) {
    message = err.message
  }
  t.true(message === 'Byte limit exceeded.')
  t.true(message === buffer.LIMIT_EXCEEDED)

  // Two consumers should return the same promise.
  t.true(buffer(readable) === buffer(readable))
})
```

Notes:
- `import test from 'ava'` — ava 8 default-exports `test`.
- Import from `../dist/index.js` because the build output is what we publish; importing source `.ts` would require a loader and bypass the build verification.

- [ ] **Step 2: Run the test**

Run: `npx ava -v -s -c 1 test/buffer.js`
Expected: 1 passing test.

- [ ] **Step 3: Commit**

```bash
git add test/buffer.js
git commit -m "test: migrate buffer tests to ava 8 esm"
```

---

## Task 12: Migrate test/retrier.js to ESM ava 8

**Files:**
- Modify: `/Users/loboyle/src/async-hofs/test/retrier.js`

- [ ] **Step 1: Rewrite test/retrier.js**

```javascript
import test from 'ava'
import {
  createLinear,
  createExponential,
  createRetrierFn,
} from '../dist/index.js'

test('createRetrierFn - retries async errors with delay', async (t) => {
  const sleep = (x) => new Promise((r) => setTimeout(r, x))

  const createFailer = (i) => async () => {
    await sleep(0)
    if (i) {
      i--
      throw new Error(i)
    }
    return true
  }

  const succeeder = createRetrierFn(createFailer(2), () => 15, 3)
  t.true(typeof succeeder === 'function')

  const start = Date.now()
  const success = await succeeder()
  t.true(success)
  t.true(Date.now() - start >= 30)

  const failer = createRetrierFn(createFailer(4), 2)
  t.true(typeof succeeder === 'function')

  let failure
  try {
    failure = await failer()
  } catch ({ message }) {
    failure = +message
  }
  t.true(failure === 2)
})

test('createRetrierFn - retries sync errors', async (t) => {
  const responses = [new Error('fail'), true]
  function failOnce() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }
  const fn = createRetrierFn(failOnce, 2)
  t.true(await fn())
})

test('createRetrierFn - allows opt out of retries', async (t) => {
  const shouldRetry = () => false
  const responses = [new Error('fail'), true]
  function failOnce() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }
  const fn = createRetrierFn(failOnce, 2, undefined, shouldRetry)
  try {
    await fn()
    t.fail()
  } catch (error) {
    t.pass()
  }
})

test('createRetrierFn - allows indefinite retries', async (t) => {
  const responses = [
    new Error('fail'),
    new Error('fail'),
    new Error('fail'),
    new Error('fail'),
    true,
  ]
  function failMany() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }
  const fn = createRetrierFn(failMany, 0, 0)
  try {
    await fn()
    t.pass()
  } catch (error) {
    t.fail()
  }
})

test('createRetrierFn - supports curves', async (t) => {
  const sleep = (x) => new Promise((r) => setTimeout(r, x))
  const cache = []
  const createFn = () => {
    let failed = false
    return async (value) => {
      await sleep(100)
      cache.push(value)
      if (!failed) {
        failed = true
        throw new Error('')
      }
      return value
    }
  }

  let f = createFn()
  let fn = createRetrierFn(f, 2)
  t.true(await fn('x') === 'x')
  t.true(cache.length === 2)

  cache.length = 0
  f = createFn()
  fn = createRetrierFn(f, (x) => x, 2)
  t.true(await fn('x') === 'x')
  t.true(cache.length === 2)
})

test('createRetrierFn - and inbuilt curves', (t) => {
  const range = function* (len) {
    let count = 0
    while (count < len) {
      yield count
      count++
    }
  }

  let fx = createLinear({ m: 2, b: 0 })
  t.deepEqual([...range(4)].map(fx), [0, 2, 4, 6])

  fx = createExponential({ a: 2, b: 1 }, 1)
  t.deepEqual([...range(6)].map(fx), [1, 2, 4, 8, 16, 32])

  fx = createExponential({ a: 2, b: 1 }, 1000)
  t.deepEqual([...range(6)].map(fx), [1000, 2000, 4000, 8000, 16000, 32000])
})
```

- [ ] **Step 2: Run the tests**

Run: `npx ava -v -s -c 1 test/retrier.js`
Expected: 6 passing tests.

- [ ] **Step 3: Commit**

```bash
git add test/retrier.js
git commit -m "test: migrate retrier tests to ava 8 esm"
```

---

## Task 13: Migrate test/memoize.js to ESM ava 8 (replacing test.cb)

**Files:**
- Modify: `/Users/loboyle/src/async-hofs/test/memoize.js`

The original uses `test.cb` which is removed in ava 8. Convert the callback-style test to an async test that awaits the Promise.all.

- [ ] **Step 1: Rewrite test/memoize.js**

```javascript
import test from 'ava'
import { memoize } from '../dist/index.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('memoize - basic functionality tests', async (t) => {
  const fn = memoize((x) => x + 1)

  t.true(typeof fn.cache === 'object')
  t.true(fn(1) instanceof Promise)

  const a = memoize(() => new Promise((r) => setTimeout(r, 100)))
  t.true(a() instanceof Promise)

  const p = Promise.all([fn(1), fn(2), fn(3)]).then((res) => {
    t.deepEqual(res, [2, 3, 4])
    t.deepEqual(fn.cache, { 1: 2, 2: 3, 3: 4 })
  })

  // Failures must not append to cache.
  const q = new Promise((resolve) => {
    const m = memoize(() => new Promise((_, reject) => {
      setTimeout(reject, 0)
    }))
    m().catch(() => {
      t.true(true)
      t.deepEqual(m.cache, {})
      resolve()
    })
  })

  await Promise.all([p, q])
})

test('memoize - allows for a time to live', async (t) => {
  const fn = memoize((x) => x + 1, 128)

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)

  t.deepEqual(fn.cache, { 1: 2, 2: 3, 3: 4 })

  await sleep(64)
  t.deepEqual(fn.cache, { 1: 2, 2: 3, 3: 4 })

  t.true(await fn(4) === 5)
  await sleep(96)
  await sleep(256)
  t.deepEqual(fn.cache, {})

  t.true(await fn(4) === 5)
  await sleep(64)
  t.deepEqual(fn.cache, { 4: 5 })

  t.true(await fn(4) === 5)
  t.deepEqual(fn.cache, { 4: 5 })

  await sleep(32)
  t.deepEqual(fn.cache, { 4: 5 })

  await sleep(32)
  t.deepEqual(fn.cache, {})
})

test('memoize - accepts custom serialization', async (t) => {
  const s = function () {
    const args = Array.prototype.slice.call(arguments)
    return args[0] * args[1]
  }

  const w = function () {
    const args = Array.prototype.slice.call(arguments)
    return args[0] / args[1]
  }

  const fn = memoize(w, s)

  await fn(1, 2)
  await fn(3, 4)
  await fn(4, 5)

  t.deepEqual(fn.cache, { 2: 0.5, 12: 0.75, 20: 0.8 })

  const v = await fn(2, 10)
  t.deepEqual(fn.cache, { 2: 0.5, 12: 0.75, 20: 0.8 })
  t.true(v === 0.8)
})
```

- [ ] **Step 2: Run the tests**

Run: `npx ava -v -s -c 1 test/memoize.js`
Expected: 3 passing tests.

- [ ] **Step 3: Commit**

```bash
git add test/memoize.js
git commit -m "test: migrate memoize tests to ava 8 esm and drop test.cb"
```

---

## Task 14: Migrate test/index.js to ESM ava 8 (replacing two test.cb cases)

**Files:**
- Modify: `/Users/loboyle/src/async-hofs/test/index.js`

The original uses `test.cb` for `createConcurrencyLock` and `createConcurrencyLockedFn`. Convert both to async tests.

- [ ] **Step 1: Rewrite test/index.js**

```javascript
import test from 'ava'
import * as hofs from '../dist/index.js'

test('hofs - correctly exports all functions', (t) => {
  const fns = Object.keys(hofs).filter((k) => k !== 'default').sort()
  const expected = [
    'benchmark',
    'buffer',
    'clock',
    'compose',
    'createAsyncFnPool',
    'createAsyncFnQueue',
    'createCLock',
    'createCLockedFn',
    'createConcurrencyLock',
    'createConcurrencyLockedFn',
    'createExponential',
    'createLinear',
    'createRateLimitedFn',
    'createRetrierFn',
    'limit',
    'memoize',
    'mutex',
    'retry',
    'sequence',
    'sleep',
    'zero',
  ]

  t.deepEqual(fns, expected)

  for (const fn of fns) t.true(typeof hofs[fn] === 'function')

  const aliases = [
    ['clock', 'createCLockedFn', 'createConcurrencyLockedFn'],
    ['mutex', 'createCLock', 'createConcurrencyLock'],
    ['limit', 'createRateLimitedFn'],
    ['retry', 'createRetrierFn'],
  ]

  for (const group of aliases) {
    const code = group.map((fn) => hofs[fn].toString())
    const source = code.shift()
    for (const alias of code) t.true(source === alias)
  }
})

test('createAsyncFnQueue - creates an async queue', async (t) => {
  const { sleep, createAsyncFnQueue } = hofs
  const output = []

  const createPusher = (n, ms) => async () => {
    await sleep(ms)
    return output.push(n)
  }

  let enqueue = createAsyncFnQueue(1)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])
  t.deepEqual(output, [1, 2, 3])

  output.length = 0
  enqueue = createAsyncFnQueue(3)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])
  t.deepEqual(output, [3, 2, 1])

  output.length = 0
  enqueue = createAsyncFnQueue(2)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])
  t.deepEqual(output, [2, 1, 3])

  await createAsyncFnQueue(1)(() => Promise.reject('w00t')).catch(() => {})
  t.true(await createAsyncFnQueue(1)(() => 1) === 1)
  await createAsyncFnQueue(1)(() => { throw new Error('fail') }).catch(() => {})
})

test('createAsyncFnPool - creates a pool of async functions', async (t) => {
  const { createAsyncFnPool } = hofs
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const expected = [...input]
  const output = []

  const sleep = (x) => new Promise((r) => setTimeout(r, x))
  const coroutine = async () => {
    let v
    while (v = input.shift()) {
      await sleep(0)
      output.push(v)
    }
  }

  t.true(!output.length)
  await createAsyncFnPool(coroutine, 2)
  t.deepEqual(expected, output)

  input.push(...output)
  output.length = 0
  expected.length = 0
  expected.push(10, 9, 8)

  const failer = async () => {
    let v
    while (v = input.pop()) {
      await sleep(0)
      if (v === 7) throw new Error(v)
      output.push(v)
    }
  }

  t.true(!output.length)

  let err
  try {
    await createAsyncFnPool(failer, 8)
  } catch ({ message }) {
    err = +message
  }

  t.true(err === 7)
  t.true(output.shift() === 10)
})

test('sequence - composes async functions left to right', async (t) => {
  const { sequence } = hofs
  const append = (x) => new Promise((r) => setTimeout(() => r(x + 1), 0))
  const fns = []
  while (fns.length < 16) fns.push(append)

  let fn = sequence(...fns)
  let v = await fn(0)
  t.true(v === 16)

  const vs = await Promise.all([fn(0), fn(1), fn(2), fn(3)])
  t.deepEqual([16, 17, 18, 19], vs)

  fns.length = 0
  const createPusher = (x) => (y) => new Promise((resolve) => setTimeout(resolve, 0, [...y, x]))
  while (fns.length < 4) fns.push(createPusher(fns.length))

  fn = sequence(...fns)
  v = await fn([])
  t.deepEqual([0, 1, 2, 3], v)
})

test('compose - right to left composition', async (t) => {
  const { compose } = hofs
  const createAppender = (x) => (str) => Promise.resolve(`${str}${x}`)
  const fns = []
  while (fns.length < 4) fns.push(createAppender(fns.length))

  const fn = compose(...fns)
  const v = await fn('')
  t.true(v === '3210')
})

test('clock - returns a function that limits concurrent calls', async (t) => {
  const { createCLockedFn } = hofs

  const createWorker = (ms) => (v, fail = false) => new Promise((resolve, reject) => {
    setTimeout(fail ? reject : resolve, ms, v)
  })

  let fn = createCLockedFn(createWorker(1000), 4)

  t.true(typeof fn.pending === 'number')
  t.true(typeof fn.queued === 'number')

  const a = []
  while (a.length < 16) a.push(fn('x'))

  const p = Promise.all(a)
  t.true(fn.pending === 16)
  t.true(fn.queued === 12)

  let bench = process.hrtime()
  await p
  bench = process.hrtime(bench)

  t.true(bench.shift() === 4)

  fn = createCLockedFn(createWorker(0), 1)

  const PASSTROUGH = 'some value or error'
  let v = await fn(PASSTROUGH)
  t.true(v === PASSTROUGH)

  v = undefined
  try {
    v = await fn(PASSTROUGH, true)
  } catch (_v) {
    v = _v
  }
  t.true(v === PASSTROUGH)
})

test('createRateLimitedFn - limits the execution rate of a function', async (t) => {
  const { sleep, createRateLimitedFn } = hofs

  const createPusher = (ms) => {
    const cache = []
    const fn = async (value) => {
      await sleep(ms)
      cache.push(value)
    }
    fn.cache = cache
    return fn
  }

  const fn = createPusher(100)
  const rfn = createRateLimitedFn(fn, 100, 1000)

  let count = 200
  while (count > 0) rfn(count--)

  await sleep(500)
  t.true(fn.cache.length === 100)
  await sleep(1000)
  t.true(fn.cache.length === 200)
})

test('createConcurrencyLock', async (t) => {
  const { sleep, createConcurrencyLock } = hofs
  const lock = createConcurrencyLock(1)

  const first = lock()
  t.true(typeof first.then === 'function')

  const cache = []

  const second = lock()
  const secondDone = second.then((release) => {
    cache.push(2)
    release()
  })

  const firstDone = first.then(async (release) => {
    cache.push(1)
    t.true(cache.length === 1)

    await sleep()
    t.true(cache.length === 1)
    t.true(cache[0] === 1)
    release()

    await sleep()
    t.true(cache.length === 2)
    t.true(cache[0] === 1)
    t.true(cache[1] === 2)
  })

  await Promise.all([firstDone, secondDone])
})

test('createConcurrencyLockedFn', async (t) => {
  const { sleep, createConcurrencyLockedFn } = hofs
  const cache = []
  const fn = createConcurrencyLockedFn(async (value, ms) => {
    await sleep(ms)
    cache.push(value)
  }, 1)

  const a = fn(1, 24).then(() => {
    t.true(cache.length === 1)
    t.true(cache[0] === 1)
  })

  const b = fn(2, 8).then(() => {
    t.true(cache.length === 2)
    t.true(cache[0] === 1)
    t.true(cache[1] === 2)
  })

  t.true(cache.length === 0)

  await Promise.all([a, b])
})

test('benchmark - times an async function', async (t) => {
  const { benchmark } = hofs

  const createSleeper = (timeout = 16, fail = false) => (value) => new Promise((resolve, reject) => setTimeout(!fail ? resolve : reject, timeout, value))

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null))
    t.true(time.toString().length === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'ms')
    t.true(time.toString().length === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'gs')
    t.true(time.toString().length === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'ns')
    t.true(time.toString().length > 6)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper(2 * 1000)
    const [time, value] = await benchmark(sleep.bind(null, null), 's')
    t.true(time === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [, value] = await benchmark(sleep, 'ms', null)
    t.true(value === null)
  })()

  await (async () => {
    const MESSAGE = 'MESSAGE'
    const sleep = createSleeper(16, true)
    let message
    try {
      await benchmark(sleep.bind(null, new Error(MESSAGE)))
    } catch (err) { message = err.message }
    t.true(message === MESSAGE)
  })()
})
```

Key change from the original: the namespace import `import * as hofs from '../dist/index.js'` filters out the `default` key (if tsup adds one for CJS interop) so the exports count check still matches.

- [ ] **Step 2: Run the tests**

Run: `npx ava -v -s -c 1 test/index.js`
Expected: 9 passing tests.

- [ ] **Step 3: Commit**

```bash
git add test/index.js
git commit -m "test: migrate index tests to ava 8 esm and drop test.cb"
```

---

## Task 15: Verify full test suite + types + lint

**Files:**
- None

- [ ] **Step 1: Clean build**

Run: `npm run build`
Expected: clean dist/ output, no warnings.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: lint passes, types pass, all 19 ava tests pass (1+6+3+9). No warnings about deprecated APIs.

- [ ] **Step 3: Verify the CJS bundle works from a consumer's perspective**

Run:
```bash
node -e "
const h = require('./dist/index.cjs');
const expected = ['benchmark','buffer','clock','compose','createAsyncFnPool','createAsyncFnQueue','createCLock','createCLockedFn','createConcurrencyLock','createConcurrencyLockedFn','createExponential','createLinear','createRateLimitedFn','createRetrierFn','limit','memoize','mutex','retry','sequence','sleep','zero'];
const got = Object.keys(h).filter(k => k !== 'default').sort();
const ok = JSON.stringify(expected) === JSON.stringify(got);
if (!ok) { console.error('mismatch', got); process.exit(1); }
console.log('cjs exports OK');
"
```
Expected: prints `cjs exports OK`.

- [ ] **Step 4: Verify the ESM bundle works from a consumer's perspective**

Run:
```bash
node -e "
import('./dist/index.js').then(h => {
  const expected = ['benchmark','buffer','clock','compose','createAsyncFnPool','createAsyncFnQueue','createCLock','createCLockedFn','createConcurrencyLock','createConcurrencyLockedFn','createExponential','createLinear','createRateLimitedFn','createRetrierFn','limit','memoize','mutex','retry','sequence','sleep','zero'];
  const got = Object.keys(h).filter(k => k !== 'default').sort();
  const ok = JSON.stringify(expected) === JSON.stringify(got);
  if (!ok) { console.error('mismatch', got); process.exit(1); }
  console.log('esm exports OK');
});
"
```
Expected: prints `esm exports OK`.

- [ ] **Step 5: Inspect the published artefacts**

Run: `npm pack --dry-run`
Expected: tarball contents include only `package.json`, `README.md`, `LICENSE.md` (if matched), and `dist/` (the index files + `.d.ts` + `.d.cts` + maps). No `src/`, no `test/`, no `tsconfig.json`, no `tsup.config.ts`.

If `src/` or other dev files appear, double-check `package.json` `files` is `["dist"]`.

- [ ] **Step 6: No commit needed**

This task is verification only.

---

## Task 16: Add changeset and update README

**Files:**
- Create: `/Users/loboyle/src/async-hofs/.changeset/modernise-esm-ts-tsup.md`
- Modify: `/Users/loboyle/src/async-hofs/README.md`

This is a **major version bump** because:
1. `"type": "module"` changes how Node resolves the package
2. CJS consumers now go through `exports['.'].require` instead of the bare `main`
3. The package no longer ships source `.js`; only `dist/`

Existing CJS consumers using `require('@raywhite/async-hofs')` will continue to work (we ship a CJS bundle), but the resolved file path changes and unusual deep imports (`require('@raywhite/async-hofs/src/memoize')`) will break.

- [ ] **Step 1: Write the changeset**

```markdown
---
'@raywhite/async-hofs': major
---

Modernise package: TypeScript source, dual ESM+CJS publishing via tsup, ava 8, eslint 9 flat config.

- Package is now `"type": "module"` with a proper `exports` map serving both ESM (`import`) and CJS (`require`) consumers from a built `dist/`.
- TypeScript declarations (`.d.ts` / `.d.cts`) are shipped for both module systems.
- Source moved to `src/*.ts`; the published tarball only contains `dist/`.
- Tests upgraded to ava 8 (ESM). `test.cb` usage replaced with promise-returning tests.
- Deprecated devDependency `got` removed (no longer required by ava). Babel/airbnb-base eslint stack replaced with typescript-eslint + @stylistic on eslint 9 flat config.
- No public API changes — all 21 named exports and all four alias groups (`clock`/`createCLockedFn`/`createConcurrencyLockedFn`, `mutex`/`createCLock`/`createConcurrencyLock`, `limit`/`createRateLimitedFn`, `retry`/`createRetrierFn`) are preserved.

**Breaking for consumers who:**
- Imported internal files directly (e.g. `require('@raywhite/async-hofs/src/memoize')`) — only `.` is exposed via `exports`.
- Pinned `engines.node` below 22 — the package now targets Node 22+.
```

- [ ] **Step 2: Update README.md**

Modify `README.md`. Replace the **Setup** section (lines 9–15) with:

```markdown
## Setup

To clone run `git clone https://github.com/raywhite/async-hofs`.

The package is written in TypeScript and built with [tsup](https://tsup.egoist.dev/) to ship both ESM and CJS bundles plus type declarations. Build with `npm run build`. Tests are written using [ava](https://github.com/avajs/ava) against the built `dist/` output (so they verify the actual shipped artefact); run them with `npm run test:node`. The full check (`npm test`) runs `eslint`, `tsc --noEmit`, and the ava suite.

To install as a dep, run `npm install @raywhite/async-hofs --save`. The package supports both `import { memoize } from '@raywhite/async-hofs'` (ESM) and `const { memoize } = require('@raywhite/async-hofs')` (CJS).
```

Leave the API documentation untouched — the surface hasn't changed.

- [ ] **Step 3: Commit**

```bash
git add .changeset/modernise-esm-ts-tsup.md README.md
git commit -m "docs: add changeset and update readme for esm/ts migration"
```

---

## Task 17: Push, open PR, close superseded dependabot PR

**Files:**
- None (git/GH operations only)

- [ ] **Step 1: Push branch**

```bash
git push -u origin lo/modernise-esm-ts-tsup
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "Modernise: TypeScript + ESM + tsup + ava 8" --body "$(cat <<'EOF'
## Summary
- Move `src/` from CommonJS JS to TypeScript and build with `tsup` to ship both ESM and CJS bundles plus `.d.ts` / `.d.cts` declarations.
- Migrate ava 3 → 8 (ESM-only). Drop `test.cb` usage (removed in ava 8) in favour of promise-returning tests.
- Remove `got` (no longer required after the ava bump — same change as dependabot #28, subsumed here).
- Replace the babel/airbnb-base eslint stack with eslint 9 flat config + `typescript-eslint` + `@stylistic` rules ported from `.eslintrc`.
- Add `tsconfig.json` (strict, `noEmit`) for type-checking.

## Public API
No changes. All 21 named exports and the four alias groups (`clock`/`createCLockedFn`/`createConcurrencyLockedFn`, `mutex`/`createCLock`/`createConcurrencyLock`, `limit`/`createRateLimitedFn`, `retry`/`createRetrierFn`) are preserved. Existing CJS consumers (`const h = require('@raywhite/async-hofs')`) continue to work via the `exports['.'].require` condition. ESM consumers can now `import { memoize } from '@raywhite/async-hofs'`.

## Breaking (major bump)
- Deep imports into `src/` no longer work (only `.` is exposed via `exports`).
- Engines target Node 22+ (ava 8's floor).

## Supersedes
Closes #28 — that PR's scope (ava 8 + got removal) is subsumed here.

## Recommended review order
1. `package.json` — dep + scripts + `exports` shape
2. `tsconfig.json` and `tsup.config.ts` — build/type pipeline
3. `eslint.config.js` — lint rule parity with old `.eslintrc`
4. `src/utilities.ts`, `src/memoize.ts`, `src/retrier.ts`, `src/buffer.ts` — direct ports
5. `src/index.ts` — re-exports + the more complex hofs (sequencer, lock, queue, pool, clock, rate-limited, benchmark)
6. `test/*.js` — esm conversion + `test.cb` → async; note tests import from `dist/` to exercise the actually-shipped artefact
7. `.changeset/modernise-esm-ts-tsup.md` and `README.md`

## Manual test guide
```bash
npm install
npm test        # runs lint + tsc --noEmit + ava
npm run build   # rebuilds dist/
npm pack --dry-run  # confirm tarball only includes dist/, package.json, README.md, LICENSE.md
```

To check downstream consumption locally:
```bash
node -e "const h = require('./dist/index.cjs'); console.log(Object.keys(h).length)"
node --input-type=module -e "import('./dist/index.js').then(h => console.log(Object.keys(h).length))"
```

## Automated tests
- 19 ava tests across `test/buffer.js`, `test/index.js`, `test/memoize.js`, `test/retrier.js` — full pre-existing suite, migrated to ava 8 ESM with `test.cb` cases rewritten as promise-returning tests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI to go green**

Run: `gh pr checks --watch`
Expected: lint + test + zizmor + block-fixup all PASS.

- [ ] **Step 4: After CI is green, close PR #28**

```bash
gh pr close 28 --comment "Superseded by the modernisation PR which includes the ava 8 bump and got removal alongside the broader TS/ESM/tsup migration."
```

Do NOT close #28 before this PR's CI is green.

- [ ] **Step 5: Done**

Hand back to user for review and merge.

---

## Self-Review Notes

**Spec coverage check:**
- ava 3 → 8 — Tasks 11–14 (tests rewritten, `test.cb` removed)
- Remove `got` — Task 2 (devDependencies block no longer lists it)
- eslint major bump (8 → 9) — Tasks 2 + 10 (devDep bump + flat-config rewrite)
- `"type": "module"` — Task 2 (`package.json`)
- TypeScript migration of `src/` — Tasks 5–9
- tsup publishing — Tasks 4 + 2 (`exports` map + `files: ["dist"]` + `prepublishOnly`)
- Dual CJS/ESM via tsup — Task 4 (`format: ['esm', 'cjs']`)
- TS types — Task 4 (`dts: true`)
- Migrate all 4 test files — Tasks 11–14
- Downstream consumer compat — Tasks 9 (smoke test), 15 (verification step 3+4), 16 (changeset documents breaking surface)

**Placeholder scan:** No TBDs / TODOs / "handle edge cases" / "similar to Task N" references.

**Type consistency:** Alias chains (`mutex` = `createCLock` = `createConcurrencyLock`, etc.) preserved as direct `export const X = Y` so `.toString()` equality holds in `test/index.js`. `MemoizedFn`, `ConcurrencyLock`, `AsyncFnQueue`, `ConcurrencyLockedFn`, `RateLimitedFn` all defined where first used. `Curve` type used consistently in `retrier.ts` and exposed for typed consumers.

**One known soft spot:** Task 9's `createConcurrencyLockedFn` overloads return `null` for the empty-array case. The original behaviour returned `null` too, so this matches — but if you want to tighten the public API in a future change, that's the place. Don't change it here; preserving behaviour is the contract for this PR.
