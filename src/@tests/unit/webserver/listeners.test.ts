import { assert, assertEquals } from '@std/assert'
import { onErrorListener, onListen } from 'modules/webserver/helpers/listeners.ts'
import { assertSpyCalls, spy } from '@std/testing/mock'
import logger from '@zanix/logger'

console.error = () => {}

Deno.test('onErrorListener: uses the custom handler response when it succeeds', async () => {
  const customResponse = new Response('custom', { status: 418 })
  const listener = onErrorListener(() => customResponse, 'test-server')

  const response = await listener(new Error('boom'))

  assertEquals(response.status, 418)
})

Deno.test({
  name: 'onErrorListener: falls back to a 500 http error response when the custom handler throws',
  fn: async () => {
    const listener = onErrorListener(() => {
      throw new Error('custom handler failed')
    }, 'test-server')

    const response = await listener(new Error('boom'))

    // No explicit `.status` on either error involved — defaults to 500, not 400: an unhandled
    // exception in the custom handler itself is unambiguously a server-side fault.
    assertEquals(response.status, 500)
  },
})

Deno.test({
  name:
    "onErrorListener: logs the custom handler's own secondary failure (distinct from the original error) instead of swallowing it silently, and still falls back to a 500 without crashing",
  fn: async () => {
    const logSpy = spy(logger, 'error')

    const originalError = new Error('boom')
    const handlerError = new Error('custom handler failed')

    const listener = onErrorListener(() => {
      throw handlerError
    }, 'test-server')

    const response = await listener(originalError)

    assertEquals(response.status, 500)

    // One log for the original error (from `logAppError` above), one for the custom handler's own
    // secondary failure (this fix) — never silently swallowed.
    assertSpyCalls(logSpy, 2)

    const [message, meta] = logSpy.calls[1].args as [string, Record<string, unknown>]
    assert(message.includes('test-server'))
    assert(message.toLowerCase().includes('onerror'))
    assertEquals(meta.originalError as Error, originalError)
    assertEquals(meta.handlerError as Error, handlerError)

    logSpy.restore()
  },
})

Deno.test({
  name: 'onErrorListener: falls back to a 500 http error response without a custom handler',
  fn: async () => {
    const listener = onErrorListener(undefined, 'test-server')

    const response = await listener(new Error('boom'))

    assertEquals(response.status, 500)
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
