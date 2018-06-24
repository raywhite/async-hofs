/**
 * @param {Mixed} value
 * @returns {Boolean}
 */
const isArray = value => Array.isArray(value)

/**
 *
 * @param {Mixed} value
 */
const isNumber = value => typeof value === 'number'

/**
 * @param {Number} m
 * @param {Number} b
 */
const createLinear = function (m = 1, b = 0) {
  /**
   * @param {Number}
   * @yields {Number}
   */
  return function* (limit) {
    let attempt = 0
    while (attempt < limit) {
      yield (m * attempt) + b
      attempt += 1
    }
  }
}

/**
 * @param {Number}
 * @returns {Function}
 */
const createExponential = function (c = 2, m = 1) {
  /**
   * @param {Number}
   * @yields {Number}
   */
  return function* (limit) {
    let attempt = 0
    while (attempt < limit) {
      if (attempt === 0) {
        yield 0
        attempt += 1
        continue // eslint-disable-line no-continue
      }

      yield Math.pow(c, attempt) * m // eslint-disable-line no-restricted-properties
      attempt += 1
    }
  }
}

/**
 * @param {Number} a
 * @param {Number} b
 * @param {Number} c
 * @returns {Function}
 */
const createPolynomial = function (a, b, c) {
  /**
   * @param {Number}
   * @yields {Number}
   */
  return function* (limit) {
    let attempt = 0
    while (attempt < limit) {
      yield (a * attempt) + (b * attempt) + c
      attempt = yield 0
    }
  }
}

/**
 * @param {Mixed} array
 * @returns {Iterable}
 */
const createIterator = function (array) {
  if (isArray(array)) {
    array = [...array]
    return (function* () {
      // TODO: Should we yield 0 if it's not the first value?
      yield* array
    }())
  }

  const fn = array
  return (function* () {
    while (true) {
      const value = fn()
      if (value !== -1 && value !== false && value !== undefined) {
        yield value
      } else {
        break
      }
    }
  }())
}

/**
 * @param {Function}
 * @param {Function|Iterable|String}
 * @param {String} optional
 * @returns {Function}
 */
const createRetrierFn = function (fn, curve = 2, limit = 2) {
  return function () {
    let iterator

    if (isNumber(curve)) {
      limit = curve
      iterator = createLinear(0, 0)(limit)
    } else if (isArray(curve)) {
      iterator = createIterator(curve)
    } else {
      iterator = curve(limit)
    }

    // There iterator itself must be a function.
    if (typeof iterator.next !== 'function') {
      iterator = createIterator(iterator)
    }

    const args = Array.prototype.slice.call(arguments)

    return new Promise(function (resolve, reject) {
      const recurse = function (err) {
        const { value, done } = iterator.next()
        if (done) return reject(err)
        if (value === 0) {
          try {
            return fn.apply(null, args)
              .then(resolve)
              .catch(asyncErr => recurse(asyncErr))
          } catch (syncErr) {
            return reject(syncErr)
          }
        }

        return setTimeout(function () {
          try {
            return fn.apply(null, args)
              .then(resolve)
              .catch(asyncErr => recurse(asyncErr))
          } catch (syncErr) {
            return reject(syncErr)
          }
        }, value)
      }

      return recurse(null)
    })
  }
}

module.exports.createLinear = createLinear
module.exports.createExponential = createExponential
module.exports.createPolynomial = createPolynomial
module.exports.createRetrierFn = createRetrierFn
