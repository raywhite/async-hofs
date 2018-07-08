module.exports.buffer = (function () {
  const LIMIT_EXCEEDED = 'Byte limit exceeded.'
  const map = new WeakMap()

  /**
   * @param {String}
   * @returns {Error}
   */
  const createError = function (str) {
    const err = new Error(str)
    err.type = str
    return err
  }

  /**
   * Buffers a readable stream - default to erroring when more than
   * 1MB is consumed.
   *
   * @param {stream.Readable}
   * @param {Number}
   * @returns {Promise => Buffer}
   */
  const buffer = function (readable, limit = (1000 * 1024)) {
    if (map.has(readable)) return map.get(readable)

    const promise = new Promise(function (resolve, reject) {
      const chunks = []
      let len = 0

      readable.on('data', function (chunk) {
        len += chunk.length
        if (len > limit) return reject(createError(LIMIT_EXCEEDED))
        return chunks.push(chunk)
      })

      readable.on('end', function () {
        return resolve(Buffer.concat(chunks, len))
      })

      readable.on('error', function (err) {
        return reject(err)
      })
    })

    map.set(readable, promise)
    return promise
  }

  buffer.LIMIT_EXCEEDED = LIMIT_EXCEEDED
  return buffer
}())
