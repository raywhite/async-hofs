import test from 'ava'
import * as hofs from '../dist/index.js'

test('hofs - correctly exports all functions', (t) => {
  const fns = Object.keys(hofs).filter((k) => k !== 'default').sort()
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

  t.deepEqual(fns, expected)

  for (const fn of fns) t.true(typeof hofs[fn] === 'function')

  const aliases = [
    ['clock', 'createCLockedFn', 'createConcurrencyLockedFn'],
    ['mutex', 'createCLock', 'createConcurrencyLock'],
    ['limit', 'createRateLimitedFn'],
    ['retry', 'createRetrierFn'],
  ]

  for (const group of aliases) {
    const code = group.map((fn) => hofs[fn].toString())
    const source = code.shift()
    for (const alias of code) t.true(source === alias)
  }
})

test('createAsyncFnQueue - creates an async queue', async (t) => {
  const { sleep, createAsyncFnQueue } = hofs
  const output = []

  const createPusher = (n, ms) => async () => {
    await sleep(ms)
    return output.push(n)
  }

  let enqueue = createAsyncFnQueue(1)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])
  t.deepEqual(output, [1, 2, 3])

  output.length = 0
  enqueue = createAsyncFnQueue(3)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])
  t.deepEqual(output, [3, 2, 1])

  output.length = 0
  enqueue = createAsyncFnQueue(2)
  await Promise.all([
    enqueue(createPusher(1, 300)),
    enqueue(createPusher(2, 200)),
    enqueue(createPusher(3, 100)),
  ])
  t.deepEqual(output, [2, 1, 3])

  await createAsyncFnQueue(1)(() => Promise.reject('w00t')).catch(() => {})
  t.true(await createAsyncFnQueue(1)(() => 1) === 1)
  await createAsyncFnQueue(1)(() => { throw new Error('fail') }).catch(() => {})
})

test('createAsyncFnPool - creates a pool of async functions', async (t) => {
  const { createAsyncFnPool } = hofs
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const expected = [...input]
  const output = []

  const sleep = (x) => new Promise((r) => setTimeout(r, x))
  const coroutine = async () => {
    let v
    while (v = input.shift()) {
      await sleep(0)
      output.push(v)
    }
  }

  t.true(!output.length)
  await createAsyncFnPool(coroutine, 2)
  t.deepEqual(expected, output)

  input.push(...output)
  output.length = 0
  expected.length = 0
  expected.push(10, 9, 8)

  const failer = async () => {
    let v
    while (v = input.pop()) {
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

test('sequence - composes async functions left to right', async (t) => {
  const { sequence } = hofs
  const append = (x) => new Promise((r) => setTimeout(() => r(x + 1), 0))
  const fns = []
  while (fns.length < 16) fns.push(append)

  let fn = sequence(...fns)
  let v = await fn(0)
  t.true(v === 16)

  const vs = await Promise.all([fn(0), fn(1), fn(2), fn(3)])
  t.deepEqual([16, 17, 18, 19], vs)

  fns.length = 0
  const createPusher = (x) => (y) => new Promise((resolve) => setTimeout(resolve, 0, [...y, x]))
  while (fns.length < 4) fns.push(createPusher(fns.length))

  fn = sequence(...fns)
  v = await fn([])
  t.deepEqual([0, 1, 2, 3], v)
})

test('compose - right to left composition', async (t) => {
  const { compose } = hofs
  const createAppender = (x) => (str) => Promise.resolve(`${str}${x}`)
  const fns = []
  while (fns.length < 4) fns.push(createAppender(fns.length))

  const fn = compose(...fns)
  const v = await fn('')
  t.true(v === '3210')
})

test('clock - returns a function that limits concurrent calls', async (t) => {
  const { createCLockedFn } = hofs

  const createWorker = (ms) => (v, fail = false) => new Promise((resolve, reject) => {
    setTimeout(fail ? reject : resolve, ms, v)
  })

  let fn = createCLockedFn(createWorker(1000), 4)

  t.true(typeof fn.pending === 'number')
  t.true(typeof fn.queued === 'number')

  const a = []
  while (a.length < 16) a.push(fn('x'))

  const p = Promise.all(a)
  t.true(fn.pending === 16)
  t.true(fn.queued === 12)

  let bench = process.hrtime()
  await p
  bench = process.hrtime(bench)

  t.true(bench.shift() === 4)

  fn = createCLockedFn(createWorker(0), 1)

  const PASSTROUGH = 'some value or error'
  let v = await fn(PASSTROUGH)
  t.true(v === PASSTROUGH)

  v = undefined
  try {
    v = await fn(PASSTROUGH, true)
  } catch (_v) {
    v = _v
  }
  t.true(v === PASSTROUGH)
})

test('createRateLimitedFn - limits the execution rate of a function', async (t) => {
  const { sleep, createRateLimitedFn } = hofs

  const createPusher = (ms) => {
    const cache = []
    const fn = async (value) => {
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

test('createConcurrencyLock', async (t) => {
  const { sleep, createConcurrencyLock } = hofs
  const lock = createConcurrencyLock(1)

  const first = lock()
  t.true(typeof first.then === 'function')

  const cache = []

  const second = lock()
  const secondDone = second.then((release) => {
    cache.push(2)
    release()
  })

  const firstDone = first.then(async (release) => {
    cache.push(1)
    t.true(cache.length === 1)

    await sleep()
    t.true(cache.length === 1)
    t.true(cache[0] === 1)
    release()

    await sleep()
    t.true(cache.length === 2)
    t.true(cache[0] === 1)
    t.true(cache[1] === 2)
  })

  await Promise.all([firstDone, secondDone])
})

test('createConcurrencyLockedFn', async (t) => {
  const { sleep, createConcurrencyLockedFn } = hofs
  const cache = []
  const fn = createConcurrencyLockedFn(async (value, ms) => {
    await sleep(ms)
    cache.push(value)
  }, 1)

  const a = fn(1, 24).then(() => {
    t.true(cache.length === 1)
    t.true(cache[0] === 1)
  })

  const b = fn(2, 8).then(() => {
    t.true(cache.length === 2)
    t.true(cache[0] === 1)
    t.true(cache[1] === 2)
  })

  t.true(cache.length === 0)

  await Promise.all([a, b])
})

test('benchmark - times an async function', async (t) => {
  const { benchmark } = hofs

  const createSleeper = (timeout = 16, fail = false) => (value) => new Promise((resolve, reject) => setTimeout(!fail ? resolve : reject, timeout, value))

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null))
    t.true(time.toString().length === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'ms')
    t.true(time.toString().length === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'gs')
    t.true(time.toString().length === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [time, value] = await benchmark(sleep.bind(null, null), 'ns')
    t.true(time.toString().length > 6)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper(2 * 1000)
    const [time, value] = await benchmark(sleep.bind(null, null), 's')
    t.true(time === 2)
    t.true(value === null)
  })()

  await (async () => {
    const sleep = createSleeper()
    const [, value] = await benchmark(sleep, 'ms', null)
    t.true(value === null)
  })()

  await (async () => {
    const MESSAGE = 'MESSAGE'
    const sleep = createSleeper(16, true)
    let message
    try {
      await benchmark(sleep.bind(null, new Error(MESSAGE)))
    } catch (err) { message = err.message }
    t.true(message === MESSAGE)
  })()
})
