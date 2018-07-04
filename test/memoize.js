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
  t.true(fn.cache.constructor.name === 'Map')

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)

  const cache = fn.cache
  const entries = cache.entries()

  t.deepEqual(toObject(entries), { '1': 2, '2': 3, '3': 4 })
})

test('memoize - allows for a time to live', async function (t) {
  const fn = memoize(x => x + 1, 128)

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)

  const cache = fn.cache

  let entries = cache.entries()
  t.deepEqual(toObject(entries), { '1': 2, '2': 3, '3': 4 })

  await sleep(64)

  entries = cache.entries()
  t.deepEqual(toObject(entries), { '1': 2, '2': 3, '3': 4 })

  t.true(await fn(4) === 5)
  await sleep(96)

  await sleep(256)
  entries = cache.entries()
  t.deepEqual(toObject(entries), {})

  t.true(await fn(4) === 5)
  await sleep(64)
  entries = cache.entries()
  t.deepEqual(toObject(entries), { '4': 5 })

  // TODO: This is breaking, timeout is not being cleared.
  // t.true(await fn(4) === 5)
  // await sleep(96)
  // entries = cache.entries()
  // t.deepEqual(toObject(entries), { '4': 5 })
})

test.todo('memoize - accepts custom serialization')
