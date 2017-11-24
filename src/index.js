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
  return function (...args) {
    return new Promise(function (resolve, reject) {
      const recurse = function (err, r) {
        if (!r) return reject(err)
        try {
          return fn(...args).then(resolve).catch(e => recurse(e, r--))
        } catch (serr) { // NOTE: Some sync error.
          return reject(serr)
        }
      }

      return recurse(null, limit)
    })
  }
}

const createSequencer = function (method) {
  return function (...fns) {
    return function (v) {
      return new Promise(function (resolve, reject) {
        const recurse = function (_v) {
          const fn = method.call(fns)
          try {
            if (fn) return fn(_v).then(recurse).catch(reject)
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

module.exports.sequence = createSequencer(Array.prototype.pop)
module.exports.compose = createSequencer(Array.prototype.shift)
