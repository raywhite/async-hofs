import type { Readable } from 'node:stream'

const LIMIT_EXCEEDED = 'Byte limit exceeded.'
const map = new WeakMap<Readable, Promise<Buffer>>()

const createError = (str: string): Error & { type: string } => {
  const err = new Error(str) as Error & { type: string }
  err.type = str
  return err
}

export interface BufferFn {
  (readable: Readable, limit?: number): Promise<Buffer>
  readonly LIMIT_EXCEEDED: typeof LIMIT_EXCEEDED
}

const bufferImpl = (readable: Readable, limit = 1000 * 1024): Promise<Buffer> => {
  const cached = map.get(readable)
  if (cached) return cached

  const promise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let len = 0

    readable.on('data', (chunk: Buffer) => {
      len += chunk.length
      if (len > limit) {
        reject(createError(LIMIT_EXCEEDED))
        return
      }
      chunks.push(chunk)
    })

    readable.on('end', () => resolve(Buffer.concat(chunks, len)))
    readable.on('error', (err) => reject(err))
  })

  map.set(readable, promise)
  return promise
}

export const buffer = bufferImpl as BufferFn
;(buffer as { LIMIT_EXCEEDED: string }).LIMIT_EXCEEDED = LIMIT_EXCEEDED
