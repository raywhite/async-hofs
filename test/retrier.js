const test = require('ava')
const {
  createLinear,
  createExponential,
  createRetrierFn,
} = require('../src/retrier')

test('createRetrierFn - retries async errors', async function (t) {
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

test('createRetrierFn - retries sync errors', async function (t) {
  const responses = [
    new Error('fail'),
    true,
  ]

  function failOnce() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }

  const fn = createRetrierFn(failOnce, 2)
  t.true(await fn())
})

test('createRetrierFn - allows opt out of retries', async function (t) {
  const shouldRetry = () => false
  const responses = [
    new Error('fail'),
    true,
  ]

  function failOnce() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }

  const fn = createRetrierFn(failOnce, 2, undefined, shouldRetry)
  try {
    await fn()
    t.fail()
  } catch (error) {
    t.pass()
  }
})

test('createRetrierFn - allows indefinite retries', async function (t) {
  const responses = [
    new Error('fail'),
    new Error('fail'),
    new Error('fail'),
    new Error('fail'),
    true,
  ]

  function failMany() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }

  const fn = createRetrierFn(failMany, 0, 0)
  try {
    await fn()
    t.pass()
  } catch (error) {
    t.fail()
  }
})

test('createRetrierFn - supports curves', async function (t) {
  const sleep = x => new Promise(r => setTimeout(r, x))

  const cache = []
  const createFn = function () {
    let failed = false

    const fn = async function (value) {
      await sleep(100)
      cache.push(value)

      if (!failed) {
        failed = true
        throw new Error('')
      }

      return value
    }

    return fn
  }

  let f = createFn()
  let fn = createRetrierFn(f, 2)

  t.true(await fn('x') === 'x')
  t.true(cache.length === 2)

  cache.length = 0
  f = createFn()
  fn = createRetrierFn(f, x => x, 2)

  t.true(await fn('x') === 'x')
  t.true(cache.length === 2)
})

test('createRetrierFn - and inbuilt curves', async function (t) {
  const range = function* (len) {
    let count = 0
    while (count < len) {
      yield count
      count++
    }
  }

  let fx = createLinear({ m: 2, b: 0 })
  t.deepEqual([...range(4)].map(fx), [0, 2, 4, 6])

  fx = createExponential({ a: 2, b: 1 }, 1)
  t.deepEqual([...range(6)].map(fx), [1, 2, 4, 8, 16, 32])

  fx = createExponential({ a: 2, b: 1 }, 1000)
  t.deepEqual([...range(6)].map(fx), [1000, 2000, 4000, 8000, 16000, 32000])
})

