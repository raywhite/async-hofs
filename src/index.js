/**
 * This one is in no way an async util... but I'm using it heaps
 * and just want somewhere safe to export form ATM.
 *
 * NOTE: This is a fast simple implementation of a function
 * that can memoizes against a single (`string || number`)
 * param.
 *
 * TODO: This should actually be able to able handle memoization of async
 * functions, and might be useful for debouncing network calls - it should
 * cache the promise that is returned, so as to only allow the function to
 * actually make an I/O call every `ms` milliseconds.
 *
 * @param {Function}
 * @returns {Function}
 */
module.exports.memoize = function (fn) {
  const cache = {}

  /**
   * @param {String|Number}
   * @returns {Mixed}
   */
  const m = function (p) {
    if (cache[p]) return cache[p]
    cache[p] = fn(p)
    return cache[p]
  }

  Object.defineProperty(m, 'cache', {
    get() { return Object.assign({}, cache) },
  })

  return m
}

/**
 * Create a queue to handle processing of async functions with limited
 * concurrency.
 *
 * The returned function will queue the async function given for execution,
 * returning a promise that resolves or rejects when the function is actually
 * run and a result is available.
 *
 * @param {Number}
 * @returns {Function(fn => Promise)}
 */
function createAsyncFnQueue(concurrency = 1) {
  const pool = [...new Array(concurrency)].map((_, index) => Promise.resolve(index))
  let allocate = Promise.resolve()

  function process(fn) {
    return function (index) {
      try {
        const called = Promise.resolve(fn())
        const returnIndex = () => index
        pool[index] = called.then(returnIndex, returnIndex)
        return called
      } catch (error) {
        return Promise.reject(error)
      }
    }
  }

  function push(fn) {
    allocate = allocate.then(() => Promise.race(pool))
    return allocate.then(process(fn))
  }

  return push
}

module.exports.createAsyncFnQueue = createAsyncFnQueue

/**
 * Creates a pool of promises (AKA, the results of async
 * fn invokations) to distribute work and help with syncronising
 * concurrency.
 *
 * NOTE: If the provided coroutine requires params, use
 * `Array.prototype.bind` to set them.
 *
 * @param {Function}
 * @param {Number}
 * @returns {Promise => Array}
 */
module.exports.createAsyncFnPool = function (fn, concurrency = 1) {
  const enqueue = createAsyncFnQueue(concurrency)
  return Promise.all([...new Array(concurrency)].map(() => enqueue(fn)))
}

function limitRetrier(limit, delay = 0) {
  let retries = limit
  return function () {
    if (retries-- < 1) return false
    return delay
  }
}

/**
 * Wraps a function for retrying....  takes the retry limit.
 *
 * The limit may be given as an integer, which will cause that number of retries
 * to be permitted with no additional delay between each.  It may also be given
 * as a function which returns a delay, or a non-zero falsy value to stop retrying.
 *
 * @param {Function}
 * @param {Number | Function}
 * @returns {Function}
 */
module.exports.createRetrierFn = function (fn, limit = 2) {
  // Use a function to control retries, default one provides a fixed iteration
  // limit with no delay (backwards compatible)
  const getDelayFn = typeof limit === 'function'
    ? limit
    : limitRetrier(limit)

  /**
   * @param {...Mixed}
   * @returns {Mixed}
   */
  return function () {
    const args = [].slice.call(arguments)
    return new Promise(function (resolve, reject) {
      const recurse = function (err, getDelay) {
        const delay = getDelay()
        if (!delay && delay !== 0) {
          reject(err)
          return
        }
        setTimeout(function () {
          try {
            return fn.apply(null, args)
              .then(resolve)
              .catch(asyncErr => recurse(asyncErr, getDelay))
          } catch (syncErr) { // NOTE: Some sync error.
            return reject(syncErr)
          }
        }, delay)
      }

      return recurse(null, getDelayFn)
    })
  }
}

/**
 * Determines whether a value is a thenable, or a standard promise.
 *
 * @param {Mixed}
 * @returns {Boolean}
 */
const isPromise = function (value) {
  return value instanceof Promise || value.then
}

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
            return reject(serr) // NOTE: ßSome sync error.
          }

          return _v
        }

        return recurse(v).then(resolve)
      })
    }
  }
}

// `sequence` => left to right <= `compose`.
module.exports.sequence = createSequencer(Array.prototype.shift)
module.exports.compose = createSequencer(Array.prototype.pop)

