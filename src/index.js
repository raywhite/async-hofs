module.exports.memoize = function (fn) {
  const cache = {}

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

module.exports.createAsyncFnPool = function (fn, concurrency = 1) {
  const pool = []

  try {
    while (concurrency) {
      pool.push(fn())
      concurrency--
    }
  } catch (err) {
    return Promise.reject(err)
  }

  return Promise.all(pool)
}

module.exports.createRetrierFn = function (fn, limit = 2) {
  return function (arg) {
    return new Promise(function (resolve, reject) {
      const recurse = function (err, r) {
        if (!r) return reject(err)
        try {
          return fn(arg).then(resolve).catch(e => recurse(e, r - 1))
        } catch (serr) { // NOTE: Some sync error.
          return reject(serr)
        }
      }

      return recurse(null, limit)
    })
  }
}

const isPromise = function (x) {
  return x instanceof Promise
}

const createSequencer = function (method) {
  return function (...fns) {
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

module.exports.sequence = createSequencer(Array.prototype.shift)
module.exports.compose = createSequencer(Array.prototype.pop)

// TODO: This will consume the stream... so has to error.
module.exports.buffer = (function () {
  const LIMIT_EXCEEDED = 'limit exceeded'
  const SECOND_STREAM_CONSUMER = 'stream is already consumed'

  const map = new WeakMap()

  return function (writable, limit = (1000 * 1024)) {
    let len = 0
    const chunks = []

    return new Promise(function (resolve, reject) { // eslint-disable-line consistent-return
      if (map.has(writable)) return reject(SECOND_STREAM_CONSUMER)
      map.set(writable, true)

      writable.on('data', function (chunk) {
        len += chunk.length
        if (len > limit) return reject(new Error(LIMIT_EXCEEDED))
        return chunks.push(chunk)
      })

      writable.on('end', function () {
        return resolve(Buffer.concat(chunks, len))
      })

      writable.on('error', function (err) {
        return reject(err)
      })
    })
  }
}())
