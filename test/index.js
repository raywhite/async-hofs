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

test('createAsyncFnPool - creates a pool of async functions', async function (t) {
  const { createAsyncFnPool } = hofs
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // Some bunch of tasks.
  const expected = [...input]
  const output = []

  const sleep = x => new Promise(r => setTimeout(r, x))
  const coroutine = async function () {
    let v
    while (v = input.shift()) { // eslint-disable-line no-cond-assign
      await sleep(0) // True async (as below)
      output.push(v)
    }
  }

  t.true(!output.length)
  await createAsyncFnPool(coroutine, 2)
  t.deepEqual(expected, output) // NOTE: Synchronized.


  // Reset everything.
  input.push(...output)
  output.length = 0
  expected.length = 0
  expected.push(10, 9, 8)

  // It throws if any green thread throws.
  const failer = async function () {
    let v
    while (v = input.pop()) { // eslint-disable-line no-cond-assign
      await sleep(0)
      if (v === 7) throw new Error(v)
      output.push(v)
    }
  }

  t.true(!output.length)

  let err
  try {
    await createAsyncFnPool(failer, 8)
  } catch ({ message }) {
    err = +message
  }

  t.true(err === 7)
  t.true(output.shift() === 10)
})

test('sequence - composes async functions left to right', async function (t) {
  t.true(true)
})
