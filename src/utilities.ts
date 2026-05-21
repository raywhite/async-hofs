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