// TODO: This will consume the stream... so has to error.
module.exports.buffer = (function () {
  const LIMIT_EXCEEDED = 'byte limit exceeded'
  const SECOND_STREAM_CONSUMER = 'stream already consumed'

  /**
   * @param {String}
   * @returns {Error}
   */
  const createError = function (str) {
    const err = new Error(str)
    err.type = str
    return err
  }

  const map = new WeakMap()

  /**
   * Buffers a readable stream - default to erroring when more than
   * 1MB is consumed.
   *
   * @param {stream.Readable}
   * @param {Number}
   * @returns {Promise => Buffer}
   */
  const buffer = function (readable, limit = (1000 * 1024)) {
    let len = 0
    const chunks = []

    return new Promise(function (resolve, reject) { // eslint-disable-line consistent-return
      if (map.has(readable)) return reject(createError(SECOND_STREAM_CONSUMER))

      map.set(readable, true)

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
  }

  // NOTE: exported as constants to allow assertion.
  buffer.LIMIT_EXCEEDED = LIMIT_EXCEEDED
  buffer.SECOND_STREAM_CONSUMER = SECOND_STREAM_CONSUMER

  return buffer
}())

/**
 * @param {Function}
 * @param {Number}
 * @returns {Function}
 */
const createCLockedFn = function (fn, concurrency = 1) {
  let num = 0
  const queue = []

  /**
   * @param {Function}
   * @returns {Void}
   */
  const schedule = function (invocation) {
    if (invocation) queue.push(invocation)
    if (num < concurrency && queue.length) {
      num++
      queue.shift()()
    }
  }

  /**
   * NOTE: Outcome is resolve or reject.
   *
   * @param {Function}
   * @returns {Void}
   */
  const createSolution = function (outcome) {
    return function (v) {
      num--
      schedule()
      outcome(v)
    }
  }

  /**
   * @param {Mixed}
   * @returns {Promise => Mixed}
   */
  const clocked = function (...args) {
    return new Promise(function (resolve, reject) {
      const invoke = function () {
        let v
        try {
          v = fn.call(null, ...args)
        } catch (err) {
          // The funciton threw synconously.
          num--
          return reject(err)
        }

        if (isPromise(v)) {
          return v.then(createSolution(resolve)).catch(createSolution(reject))
        }

        num--
        return resolve(v)
      }

      return schedule(invoke)
    })
  }

  // These values can be used to determine whether to add work.
  Object.defineProperty(clocked, 'pending', {
    get: () => num,
  })

  Object.defineProperty(clocked, 'queued', {
    get: () => queue.length,
  })

  return clocked
}

// Exported with an alias - which makes more sense.
module.exports.createCLockedFn = createCLockedFn
module.exports.clock = createCLockedFn

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
    pending -= 1
    if (scheduled.length) scheduled.pop()(unlock)
    return scheduled.length
  }

  return function lock() {
    pending += 1
    return new Promise(function (resolve) {
      if (pending > concurrency) {
        return scheduled.push(resolve)
      }

      return resolve(unlock)
    })
  }
}

module.exports.createConcurrencyLock = createConcurrencyLock

/**
 * TODO: This is almost API compatible with createCLockedFunction... but it
 * uses `createConcurrencyLock` internally, and can synchronise the locking
 * of any number of functions (as opposed to just one).
 *
 * @param {Number} concurrency
 * @param {...Function} fns
 */
const createConcurrencyLockedFn = function (concurrency, ...fns) {
  const lock = createConcurrencyLock(concurrency)

  const _createConcurrencyLockedFn = function (fn) {
    return function (...args) {
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
  }

  if (fns.length === 0) return null
  if (fns.length === 1) return _createConcurrencyLockedFn(fns.pop())
  return fns.map(_createConcurrencyLockedFn)
}

module.exports.createConcurrencyLockedFn = createConcurrencyLockedFn

/**
 * Returns a promise that resolves after `ms` milliseconds.
 *
 * @param {Number} ms
 * @returns {Void}
 * @private
 */
const sleep = function (ms = 1000) {
  return new Promise(function (resolve) {
    return setTimeout(resolve, ms)
  })
}

// NOTE: This is exported for tests.
module.exports.sleep = sleep

/**
 * Returns a rate limited version of the provided async function. The returned
 * function can be invoked at any rate, but will be executed a maximum of
 * `rate` times per `interval`.
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
      if (pending <= rate && pending.length) {
        pending.pop()()
      }
    })
  }

  const schedule = function (resolve, reject, ...args) {
    if (count > rate) {
      pending.push(function () {
        enqueue()
        return fn(...args).then(resolve).catch(reject)
      })
    }

    enqueue()
    return fn(...args).then(resolve).catch(reject)
  }

  /**
   * @param {...Mixed} args
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
