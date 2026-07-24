import { assertEquals, assertStringIncludes } from '@std/assert'
import { spy } from '@std/testing/mock'
import logger from '@zanix/logger'
import { attachGlobalErrorHandlers } from 'utils/errors/process.ts'

console.error = () => {}

// deno-lint-ignore no-explicit-any
type MockSelf = any

// `onerror` fires `logAppError` fire-and-forget (it can't be awaited from a sync handler),
// so tests must flush the microtask queue before asserting on the logger spy.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

function createMockSelf() {
  const listeners: Record<string, (event: unknown) => unknown> = {}
  const self: MockSelf = {
    onerror: null,
    addEventListener: (type: string, cb: (event: unknown) => unknown) => {
      listeners[type] = cb
    },
  }
  attachGlobalErrorHandlers(self)
  return { self, listeners }
}

Deno.test({
  name: 'attachGlobalErrorHandlers: onerror uses event.error and its message when available',
  fn: async () => {
    const { self } = createMockSelf()
    const logSpy = spy(logger, 'error')

    const preventDefault = spy(() => {})
    const result = self.onerror({
      preventDefault,
      error: { message: 'boom' },
    })

    assertEquals(result, true)
    await flushMicrotasks()
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'boom')
    logSpy.restore()
  },
})

Deno.test({
  name: 'attachGlobalErrorHandlers: onerror falls back to the event itself when there is no .error',
  fn: async () => {
    const { self } = createMockSelf()
    const logSpy = spy(logger, 'error')

    self.onerror({ message: 'from event' })

    await flushMicrotasks()
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'from event')
    logSpy.restore()
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: onerror falls back to error.toString() when there is no message',
  fn: async () => {
    const { self } = createMockSelf()
    const logSpy = spy(logger, 'error')

    self.onerror({ error: { toString: () => 'stringified error' } })

    await flushMicrotasks()
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'stringified error')
    logSpy.restore()
  },
})

Deno.test({
  name: 'attachGlobalErrorHandlers: onerror falls back to "Unknown" as a last resort',
  fn: async () => {
    const { self } = createMockSelf()
    const logSpy = spy(logger, 'error')

    self.onerror({ error: { toString: () => '' } })

    await flushMicrotasks()
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'Unknown')
    logSpy.restore()
  },
})

Deno.test('attachGlobalErrorHandlers: onerror tolerates a missing preventDefault', async () => {
  const { self } = createMockSelf()
  const logSpy = spy(logger, 'error')

  self.onerror({ error: { message: 'no preventDefault here' } })

  await flushMicrotasks()
  assertStringIncludes(logSpy.calls[0].args[0] as string, 'no preventDefault here')
  logSpy.restore()
})

Deno.test({
  name: 'attachGlobalErrorHandlers: unhandledrejection wraps a string reason as { message }',
  fn: async () => {
    const { listeners } = createMockSelf()
    const logSpy = spy(logger, 'error')

    await listeners['unhandledrejection']({
      preventDefault: () => {},
      reason: undefined,
      promise: Promise.reject('rejected as string'),
    })

    const loggedError = logSpy.calls[0].args[1] as { message: string }
    assertEquals(loggedError.message, 'rejected as string')
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'rejected as string')
    logSpy.restore()
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: unhandledrejection keeps an Error reason as-is and uses event.reason.message',
  fn: async () => {
    const { listeners } = createMockSelf()
    const logSpy = spy(logger, 'error')

    await listeners['unhandledrejection']({
      preventDefault: () => {},
      reason: { message: 'reason message' },
      promise: Promise.reject(new Error('caught error message')),
    })

    const loggedError = logSpy.calls[0].args[1] as Error
    assertEquals(loggedError.message, 'caught error message')
    assertStringIncludes(logSpy.calls[0].args[0] as string, 'reason message')
    logSpy.restore()
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: unhandledrejection falls back to err.message when event.reason has none',
  fn: async () => {
    const { listeners } = createMockSelf()
    const logSpy = spy(logger, 'error')

    await listeners['unhandledrejection']({
      preventDefault: () => {},
      reason: {},
      promise: Promise.reject(new Error('err message fallback')),
    })

    assertStringIncludes(logSpy.calls[0].args[0] as string, 'err message fallback')
    logSpy.restore()
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: unhandledrejection falls back to err.toString() when nothing else is available',
  fn: async () => {
    const { listeners } = createMockSelf()
    const logSpy = spy(logger, 'error')

    await listeners['unhandledrejection']({
      preventDefault: () => {},
      reason: {},
      promise: Promise.reject({ toString: () => 'err toString fallback' }),
    })

    assertStringIncludes(logSpy.calls[0].args[0] as string, 'err toString fallback')
    logSpy.restore()
  },
})

Deno.test({
  name: 'attachGlobalErrorHandlers: unhandledrejection falls back to "Unknown" as a last resort',
  fn: async () => {
    const { listeners } = createMockSelf()
    const logSpy = spy(logger, 'error')

    await listeners['unhandledrejection']({
      preventDefault: () => {},
      reason: {},
      promise: Promise.reject({ toString: () => '' }),
    })

    assertStringIncludes(logSpy.calls[0].args[0] as string, 'Unknown')
    logSpy.restore()
  },
})
