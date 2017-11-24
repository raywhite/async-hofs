const test = require('ava')
const hofs = require('../src/index.js')

test('memoize - it\'s here for my own sake', function (t) {
  const { memoize } = hofs
  const fn = memoize(x => x + 1)

  // TODO: Just commiting this so tests pass.
  t.true(fn(1) === 2)
  t.true(fn(2) === 3)
  t.true(fn(3) === 4)

  // Check these values are being cached.
  t.deepEqual({ 1: 2, 2: 3, 3: 4 }, fn.cache)
})

/**
 * TODO: Maybe more strategies for this functions,
 * like linear and exponential backoff - a curve fn
 * could be supplied as another param.
 */
test('createRetrierFn - wraps a function for retries', async function (t) {
  const { createRetrierFn } = hofs
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
      sleep(0) // Forces async.
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
