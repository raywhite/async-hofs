const test = require('ava')
const { Readable } = require('stream')
const { buffer } = require('../src/buffer')

test('buffer - buffers a writable stream', async function (t) {
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
  try {
    b = await buffer(readable, BYTE_LENGTH - 4)
  } catch (err) {
    message = err.message
  }

  t.true(message === 'Byte limit exceeded.')
  t.true(message === buffer.LIMIT_EXCEEDED)

  // NOTE: Two consumers should return the same promise.
  t.true(buffer(readable) === buffer(readable))
})
