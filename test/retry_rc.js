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

test.todo('_createRetrierFunction - supports passing of various types / limits')

