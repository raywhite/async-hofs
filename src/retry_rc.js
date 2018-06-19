/**
 * Assertion that the value is is a promise.
 *
 * @param {Mixed} value
 * @returns {Boolean}
 */
const isPromise = function (value) {
  return value instanceof Promise
}

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
  array = [...array]
  return (function* () {
    yield *array
  }())
}

module.exports.linear = linear
module.exports.exponential = exponential
module.exports.polynomial = createPolynomial(1, 1, 1)
module.exports.createIterator = createIterator

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
const createRetrierFn = function (fn, curve = 2, limit = 2) {
  let iterator

  if (isNumber(curve)) {
    limit = curve
    iterator = zero(limit)
  } else if (isArray(curve)) {
    iterator = createIterator(curve)
  } else {
    iterator = curve(limit)
  }

  return function () {
    const args = Array.prototype.slice(arguments)

    return new Promise(function (resolve, reject) {
      const escher = function () {
        try {
          return fn(...args).then(resolve).catch(err => recurse(err))
        } catch (err) {
          return reject(err)
        }
      }

      const recurse = function (err) {
        const { value, done } = iterator.next()
        if (done) return reject(err)
        if (isPromise(value)) return value.then(escher)
        if (value === 0) return escher()

        return setTimeout(function () {
          return escher()
        }, value)
      }

      return recurse(null)
    })
  }
}

module.exports.createRetrierFn = createRetrierFn
