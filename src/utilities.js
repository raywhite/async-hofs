/**
 * Determines whether a value is a thenable, or a standard promise.
 *
 * @param {Mixed}
 * @returns {Boolean}
 */
module.exports.isPromise = function (value) {
  return value instanceof Promise || typeof value.then === 'function'
}

/**
 *
 * @param {Mixed}
 * @return {Boolean}
 */
module.exports.isNumber = function (value) {
  return typeof value === 'number'
}

/**
 * Returns a promise that resolves after `ms` milliseconds.
 *
 * @param {Number} ms
 * @returns {Void}
 * @private
 */
module.exports.sleep = function (ms = 1000) {
  return new Promise(function (resolve) {
    return setTimeout(resolve, ms)
  })
}
