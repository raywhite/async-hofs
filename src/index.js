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

const createError = function (str) {
  const err = new Error(str)
  err.type = str
  return err
}

// TODO: This will consume the stream... so has to error.
module.exports.buffer = (function () {
  const LIMIT_EXCEEDED = 'byte limit exceeded'
  const SECOND_STREAM_CONSUMER = 'stream already consumed'

  const map = new WeakMap()

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

  buffer.LIMIT_EXCEEDED = LIMIT_EXCEEDED
  buffer.SECOND_STREAM_CONSUMER = SECOND_STREAM_CONSUMER

  return buffer
}())
