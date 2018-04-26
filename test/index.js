const test = require('ava')
const hofs = require('../src/index.js')
const { Readable } = require('stream')

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

test('createRetrierFn - wrapped functions supports variable arguments', async function (t) {
  const { createRetrierFn } = hofs
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

test('createAsyncFnQueue - create an async queue', async function (t) {
  const { createAsyncFnQueue } = hofs
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
  const enqueue = createAsyncFnQueue(2)
  await Promise.all([
    enqueue(coroutine),
    enqueue(coroutine),
  ])
  t.deepEqual(expected, output) // NOTE: Synchronized.

  // Reset everything.
  input.push(...output)
  output.length = 0
  expected.length = 0
  expected.push(10, 9, 8)

  // It ignores any failures
  const failer = async function () {
    let v
    while (v = input.pop()) { // eslint-disable-line no-cond-assign
      await sleep(0)
      if (v === 7) throw new Error(v)
      output.push(v)
    }
  }

  t.true(!output.length)

  // The queue ignores rejections, but the caller should still handle them
  await enqueue(failer).catch(() => {})
  t.deepEqual(expected, output) // NOTE: Synchronized.
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

  // Ugh... just noticed the above doesn't test directionality (reset)
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

test('buffer - buffers a writable stream', async function (t) {
  const { buffer } = hofs

  const CHAR_STRING = 'some string of characters... :)'
  const LONG_STRING = 'this string of characters is too long...'
  const BYTE_LENGTH = Buffer.byteLength(LONG_STRING)

  const createReadStream = function (str) {
    return new Readable({
      read() {
        const chunk = Buffer.from(str.slice(0, 4))
        str = str.slice(4)

        // End when the string has been consumed.
        return this.push(chunk.length ? chunk : null)
      },
    })
  }

  let readable = createReadStream(CHAR_STRING)
  let b = await buffer(readable)
  const str = String(b)

  t.true(str === CHAR_STRING)

  // We also need to assert that byte lengths work.
  readable = createReadStream(LONG_STRING)

  let message
  let type
  try {
    b = await buffer(readable, BYTE_LENGTH - 4)
  } catch (err) {
    message = err.message
    type = err.type
  }

  t.true(message === 'byte limit exceeded')
  t.true(message === buffer.LIMIT_EXCEEDED)
  t.true(message === buffer.LIMIT_EXCEEDED)

  // And finally that two consumers are not allowed.
  try {
    await buffer(readable)
  } catch (err) {
    message = err.message
    type = err.type
  }

  t.true(message === 'stream already consumed')
  t.true(message === buffer.SECOND_STREAM_CONSUMER)
  t.true(type === buffer.SECOND_STREAM_CONSUMER)
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
  t.true(fn.pending === 4)
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
