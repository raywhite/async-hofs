import test from 'ava'
import {
  createLinear,
  createExponential,
  createRetrierFn,
} from '../dist/index.js'

test('createRetrierFn - retries async errors with delay', async (t) => {
  const sleep = (x) => new Promise((r) => setTimeout(r, x))

  const createFailer = (i) => async () => {
    await sleep(0)
    if (i) {
      i--
      throw new Error(i)
    }
    return true
  }

  const succeeder = createRetrierFn(createFailer(2), () => 15, 3)
  t.true(typeof succeeder === 'function')

  const start = Date.now()
  const success = await succeeder()
  t.true(success)
  t.true(Date.now() - start >= 30)

  const failer = createRetrierFn(createFailer(4), 2)
  t.true(typeof succeeder === 'function')

  let failure
  try {
    failure = await failer()
  } catch ({ message }) {
    failure = +message
  }
  t.true(failure === 2)
})

test('createRetrierFn - retries sync errors', async (t) => {
  const responses = [new Error('fail'), true]
  function failOnce() {
    const response = responses.shift()
    if (response instanceof Error) throw response
    return response
  }
  const fn = createRetrierFn(failOnce, 2)
  t.true(await fn())
})

test('createRetrierFn - allows opt out of retries', async (t) => {
  const shouldRetry = () => false
  const responses = [new Error('fail'), true]
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

test('createRetrierFn - allows indefinite retries', async (t) => {
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

test('createRetrierFn - supports curves', async (t) => {
  const sleep = (x) => new Promise((r) => setTimeout(r, x))
  const cache = []
  const createFn = () => {
    let failed = false
    return async (value) => {
      await sleep(100)
      cache.push(value)
      if (!failed) {
        failed = true
        throw new Error('')
      }
      return value
    }
  }

  let f = createFn()
  let fn = createRetrierFn(f, 2)
  t.true(await fn('x') === 'x')
  t.true(cache.length === 2)

  cache.length = 0
  f = createFn()
  fn = createRetrierFn(f, (x) => x, 2)
  t.true(await fn('x') === 'x')
  t.true(cache.length === 2)
})

test('createRetrierFn - and inbuilt curves', (t) => {
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
