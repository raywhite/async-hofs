const test = require('ava')
const hofs = require('../src/index.js')

test('hofs - correctly exports all functions', function (t) {
  const fns = Object.keys(hofs).sort()
  const expected = [
    'benchmark',
    'buffer',
    'clock',
    'compose',
    'createAsyncFnPool',
    'createAsyncFnQueue',
    'createCLock',
    'createCLockedFn',
    'createConcurrencyLock',
    'createConcurrencyLockedFn',
    'createExponential',
    'createLinear',
    'createRateLimitedFn',
    'createRetrierFn',
    'limit',
    'memoize',
    'mutex',
    'retry',
    'sequence',
    'sleep',
    'zero',
  ]

  t.true(JSON.stringify(expected) === JSON.stringify(fns))

  for (const fn of fns) t.true(typeof hofs[fn] === 'function') // eslint-disable-line no-restricted-syntax

  const aliases = [
    [
      'clock',
      'createCLockedFn',
      'createConcurrencyLockedFn',
    ],
    [
      'mutex',
      'createCLock',
      'createConcurrencyLock',
    ],
    [
      'limit',
      'createRateLimitedFn',
    ],
    [
      'retry',
      'createRetrierFn',
    ],
  ]

  for (const group of aliases) { // eslint-disable-line no-restricted-syntax
    const code = group.map(fn => hofs[fn].toString())
    const source = code.shift()
    for (const alias of code) { // eslint-disable-line no-restricted-syntax
      t.true(source === alias)
    }
  }
})

test('createAsyncFnQueue - creates an async queue', async function (t) {
  const { sleep, createAsyncFnQueue } = hofs
  const output = []

  const createPusher = function (n, ms) {
    return async function () {
      await sleep(ms)
      return output.push(n)
    }
  }

  // Check calls in order.
  let enqueue = createAsyncFnQueue(1)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])

  t.deepEqual(output, [1, 2, 3])

  // These should be added in timeout order.
  output.length = 0
  enqueue = createAsyncFnQueue(3)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])

  t.deepEqual(output, [3, 2, 1])

  // The third should beat the first.
  output.length = 0
  enqueue = createAsyncFnQueue(2)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])

  t.deepEqual(output, [2, 1, 3])

  // Ensure that rejections to not break the queue, it should function afterwards
  await createAsyncFnQueue(1)(() => Promise.reject('w00t')).catch(() => {})

  // Ensure that sync functions still return correctly.
  t.true(await createAsyncFnQueue(1)(() => 1) === 1)

  // Ensure that sync errors are handled by the queue
  await createAsyncFnQueue(1)(() => { throw new Error('fail') }).catch(() => {})
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
  const { sequence } = hofs

  // Just to make sure this is legit async.
  const append = x => new Promise(r => setTimeout(() => r(x + 1), 0))
  const fns = []
  while (fns.length < 16) fns.push(append)

  let fn = sequence(...fns)
  let v = await fn(0)

  t.true(v === 16)

  /**
   * The above doesn't test directionality - but I did want to
   * add a small test to check that the same input does get
   * the same output (to make sure the input functions) are not
   * being consumed by `pop` or `shift`.
   */

  const vs = await Promise.all([
    fn(0),
    fn(1),
    fn(2),
    fn(3),
  ])

  t.deepEqual([16, 17, 18, 19], vs)

  fns.length = 0

  const createPusher = function (x) {
    return function (y) {
      return new Promise(function (resolve) {
        return setTimeout(resolve, 0, [...y, x])
      })
    }
  }

  while (fns.length < 4) fns.push(createPusher(fns.length))

  fn = sequence(...fns)
  v = await fn([])

  t.deepEqual([0, 1, 2, 3], v)
})

test('compose - right to left composition', async function (t) {
  const { compose } = hofs

  const createAppender = x => str => Promise.resolve(`${str}${x}`)

  const fns = []
  while (fns.length < 4) fns.push(createAppender(fns.length))

  const fn = compose(...fns)
  const v = await fn('')

  t.true(v === '3210')
})

