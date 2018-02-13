const { createAsyncFnPool } = require('./index')

const sleep = async function (value) {
  await new Promise(r => setTimeout(r, Math.random() * 16))
  return value
}

const inputs = [1, 2, 3, 4, 5, 6]
const outputs = []

const thread = async function () {
  while (inputs.length) {
    const value = await sleep(inputs.shift())
    outputs.push(value)
  }
}

const fn = async function () {
  await createAsyncFnPool(thread, 2)
  console.log.call(console, outputs) // eslint-disable-line no-console
}

fn().catch(console.error.bind(console))  // eslint-disable-line no-console
