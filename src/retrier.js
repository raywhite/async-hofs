const { isNumber } = require('./utilities')

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
 * @param {Function}
 * @param {Function|Number}
 * @param {Number}
 * @param {Function}
 * @returns {Function}
 */
const createRetrierFn = function (fn, curve = 2, limit = 2, shouldRetry = undefined) {
  if (isNumber(curve)) {
    limit = curve
    curve = zero
  }

  return function () {
    const args = Array.prototype.slice.call(arguments)

    return new Promise(function (resolve, reject) {
      (function recurse(attempt) {
        function retry(error) {
          const errorCount = attempt + 1

          if (limit && errorCount >= limit) return reject(error)

          if (shouldRetry && !shouldRetry(error)) return reject(error)

          return recurse(errorCount)
        }

        setTimeout(function () {
          try {
            Promise
              .resolve(fn.apply(null, args))
              .then(resolve)
              .catch(function (asyncErr) {
                return retry(asyncErr)
              })
          } catch (syncErr) {
            retry(syncErr)
          }
        }, curve(attempt))
      }(null, 0))
    })
  }
}

module.exports.retry = createRetrierFn
module.exports.createRetrierFn = createRetrierFn
