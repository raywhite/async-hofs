const test = require('ava')
const { createRetrierFn } = require('../src/retrier')

test('createRetrierFn - retries async errors with delay', async function (t) {
  const sleep = ms => new Promise(r => setTimeout(r, ms))

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

      return i
    }
  }

  // NOTE: This serves as an example of a curve function.
  const createCurve = function (limit, ms) {
    const curve = function (err, count) {
      if (count > limit) throw err
      return ms
    }

    return curve
  }

  const succeeder = createRetrierFn(createFailer(2), createCurve(3, 200))
  t.true(typeof succeeder === 'function')

  const ts = new Date().getTime()

  const success = await succeeder()
  t.true(success === 0)
  t.true((new Date().getTime() - ts) >= 400)

  const failer = createRetrierFn(createFailer(5), createCurve(2, 200))
  t.true(typeof failer === 'function')

  let value

  try {
    await failer()
  } catch ({ message }) {
    value = +message // Coerce.
  }

  t.true(value === 2)
})
