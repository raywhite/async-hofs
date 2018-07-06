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
 * @returns {Function}
 */
module.exports.createRetrierFn = function (fn, curve = 2, limit = 2) {
  if (isNumber(curve)) {
    limit = curve
    curve = zero
  }

  return function () {
    const args = Array.prototype.slice.call(arguments)

    return new Promise(function (resolve, reject) {
      const recurse = function (err, attempt) {
        if (attempt >= limit) return reject(err)
        if (attempt === 0) {
          try {
            return fn.apply(null, args).then(resolve).catch(function (asyncErr) {
              return recurse(asyncErr, attempt + 1)
            })
          } catch (syncErr) {
            return reject(syncErr)
          }
        }

        return setTimeout(function () {
          try {
            return fn.apply(null, args).then(resolve).catch(function (asyncErr) {
              return recurse(asyncErr, attempt + 1)
            })
          } catch (syncErr) {
            return reject(syncErr)
          }
        }, curve(attempt))
      }

      return recurse(null, 0)
    })
  }
}
