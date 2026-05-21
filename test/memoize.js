import test from 'ava'
import { memoize } from '../dist/index.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('memoize - basic functionality tests', async (t) => {
  const fn = memoize((x) => x + 1)

  t.true(typeof fn.cache === 'object')
  t.true(fn(1) instanceof Promise)

  const a = memoize(() => new Promise((r) => setTimeout(r, 100)))
  t.true(a() instanceof Promise)

  const p = Promise.all([fn(1), fn(2), fn(3)]).then((res) => {
    t.deepEqual(res, [2, 3, 4])
    t.deepEqual(fn.cache, { 1: 2, 2: 3, 3: 4 })
  })

  // Failures must not append to cache.
  const q = new Promise((resolve) => {
    const m = memoize(() => new Promise((_, reject) => {
      setTimeout(reject, 0)
    }))
    m().catch(() => {
      t.true(true)
      t.deepEqual(m.cache, {})
      resolve()
    })
  })

  await Promise.all([p, q])
})

test('memoize - allows for a time to live', async (t) => {
  const fn = memoize((x) => x + 1, 128)

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)

  t.deepEqual(fn.cache, { 1: 2, 2: 3, 3: 4 })

  await sleep(64)
  t.deepEqual(fn.cache, { 1: 2, 2: 3, 3: 4 })

  t.true(await fn(4) === 5)
  await sleep(96)
  await sleep(256)
  t.deepEqual(fn.cache, {})

  t.true(await fn(4) === 5)
  await sleep(64)
  t.deepEqual(fn.cache, { 4: 5 })

  t.true(await fn(4) === 5)
  t.deepEqual(fn.cache, { 4: 5 })

  await sleep(32)
  t.deepEqual(fn.cache, { 4: 5 })

  await sleep(32)
  t.deepEqual(fn.cache, {})
})

test('memoize - accepts custom serialization', async (t) => {
  const s = function () {
    const args = Array.prototype.slice.call(arguments)
    return args[0] * args[1]
  }

  const w = function () {
    const args = Array.prototype.slice.call(arguments)
    return args[0] / args[1]
  }

  const fn = memoize(w, s)

  await fn(1, 2)
  await fn(3, 4)
  await fn(4, 5)

  t.deepEqual(fn.cache, { 2: 0.5, 12: 0.75, 20: 0.8 })

  const v = await fn(2, 10)
  t.deepEqual(fn.cache, { 2: 0.5, 12: 0.75, 20: 0.8 })
  t.true(v === 0.8)
})
