import { assertEquals, assertFalse, assertStringIncludes } from '@std/assert'
import { spy, stub } from '@std/testing/mock'
import logger from '@zanix/logger'
import {
  attachGlobalErrorHandlers,
  type AttachGlobalErrorHandlersOptions,
} from 'utils/errors/process.ts'
import {
  DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG,
  resetUncaughtErrorHealth,
  setUncaughtErrorMonitorConfig,
} from 'utils/errors/uncaught-error-monitor.ts'
import { defaultErrorLogThrottleStore, setErrorLogThrottleStore } from 'utils/errors/helper.ts'
import type { ErrorLogThrottleStore } from 'utils/errors/helper.ts'

console.error = () => {}

// deno-lint-ignore no-explicit-any
type MockSelf = any

// `onerror` fires `logAppError` fire-and-forget (it can't be awaited from a sync handler),
// so tests must flush the microtask queue before asserting on the logger spy.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A fresh, isolated `ErrorLogThrottleStore` — same shape `recordUncaughtError` itself shares with
 *  `ErrorLogThrottle` — so a test exercising the uncaught-error monitor never leaks its own count
 *  into another test via the shared default in-memory Map. */
function createRecordingStore(): ErrorLogThrottleStore {
  const counts = new Map<number, number>()
  return {
    increment(status) {
      const next = (counts.get(status) ?? 0) + 1
      counts.set(status, next)
      return next
    },
    reset(status) {
      counts.delete(status)
    },
  }
}

function createMockSelf(options?: AttachGlobalErrorHandlersOptions) {
  const listeners: Record<string, (event: unknown) => unknown> = {}
  const self: MockSelf = {
    onerror: null,
    addEventListener: (type: string, cb: (event: unknown) => unknown) => {
      listeners[type] = cb
    },
  }
  attachGlobalErrorHandlers(self, options)
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
    assertStringIncludes(
      logSpy.calls[0].args[0] as string,
      'stringified error',
    )
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
  assertStringIncludes(
    logSpy.calls[0].args[0] as string,
    'no preventDefault here',
  )
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
    assertStringIncludes(
      logSpy.calls[0].args[0] as string,
      'rejected as string',
    )
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

    assertStringIncludes(
      logSpy.calls[0].args[0] as string,
      'err message fallback',
    )
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

    assertStringIncludes(
      logSpy.calls[0].args[0] as string,
      'err toString fallback',
    )
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

Deno.test({
  name:
    'attachGlobalErrorHandlers: unhandledrejection never calls onUncaughtErrorThresholdExceeded/Deno.exit when the monitor stays under threshold',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore())
    setUncaughtErrorMonitorConfig({ threshold: 5, windowMs: 60_000, exitOnThreshold: true })
    const onExceeded = spy(() => Promise.resolve())
    const exitStub = stub(Deno, 'exit', () => undefined as never)

    try {
      const { listeners } = createMockSelf({ onUncaughtErrorThresholdExceeded: onExceeded })

      await listeners['unhandledrejection']({
        preventDefault: () => {},
        reason: undefined,
        promise: Promise.reject('boom'),
      })

      assertEquals(onExceeded.calls.length, 0)
      assertEquals(exitStub.calls.length, 0)
    } finally {
      exitStub.restore()
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setUncaughtErrorMonitorConfig(DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG)
      resetUncaughtErrorHealth()
    }
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: unhandledrejection drains via onUncaughtErrorThresholdExceeded, then calls Deno.exit(1), once the monitor threshold is crossed with exitOnThreshold enabled',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore())
    setUncaughtErrorMonitorConfig({ threshold: 1, windowMs: 60_000, exitOnThreshold: true })
    const onExceeded = spy(() => Promise.resolve())
    const exitStub = stub(Deno, 'exit', () => undefined as never)

    try {
      const { listeners } = createMockSelf({ onUncaughtErrorThresholdExceeded: onExceeded })

      await listeners['unhandledrejection']({
        preventDefault: () => {},
        reason: undefined,
        promise: Promise.reject('boom'),
      })

      assertEquals(onExceeded.calls.length, 1, 'the drain callback ran exactly once')
      assertEquals(exitStub.calls.length, 1, 'Deno.exit ran exactly once')
      assertEquals(exitStub.calls[0].args, [1])
    } finally {
      exitStub.restore()
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setUncaughtErrorMonitorConfig(DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG)
      resetUncaughtErrorHealth()
    }
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: onerror (fire-and-forget) also drains and exits once the monitor threshold is crossed',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore())
    setUncaughtErrorMonitorConfig({ threshold: 1, windowMs: 60_000, exitOnThreshold: true })
    const onExceeded = spy(() => Promise.resolve())
    const exitStub = stub(Deno, 'exit', () => undefined as never)

    try {
      const { self } = createMockSelf({ onUncaughtErrorThresholdExceeded: onExceeded })

      self.onerror({ preventDefault: () => {}, error: { message: 'boom' } })
      await flushMicrotasks()

      assertEquals(onExceeded.calls.length, 1)
      assertEquals(exitStub.calls.length, 1)
      assertEquals(exitStub.calls[0].args, [1])
    } finally {
      exitStub.restore()
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setUncaughtErrorMonitorConfig(DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG)
      resetUncaughtErrorHealth()
    }
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: Deno.exit(1) still runs even when onUncaughtErrorThresholdExceeded itself rejects — the drain is best-effort, never blocking the exit',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore())
    setUncaughtErrorMonitorConfig({ threshold: 1, windowMs: 60_000, exitOnThreshold: true })
    const onExceeded = spy(() => Promise.reject(new Error('drain failed')))
    const exitStub = stub(Deno, 'exit', () => undefined as never)

    try {
      const { listeners } = createMockSelf({ onUncaughtErrorThresholdExceeded: onExceeded })

      await listeners['unhandledrejection']({
        preventDefault: () => {},
        reason: undefined,
        promise: Promise.reject('boom'),
      })

      assertEquals(onExceeded.calls.length, 1)
      assertEquals(exitStub.calls.length, 1, 'a failing drain must not prevent the exit')
    } finally {
      exitStub.restore()
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setUncaughtErrorMonitorConfig(DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG)
      resetUncaughtErrorHealth()
    }
  },
})

Deno.test({
  name:
    'attachGlobalErrorHandlers: past threshold, Deno.exit is never called while exitOnThreshold stays off (the default)',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore())
    setUncaughtErrorMonitorConfig({ threshold: 1, windowMs: 60_000 })
    const exitStub = stub(Deno, 'exit', () => undefined as never)

    try {
      const { listeners } = createMockSelf()

      await listeners['unhandledrejection']({
        preventDefault: () => {},
        reason: undefined,
        promise: Promise.reject('boom'),
      })

      assertFalse(exitStub.calls.length > 0, 'exitOnThreshold defaults to false')
    } finally {
      exitStub.restore()
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setUncaughtErrorMonitorConfig(DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG)
      resetUncaughtErrorHealth()
    }
  },
})