test('clock - returns a functions that limits concurrent calls', async function (t) {
  const { createCLockedFn } = hofs

  const createWorker = function (ms) {
    /**
     * This is designed to simulate some sort of heavy / long running
     * async workload such as spawning a shell process or making
     * some large IO request.
     */
    return function (v, fail = false) {
      return new Promise(function (resolve, reject) {
        setTimeout(fail ? reject : resolve, ms, v)
      })
    }
  }

  // Function takes a second, and there is a concurrency of 4.
  let fn = createCLockedFn(createWorker(1000), 4)

  // Assertions on the available properties.
  t.true(typeof fn.pending === 'number')
  t.true(typeof fn.queued === 'number')

  // We have 16 calls in total.
  const a = []
  while (a.length < 16) a.push(fn('x'))

  const p = Promise.all(a)
  t.true(fn.pending === 16)
  t.true(fn.queued === 12)

  let bench = process.hrtime()
  await p
  bench = process.hrtime(bench)

  // So it should take about 4 seconds to complete.
  t.true(bench.shift() === 4)

  // NOTE: This next bit tests that resolution / rejection works.
  fn = createCLockedFn(createWorker(0), 1)

  const PASSTROUGH = 'some value or error'
  let v = await fn(PASSTROUGH)
  t.true(v === PASSTROUGH)

  // And rejection.
  v = undefined
  try {
    v = await fn(PASSTROUGH, true)
  } catch (_v) {
    v = _v
  }

  t.true(v === PASSTROUGH)
})

test('createRateLimitedFn - limits the execution rate of a function', async function (t) {
  const { sleep, createRateLimitedFn } = hofs

  const createPusher = function (ms) {
    const cache = []

    const fn = async function (value) {
      await sleep(ms)
      cache.push(value)
    }

    fn.cache = cache
    return fn
  }

  const fn = createPusher(100)
  const rfn = createRateLimitedFn(fn, 100, 1000)

  let count = 200
  while (count > 0) rfn(count--)

  await sleep(500)
  t.true(fn.cache.length === 100)
  await sleep(1000)
  t.true(fn.cache.length === 200)
})

test.cb('createConcurrencyLock', function (t) {
  const { sleep, createConcurrencyLock } = hofs
  const lock = createConcurrencyLock(1)

  const first = lock()
  t.true(typeof first.then === 'function')

  const cache = []

  const second = lock()
  second.then(function (release) {
    cache.push(2)
    release()
  })

  first.then(async function (release) {
    cache.push(1)
    t.true(cache.length === 1)

    await sleep()
    t.true(cache.length === 1)
    t.true(cache[0] === 1)
    release() // Releases the first lock.

    await sleep()
    t.true(cache.length === 2)
    t.true(cache[0] === 1)
    t.true(cache[1] === 2)

    t.end()
  })
})

test.cb('createConcurrencyLockedFn', function (t) {
  const { sleep, createConcurrencyLockedFn } = hofs
  const cache = []
  const fn = createConcurrencyLockedFn(async function (value, ms) {
    await sleep(ms)
    cache.push(value)
  })

  fn(1, 24).then(function () {
    t.true(cache.length === 1)
    t.true(cache[0] === 1)
  })

  fn(2, 8).then(function () {
    t.true(cache.length === 2)
    t.true(cache[0] === 1)
    t.true(cache[1] === 2)
    t.end()
  })

  t.true(cache.length === 0)
}, 1)


test('benchmark - times an async function', async function (t) {
  const { benchmark } = hofs

  const createSleeper = function (timeout = 16, fail = false) {
    return function (value) {
      return new Promise(function (resolve, reject) {
        return setTimeout(!fail ? resolve : reject, timeout, value)
      })
    }
  }

  // Implicit `ms` setting.
  await (async function () {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null))
    t.true(time.toString().length === 2)
    t.true(value === null)
  }())

  // Explicit `ms` setting.
  await (async function () {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'ms')
    t.true(time.toString().length === 2)
    t.true(value === null)
  }())

  // Unknown fallthtough.
  await (async function () {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'gs')
    t.true(time.toString().length === 2)
    t.true(value === null)
  }())

  // `ns`.
  await (async function () {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'ns')
    t.true(time.toString().length > 6)
    t.true(value === null)
  }())

  // `s`.
  await (async function () {
    const sleep = createSleeper(2 * 1000)
    const [time, value] = await benchmark(sleep.bind(null, null), 's')
    t.true(time === 2)
    t.true(value === null)
  }())

  // Passing extra params.
  await (async function () {
    const sleep = createSleeper()
    const [, value] = await benchmark(sleep, 'ms', null)
    t.true(value === null)
  }())

  // Fail case...
  await (async function () {
    const MESSAGE = 'MESSAGE'
    const sleep = createSleeper(16, true)
    let message
    try {
      await benchmark(sleep.bind(null, new Error(MESSAGE)))
    } catch (err) { message = err.message }
    t.true(message === MESSAGE)
  }())
})
