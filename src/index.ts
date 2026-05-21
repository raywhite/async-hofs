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
export function createConcurrencyLockedFn<F extends AnyAsyncFn>(fns: [F, ...F[]], concurrency?: number): Array<ConcurrencyLockedFn<F>>
export function createConcurrencyLockedFn<F extends AnyAsyncFn>(fns: F[], concurrency?: number): Array<ConcurrencyLockedFn<F>> | null
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
  precision: BenchmarkPrecision | (string & {}) = 'ms',
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
