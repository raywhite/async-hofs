const test = require('ava')
const { memoize } = require('../src/memoize')

test('memoize - basic, seemingly sink functions', async function (t) {
  const fn = memoize(x => x + 1)

  t.true(typeof fn.cache === 'object')
  t.true(fn.cache.constructor.name === 'Map')

  t.true(await fn(1) === 2)
  t.true(await fn(2) === 3)
  t.true(await fn(3) === 4)
})
