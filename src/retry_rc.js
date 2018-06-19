/**
 * @param {Mixed} value
 * @returns {Boolean}
 */
const isArray = function (value) {
  return Array.isArray(value)
}

/**
 *
 * @param {Mixed} value
 */
const isNumber = function (value) {
  return typeof value === 'number'
}

/**
 * @param {Number}
 * @yields {Number}
 */
const zero = function* (limit) {
  let attempt = 0
  while (attempt < limit) {
    yield 0
    attempt += 1
  }
}

/**
 * @param {Number} m
 * @param {Number} b
 */
const createLinear = function (m = 1, b = 0) {
  /**
   * @param {Number}
   * @yields {Number}
   */
  const linear = function* (limit) {
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
const createExponential = function (c = 2) {
  /**
   * @param {Number}
   * @yields {Number}
   */
  return function* (limit) {
    let attempt = 0
    while (attempt < limit) {
      yield Math.pow(c, attempt)
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
      yield yield (a * attempt) + (b * attempt) + c
      attempt += 1
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
      yield* array
    }())
  }

  const fn = array
  return (function* () {
    const value = fn()
    if (value === -1 || value === false) yield value
  }())
}

// TODO: Make `zero` from a line.

/**
 *
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
      iterator = zero(limit)
    } else if (isArray(curve)) {
      iterator = createIterator(curve)
    } else {
      iterator = curve(limit)
    }

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

module.exports.createRetrierFn = createRetrierFn
