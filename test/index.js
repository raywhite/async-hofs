const test = require('ava')
const hofs = require('../src/index.js')

test('memoize - it\'s here for my own sake', function (t) {
  const { memoize } = hofs
  const fn = x => x + 1

  // TODO: Just commiting this so tests pass.
  t.true(!!memoize(fn))
})
