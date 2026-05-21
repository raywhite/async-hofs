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
