const test = require('ava')
const { createRetrierFn } = require('../src/retry_rc')
/**
 * TODO: Maybe more strategies for this functions,
 * like linear and exponential backoff - a curve fn
 * could be supplied as another param.
 */
test('_createRetrierFn - wraps a function for retries', async function (t) {
  const sleep = x => new Promise(r => setTimeout(r, x))

  /**
   * Given 'i', create function that will return a promise
   * that rejects `i` times... then perpetually resolve.
   *
   * @param {Number}
   * @returns {Promise}
   */
  const createFailer = function (i) {
    return async function () {
      await sleep(0) // Forces async.
      if (i) {
        i--
        throw new Error(i)
      }
      return true
    }
  }

  // Will retry three times.
  const succeeder = createRetrierFn(createFailer(2), 3)
  t.true(typeof succeeder === 'function')
  const success = await succeeder()
  t.true(success)

  const failer = createRetrierFn(createFailer(4), 2)
  t.true(typeof succeeder === 'function')

  let failure
  try {
    failure = await failer()
  } catch ({ message }) {
    failure = +message // Coerce.
  }

  t.true(failure === 2)
})

test('_createRetrierFn - wrapped functions supports variable arguments', async function (t) {
  const sleep = x => new Promise(r => setTimeout(r, x))
  const received = []

  const createFailer = function (i) {
    return async function (a, b, c) {
      received.push([a, b, c])
      await sleep(0) // Forces async.
      if (i) {
        i--
        throw new Error(i)
      }
      return true
    }
  }

  const succeeder = createRetrierFn(createFailer(1), 2)
  await succeeder(1, 2, 3)
  t.true(JSON.stringify(received) === JSON.stringify([
    [1, 2, 3],
    [1, 2, 3],
  ]))
})

test('_createRetrierFn - allow many types to be passed', async function (t) {
  const createPusher = function (iterations, cache) {
    let i = iterations
    return async function (value) {
      cache.push(value)
      i--
      if (i !== 0) throw new Error()
      return value
    }
  }

  const cache = []
  cache.length = 0
  let fx = createPusher(2, cache)

  // No extra params.
  let fn = createRetrierFn(fx)
  let value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 2)

  cache.length = 0
  fx = createPusher(6, cache)

  // Passing a `Number`.
  fn = createRetrierFn(fx, 6)
  value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 6)

  cache.length = 0
  fx = createPusher(6, cache)

  // Passing an `Array`.
  fn = createRetrierFn(fx, [1, 2, 3, 4, 5, 6])
  value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 6)

  cache.length = 0
  fx = createPusher(6, cache)

  // Passing a generator function, and limit.
  fn = createRetrierFn(fx, function* (limit) {
    while (limit) yield 0
  }, 6)

  value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 6)

  cache.length = 0
  fx = createPusher(6, cache)

  // Passing a regular function, that returns a function (thunk).
  fn = createRetrierFn(fx, function (limit) {
    // NOTE: Internal state management.
    let attempt = 0

    return function () {
      if (attempt < limit) {
        attempt++
        return attempt - 1
      }

      return -1
    }
  }, 6)

  value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 6)

  cache.length = 0
  fx = createPusher(6, cache)

  // Same as above, but with a large interval.
  fn = createRetrierFn(fx, function (limit) {
    // NOTE: Internal state management.
    let attempt = 0

    return function () {
      if (attempt < limit) {
        attempt++
        return 200
      }

      return -1
    }
  }, 6)

  value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 6)

  cache.length = 0
  fx = createPusher(6, cache)

  // Passing a regular function, that returns an array.
  cache.length = 0
  fx = createPusher(6, cache)

  // Same as above, but with a large interval.
  fn = createRetrierFn(fx, function (limit) {
    return function () {
      return new Array(limit).fill(0)
    }
  }, 6)

  value = await fn('x')
  t.true(value === 'x')
  t.true(cache.length === 6)

  cache.length = 0
  fx = createPusher(6, cache)
})

