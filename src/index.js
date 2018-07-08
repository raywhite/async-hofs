const { sleep, isPromise } = require('./utilities')

Object.assign(module.exports, require('./memoize'))
Object.assign(module.exports, require('./retrier'))
Object.assign(module.exports, require('./buffer'))

Object.assign(module.exports, { sleep })

/**
 * @param {Function}
 * @returns {Function}
 */
const createSequencer = function (method) {
  /**
   * Sequence or compose the provided args, even if they
   * aren't functions that return promises.
   *
   * NOTE: The only difference between sequence and compose
   * is the direction in which the args are consumed.
   *
   * @param {...Function}
   * @returns {Function}
   */
  return function (...fns) {
    /**
     * @param {Mixed}
     * @returns {Promise => Mixed}
     */
    return function (value) {
      return new Promise(function (resolve, reject) {
        const recurse = function (res) {
          const fn = method.call(fns)

          try {
            if (fn) {
              res = fn(res)
              if (!isPromise(res)) res = Promise.resolve(res)
              return res.then(recurse).catch(reject)
            }
          } catch (err) {
            return reject(err)
          }

          return res
        }

        return recurse(value).then(resolve)
      })
    }
  }
}

module.exports.sequence = createSequencer(Array.prototype.shift)
module.exports.compose = createSequencer(Array.prototype.pop)

/**
 * The returned `lock` function returns a promise that resolves with `release`.
 *
 * The user must ensure that `release` is called whenever work is complete.
 *
 * @param {Number} concurrency
 * @returns {Function}
 */
const createConcurrencyLock = function (concurrency = 3) {
  let pending = 0
  const scheduled = []

  const unlock = function () {
    pending--
    if (scheduled.length) scheduled.shift()(unlock)
    return scheduled.length
  }

  const lock = function () {
    pending++
    return new Promise(function (resolve) {
      if (pending > concurrency) {
        return scheduled.push(resolve)
      }

      return resolve(unlock)
    })
  }

  Object.defineProperty(lock, 'pending', {
    get: () => pending,
  })

  Object.defineProperty(lock, 'queued', {
    get: () => scheduled.length,
  })

  return lock
}

module.exports.mutex = createConcurrencyLock
module.exports.createCLock = createConcurrencyLock
module.exports.createConcurrencyLock = createConcurrencyLock

/**
 * Create a queue to handle processing of async functions with limited
 * concurrency.
 *
 * The returned function will queue the async function given for execution,
 * returning a promise that resolves or rejects when the function is actually
 * run and a result is available.
 *
 * @param {Number}
 * @returns {Function}
 */
const createAsyncFnQueue = function (concurrency = 1) {
  const lock = createConcurrencyLock(concurrency)

  const enqueue = function (fn, ...args) {
    return new Promise(function (resolve, reject) {
      return lock().then(function (release) {
        try {
          const res = fn(...args)
          if (isPromise(res)) {
            return res.then(function (value) {
              resolve(value)
              return release()
            }).catch(function (err) {
              reject(err)
              return release()
            })
          }

          resolve(res)
          return release()
        } catch (err) {
          reject(err)
          return release()
        }
      })
    })
  }

  Object.defineProperty(enqueue, 'pending', {
    get: () => lock.pending,
  })

  Object.defineProperty(enqueue, 'queued', {
    get: () => lock.queued,
  })

  return enqueue
}

module.exports.createAsyncFnQueue = createAsyncFnQueue

/**
 * Creates a pool of promises (AKA, the results of async
 * fn invokations) to distribute work and help with syncronising
 * concurrency.
 *
 * @param {Function}
 * @param {Number}
 * @param {...Mixed}
 * @returns {Promise => Array}
 */
module.exports.createAsyncFnPool = function (fn, concurrency = 1, ...args) {
  const queue = new Array(concurrency).fill(fn(...args))
  return Promise.all(queue)
}

