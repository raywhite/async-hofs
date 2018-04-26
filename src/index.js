const { Transform } = require('stream')
/**
 * This one is in no way an async util... but I'm using it heaps
 * and just want somewhere safe to export form ATM.
 *
 * NOTE: This is a fast simple implementation of a function
 * that can memoizes against a single (`string || number`)
 * param.
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

const sleep = x => new Promise(r => setTimeout(r, x))

/**
 * Create a queue to handle processing of async functions with limited
 * concurrency.
 *
 * The returned object provides a `push()` method which will queue the async
 * function given for execution, returning a promise that resolves or rejects
 * when the function is actually run and a result is available.
 *
 * An `empty()` method is also provided, which resolves when all the currently
 * queued functions have completed.
 *
 * @param {Integer}
 * @returns {Object}
 */
function createAsyncFnQueue(concurrency = 1) {
  const pool = [...new Array(concurrency)].map((_, idx) => Promise.resolve(idx))

  const process = fn => (idx) => {
    try {
      const called = Promise.resolve(fn())
      const returnIndex = () => idx
      pool[idx] = called.then(returnIndex, returnIndex)
      return called
    } catch (error) {
      return Promise.reject(error)
    }
  }

  const push = fn => Promise.race(pool).then(process(fn))

  // Note: probably a timing issue here, could fix but more messy above
  const empty = () => sleep(0).then(() => Promise.all(pool))

  return { push, empty }
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
  const queue = createAsyncFnQueue(concurrency)

  return new Promise((resolve, reject) => {
    while (concurrency) {
      queue.push(fn).catch(reject)
      concurrency--
    }

    return queue.empty().then(resolve)
  })
}

/**
 * Wraps a function for retrying....  takes the retry limit.
 *
 * TODO: This only supports retrying `limit` times, all retiries
 * happen immediately once the previous attempt failed - but if
 * this function also accepted a curve, and a limt, then we could make
 * it do retries at linear or exponential intervals.
 *
 * @param {Function}
 * @param {Number}
 * @returns {Function}
 */
module.exports.createRetrierFn = function (fn, limit = 2) {
  /**
   * @param {...Mixed}
   * @returns {Mixed}
   */
  return function () {
    const args = [].slice.call(arguments)
    return new Promise(function (resolve, reject) {
      const recurse = function (err, remaining) {
        if (remaining === 0) return reject(err)
        try {
          return fn.apply(null, args)
            .then(resolve)
            .catch(asyncErr => recurse(asyncErr, remaining - 1))
        } catch (syncErr) { // NOTE: Some sync error.
          return reject(syncErr)
        }
      }

      return recurse(null, limit)
    })
  }
}

/**
 * @param {Mixed}
 * @returns {Boolean}
 */
const isPromise = function (x) {
  return x instanceof Promise
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

/**
 * Creates a through (transform) stream that emits `shard` events
 * - used to write to shards... not sure if this is the best
 * implementation for this sort of thing yet... so I might keep
 * it away from the docs for now :(
 *
 * @param {Function}
 * @returns {stream.Transform}
 */
const createSharderStream = function (fn) {
  return new Transform({
    transform(chunk, encoding, callback) {
      const [shard, ...values] = fn(chunk, encoding)
      if (shard) this.emit('shard', ...values)
      process.nextTick(this.push.bind(this, chunk))
      callback()
    },
  })
}


module.exports.createSharderStream = createSharderStream
