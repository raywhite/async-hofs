import test from 'ava'
import { Readable } from 'node:stream'
import { buffer } from '../dist/index.js'

test('buffer - buffers a writable stream', async (t) => {
  const CHAR_STRING = 'some string of characters... :)'
  const LONG_STRING = 'this string of characters is too long...'
  const BYTE_LENGTH = Buffer.byteLength(LONG_STRING)

  const createReadStream = (str) => new Readable({
    read() {
      const chunk = Buffer.from(str.slice(0, 4))
      str = str.slice(4)
      return this.push(chunk.length ? chunk : null)
    },
  })

  let readable = createReadStream(CHAR_STRING)
  const b = await buffer(readable)
  t.true(String(b) === CHAR_STRING)

  readable = createReadStream(LONG_STRING)
  let message
  try {
    await buffer(readable, BYTE_LENGTH - 4)
  } catch (err) {
    message = err.message
  }
  t.true(message === 'Byte limit exceeded.')
  t.true(message === buffer.LIMIT_EXCEEDED)

  // Two consumers should return the same promise.
  t.true(buffer(readable) === buffer(readable))
})
