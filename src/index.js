const { sleep, isPromise } = require('./utilities')

Object.assign(module.exports, require('./memoize'))
Object.assign(module.exports, require('./retrier'))

Object.assign(module.exports, { sleep })

/**
 * @pararm {Function}
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
    return function (v) {
      return new Promise(function (resolve, reject) {
        const recurse = function (_v) {
          const fn = method.call(fns)

          try {
            if (fn) {
              _v = fn(_v)
              if (!isPromise(_v)) _v = Promise.resolve(_v)
              return _v.then(recurse).catch(reject)
            }
          } catch (serr) {
            return reject(serr) // NOTE: Some sync error.
          }

          return _v
        }

        return recurse(v).then(resolve)
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

  return function (fn, ...args) {
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

// TODO: This will consume the stream... so has to error.
module.exports.buffer = (function () {
  const LIMIT_EXCEEDED = 'Byte limit exceeded.'
  const map = new WeakMap()

  /**
   * @param {String}
   * @returns {Error}
   */
  const createError = function (str) {
    const err = new Error(str)
    err.type = str
    return err
  }

  /**
   * Buffers a readable stream - default to erroring when more than
   * 1MB is consumed.
   *
   * @param {stream.Readable}
   * @param {Number}
   * @returns {Promise => Buffer}
   */
  const buffer = function (readable, limit = (1000 * 1024)) {
    if (map.has(readable)) return map.get(readable)

    const promise = new Promise(function (resolve, reject) {
      const chunks = []
      let len = 0

      readable.on('data', function (chunk) {
        len += chunk.length
        if (len > limit) return reject(createError(LIMIT_EXCEEDED))
        return chunks.push(chunk)
      })

      readable.on('end', function () {
        return resolve(Buffer.concat(chunks, len))
      })

      readable.on('error', function (err) {
        return reject(err)
      })
    })

    map.set(readable, promise)
    return promise
  }

  buffer.LIMIT_EXCEEDED = LIMIT_EXCEEDED
  return buffer
}())

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
  return function (...args) {
    return new Promise(function (resolve, reject) {
      schedule(resolve, reject, ...args)
    })
  }
}

module.exports.createRateLimitedFn = createRateLimitedFn

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
