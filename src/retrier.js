const createLinear = function (constants = {}) {
  const { m = 1, b = 0 } = constants

  return function (x) {
    const y = (m * x) + b
    return y
  }
}

module.exports.createLinear = createLinear

const zero = createLinear({ m: 0 })

module.exports.zero = zero

const createExponential = function (constants = {}, m = 1) {
  const { a = 2, b = 1 } = constants

  return function (x) {
    const y = Math.pow(a * b, x) // eslint-disable-line no-restricted-properties
    return y * m
  }
}

module.exports.createExponential = createExponential

/**
 * Wraps an `async` function for async retries as per the logic given in `curve`.
 * Curve is expected to be a callback which will be called at each failed
 * iteration with `err` (the error thrown by the wrapped function) and `count`
 * which is the count of total attempts to `resolve` - it should either throw
 * (should no more retries be required) or return an integer dictating the
 * number of milliseconds to sleep before re-attempting resolution.
 *
 * @param {Function} fn
 * @param {Function|Object} curve
 * @returns {Function}
 */
const createRetrierFn = function (fn, curve) {
  if (!curve) {
    curve = function (err, count) {
      if (count > 1) throw err
      return 0
    }
  }

  return function (...args) {
    let attempt = 0

    const recurse = function (resolve, reject) {
      return fn(...args).then(resolve).catch(function (err) {
        let timeout

        try {
          timeout = curve(err, ++attempt)
          if (timeout <= 0) return recurse(resolve, reject)
          return setTimeout(recurse, timeout, resolve, reject)
        } catch (_err) {
          return reject(_err)
        }
      })
    }

    return new Promise(recurse)
  }
}

module.exports.createRetrierFn = createRetrierFn
module.exports.retry = createRetrierFn