/**
 * TODO: This is almost API compatible with createCLockedFunction... but it
 * uses `createConcurrencyLock` internally, and can synchronise the locking
 * of any number of functions (as opposed to just one).
 *
 * @param {...Function|Function} fns
 * @param {Number} concurrency
 */
const createConcurrencyLockedFn = function (fns, concurrency = 1) {
  if (typeof fns === 'function') fns = [fns]
  const _fns = [...fns]

  const lock = createConcurrencyLock(concurrency)

  const create = function (fn) {
    const clocked = function (...args) {
      return new Promise(function (resolve, reject) {
        lock().then(function (release) {
          /**
           * NOTE: `Promise.prototype.finally` is a TC39 proposal, it is
           * perfect for the use case below. Switch to:
           *
           * ```
           * return fn(...args).then(resolve).catch(reject).finally(release)
           * ```
           *
           * whenever it's available.
           */
          return fn(...args).then(function (value) {
            resolve(value)
            return release()
          }).catch(function (err) {
            reject(err)
            return release()
          })
        })
      })
    }

    Object.defineProperty(clocked, 'pending', {
      get: () => lock.pending,
    })

    Object.defineProperty(clocked, 'queued', {
      get: () => lock.queued,
    })

    return clocked
  }

  if (fns.length === 0) return null
  if (fns.length === 1) return create(_fns.pop())
  return fns.map(create)
}

// Exported with an alias - which makes more sense.
module.exports.createConcurrencyLockedFn = createConcurrencyLockedFn
module.exports.createCLockedFn = createConcurrencyLockedFn
module.exports.clock = createConcurrencyLockedFn

/**
 * Returns a rate limited version of the provided async function. The returned
 * function can be invoked at any rate, but will be executed a maximum of
 * `rate` times per `interval`.
 *
 * TODO: This should likely be capable of taking multiple functions and limited
 * their execution rate (instead of just one), like clock does.
 *
 * TODO: Interanally, this is a little inconsistent with the other functions
 * exposed in this file... it should use `pending` and `scheduled`.
 *
 * @param {Function} fn
 * @param {Number} rate
 * @param {Number} interval
 * @returns {Function}
 */
const createRateLimitedFn = function (fn, rate = 1, interval = 1000) {
  let count = 0
  const pending = []

  const enqueue = function () {
    count++

    sleep(interval).then(function () {
      count--
      if (count <= rate && pending.length) {
        pending.pop()()
      }
    })
  }

  const schedule = function (resolve, reject, ...args) {
    if (count >= rate) {
      return pending.push(function () {
        enqueue()
        return fn(...args).then(resolve).catch(reject)
      })
    }

    enqueue()
    return fn(...args).then(resolve).catch(reject)
  }

  /**
   * @param {...Mixed} args
   * @returns {Function}
   */
  const limited = function (...args) {
    return new Promise(function (resolve, reject) {
      schedule(resolve, reject, ...args)
    })
  }

  Object.defineProperty(limited, 'pending', {
    get: () => count,
  })

  Object.defineProperty(limited, 'queued', {
    get: () => pending,
  })

  return limited
}

module.exports.createRateLimitedFn = createRateLimitedFn
module.exports.limit = createRateLimitedFn

/**
 * Time the execustion of some async function.
 *
 * @param {Function}
 * @param {String} `s|ms|ns` (`ms` default)
 * @param {...Mixed}
 * @returns {Promise} => {Array} [time, value]
 */
const benchmark = function (fn, precision = 'ms', ...args) {
  return new Promise(function (resolve, reject) {
    const t = process.hrtime()
    fn(...args).then(function (value) {
      const [s, ns] = process.hrtime(t)

      if (precision === 's') return resolve([Math.round(s + (ns / 1000000000)), value])
      if (precision === 'ns') return resolve([Math.round((s * 1000000000) + ns), value])
      return resolve([Math.round((s * 1000) + (ns / 1000000)), value])
    }).catch(reject)
  })
}

module.exports.benchmark = benchmark
