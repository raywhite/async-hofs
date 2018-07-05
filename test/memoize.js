const test = require('ava')
const { memoize } = require('../src/memoize')

const toObject = function (iterator) {
  return Array.prototype.reduce.call([...iterator], function (p, [k, v]) {
    p[k] = v
    return p
  }, {})
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

test('memoize - basic, seemingly sink functions', async function (t) {
  const fn = memoize(x => x + 1)

  t.true(typeof fn.cache === 'object')

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)
  t.deepEqual(fn.cache, { '1': 2, '2': 3, '3': 4 })
})

test('memoize - allows for a time to live', async function (t) {
  const fn = memoize(x => x + 1, 128)

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)


  t.deepEqual(fn.cache, { '1': 2, '2': 3, '3': 4 })

  await sleep(64)

  t.deepEqual(fn.cache, { '1': 2, '2': 3, '3': 4 })

  t.true(await fn(4) === 5)
  await sleep(96)

  await sleep(256)
  t.deepEqual(fn.cache, {})

  t.true(await fn(4) === 5)
  await sleep(64)
  t.deepEqual(fn.cache, { '4': 5 })

  // NOTE: This can access the cache.
  t.true(await fn(4) === 5)
  t.deepEqual(fn.cache, { '4': 5 })

  // NOTE: The cache is still populated.
  await sleep(32)
  t.deepEqual(fn.cache, { '4': 5 })

  await sleep(32)
  t.deepEqual(fn.cache, {})
})

test('memoize - accepts custom serialization', async function (t) {
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

  t.deepEqual(fn.cache, { '2': 0.5, '12': 0.75, '20': 0.8 })

  // NOTE: This returns nonsense, because `s` is silly.
  const v = await fn(2, 10)
  t.deepEqual(fn.cache, { '2': 0.5, '12': 0.75, '20': 0.8 })
  t.true(v === 0.8)
})
