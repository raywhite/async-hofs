/**
 *
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
 * The default... always yields 0, but only up to the limit.
 *
 * @param {Number} limit
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
 * An example implementation of said generators.
 *
 * @param {String} limit
 * @yields {Number}
 */
const linear = function* (limit) {
  let attempt = 0
  while (attempt < limit) {
    yield attempt
    attempt += 1
  }
}

/**
 * Another example of said generators.
 *
 * @param {String} limit
 * @yields {Number}
 */
const exponential = function* (limit) {
  let attempt = 0
  while (attempt < limit) {
    yield attempt * attempt
    attempt += 1
  }
}

/**
 *
 * @param {Number} a
 * @param {Number} b
 * @param {Number} c
 * @returns {Function}
 */
const createPolynomial = function (a, b, c) {
  /**
   * @param {Number}
   * @returns {Number}
   */
  return function* (limit) {
    let attempt = 0
    while (attempt < limit) {
      yield yield (a * attempt) + (b * attempt) + c
      attempt += 1
    }
  }
}

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

module.exports.linear = linear
module.exports.exponential = exponential
module.exports.polynomial = createPolynomial(1, 1, 1)
module.exports.createIterator = createIterator

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
 *
 * TODO: This should optionally take a function that can be either an generator,
 * function, or iterator and that can be used to return the timeout period for
 * the next iteration.
 *
 * The expected API takes these params;
 *
 * @param {Function}
 * @param {Function|Iterable|String}
 * @param {String} optional
 * @returns {Function}
 */
const _createRetrierFn = function (fn, curve = 2, limit = 2) {
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
          } catch (syncErr) { // NOTE: Some sync error.
            return reject(syncErr)
          }
        }

        return setTimeout(function () {
          try {
            return fn.apply(null, args)
              .then(resolve)
              .catch(asyncErr => recurse(asyncErr))
          } catch (syncErr) { // NOTE: Some sync error.
            return reject(syncErr)
          }
        }, value)
      }

      return recurse(null)
    })
  }
}

module.exports.createRetrierFn = _createRetrierFn
