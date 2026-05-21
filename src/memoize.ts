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
