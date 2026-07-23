import { assertEquals } from '@std/assert'
import { onErrorListener, onListen } from 'modules/webserver/helpers/listeners.ts'

console.error = () => {}

Deno.test('onErrorListener: uses the custom handler response when it succeeds', async () => {
  const customResponse = new Response('custom', { status: 418 })
  const listener = onErrorListener(() => customResponse, 'test-server')

  const response = await listener(new Error('boom'))

  assertEquals(response.status, 418)
})

Deno.test({
  name:
    'onErrorListener: falls back to the default http error response when the custom handler throws',
  fn: async () => {
    const listener = onErrorListener(() => {
      throw new Error('custom handler failed')
    }, 'test-server')

    const response = await listener(new Error('boom'))

    assertEquals(response.status, 400)
  },
})

Deno.test({
  name: 'onErrorListener: falls back to the default http error response without a custom handler',
  fn: async () => {
    const listener = onErrorListener(undefined, 'test-server')

    const response = await listener(new Error('boom'))

    assertEquals(response.status, 400)
  },
})

Deno.test('onListen: logs success and ignores errors thrown by the custom listen handler', () => {
  const listener = onListen(
    () => {
      throw new Error('listen handler failed')
    },
    'http',
    'test-server',
  )

  listener({ hostname: '0.0.0.0', port: 8000 } as Deno.NetAddr)
})

Deno.test('onListen: works without a custom listen handler', () => {
  const listener = onListen(undefined, 'http', 'test-server')

  listener({ hostname: '0.0.0.0', port: 8000 } as Deno.NetAddr)
})
