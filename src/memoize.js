const { isPromise } = require('./utilities')

const stringify = function (...args) {
  return String(args[0])
}

module.exports.memoize = function (fn, s = stringify, ms = -1) {
  if (typeof s === 'number') {
    ms = s
    s = stringify
  }

  const cache = new Map()
  const timeouts = new Map()

  const append = function (key, value) {
    if (ms !== -1) {
      timeouts.set(key, setTimeout(function () {
        timeouts.delete(key)
        cache.delete(key)
      }, ms))
    }

    cache.set(key, value)
    return value
  }

  const m = function (...args) {
    const key = s(...args)
    if (cache.has(key)) return Promise.resolve(cache.get(key))

    return new Promise(function (resolve, reject) {
      let promise
      try {
        promise = fn(...args)
        if (!isPromise(promise)) promise = Promise.resolve(promise)
      } catch (err) {
        if (cache.has(key)) cache.delete(key)
        if (timeouts.has(key)) timeouts.delete(key)
        return reject(err)
      }

      return promise.then(function (value) {
        return resolve(append(key, value))
      }).catch(function (err) {
        if (cache.has(key)) cache.delete(key)
        if (timeouts.has(key)) timeouts.delete(key)
        return reject(err)
      })
    })
  }

  Object.defineProperty(m, 'cache', {
    get() {
      return (function (iterator) {
        return Array.prototype.reduce.call([...iterator], function (p, [k, v]) {
          p[k] = v
          return p
        }, {})
      }(cache.entries()))
    },
  })

  return m
}
