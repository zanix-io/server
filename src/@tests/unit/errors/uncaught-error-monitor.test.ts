import { assert, assertEquals, assertFalse } from '@std/assert'
import type { HealthCheckContext } from 'typings/server.ts'
import {
  defaultErrorLogThrottleStore,
  type ErrorLogThrottleStore,
  setErrorLogThrottleStore,
} from 'utils/errors/helper.ts'
import {
  DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG,
  recordUncaughtError,
  resetUncaughtErrorHealth,
  setUncaughtErrorMonitorConfig,
  UncaughtErrorMonitor,
  uncaughtErrorRateCheck,
} from 'utils/errors/uncaught-error-monitor.ts'

console.error = () => {}

// `uncaughtErrorRateCheck` never reads its `context` — same as any `HealthCheckFn` that only
// needs its own closure (see that type's own doc) — so a real `HealthCheckContext` is never
// needed here, only something structurally valid to pass.
const FAKE_HEALTH_CONTEXT = {} as HealthCheckContext

const UNCAUGHT_ERROR_KEY = -1

function createRecordingStore() {
  const counts = new Map<number, number>()
  const calls: { method: 'increment' | 'reset'; status: number }[] = []

  const store: ErrorLogThrottleStore = {
    increment(status) {
      calls.push({ method: 'increment', status })
      const next = (counts.get(status) ?? 0) + 1
      counts.set(status, next)
      return next
    },
    reset(status) {
      calls.push({ method: 'reset', status })
      counts.delete(status)
    },
  }

  return { store, calls }
}

/** Resets every piece of this module's shared state back to a clean slate. */
function resetAll() {
  setErrorLogThrottleStore(defaultErrorLogThrottleStore)
  setUncaughtErrorMonitorConfig(DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG)
  resetUncaughtErrorHealth()
}

Deno.test({
  name:
    'recordUncaughtError: reuses the exact same errorLogThrottleStore ErrorLogThrottle installs',
  fn: async () => {
    const { store, calls } = createRecordingStore()
    setErrorLogThrottleStore(store)

    try {
      await recordUncaughtError()

      assertEquals(
        calls,
        [{ method: 'increment', status: UNCAUGHT_ERROR_KEY }],
        'a custom store installed via setErrorLogThrottleStore is the one recordUncaughtError uses too',
      )
    } finally {
      resetAll()
    }
  },
})

Deno.test({
  name: 'recordUncaughtError: reports false while under the configured threshold',
  fn: async () => {
    // Each test installs its own recording store — isolates its own count from every other test's,
    // the same way `helper-log-throttle.test.ts` isolates `ErrorLogThrottle`'s own tests.
    setErrorLogThrottleStore(createRecordingStore().store)
    setUncaughtErrorMonitorConfig({ threshold: 3, windowMs: 60_000 })

    try {
      assertFalse(await recordUncaughtError(), 'occurrence 1/3')
      assertFalse(await recordUncaughtError(), 'occurrence 2/3')
      assert(
        uncaughtErrorRateCheck.call(FAKE_HEALTH_CONTEXT, FAKE_HEALTH_CONTEXT),
        'still healthy under threshold',
      )
    } finally {
      resetAll()
    }
  },
})

Deno.test({
  name:
    'recordUncaughtError: crossing threshold degrades uncaughtErrorRateCheck but reports false when exitOnThreshold is off (the default)',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore().store)
    setUncaughtErrorMonitorConfig({ threshold: 2, windowMs: 60_000 })

    try {
      assertFalse(await recordUncaughtError(), 'occurrence 1/2')
      const exceeded = await recordUncaughtError()

      assertFalse(exceeded, 'exitOnThreshold defaults to false — never reports true')
      assertFalse(
        uncaughtErrorRateCheck.call(FAKE_HEALTH_CONTEXT, FAKE_HEALTH_CONTEXT),
        'readiness reports degraded once threshold is crossed',
      )
    } finally {
      resetAll()
    }
  },
})

Deno.test({
  name: 'recordUncaughtError: reports true once threshold is crossed with exitOnThreshold enabled',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore().store)
    setUncaughtErrorMonitorConfig({ threshold: 2, windowMs: 60_000, exitOnThreshold: true })

    try {
      assertFalse(await recordUncaughtError(), 'occurrence 1/2')
      assert(await recordUncaughtError(), 'occurrence 2/2 crosses the threshold')
    } finally {
      resetAll()
    }
  },
})

Deno.test({
  name: 'uncaughtErrorRateCheck: self-heals once windowMs elapses with no further crossing',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore().store)
    setUncaughtErrorMonitorConfig({ threshold: 1, windowMs: 20 })

    try {
      await recordUncaughtError()
      assertFalse(
        uncaughtErrorRateCheck.call(FAKE_HEALTH_CONTEXT, FAKE_HEALTH_CONTEXT),
        'degraded immediately after crossing',
      )

      await new Promise((resolve) => setTimeout(resolve, 40))

      assert(
        uncaughtErrorRateCheck.call(FAKE_HEALTH_CONTEXT, FAKE_HEALTH_CONTEXT),
        'healthy again once windowMs has elapsed',
      )
    } finally {
      resetAll()
    }
  },
})

Deno.test({
  name:
    'resetUncaughtErrorHealth: clears the degraded state immediately, without waiting out windowMs',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore().store)
    setUncaughtErrorMonitorConfig({ threshold: 1, windowMs: 60_000 })

    try {
      await recordUncaughtError()
      assertFalse(
        uncaughtErrorRateCheck.call(FAKE_HEALTH_CONTEXT, FAKE_HEALTH_CONTEXT),
        'degraded immediately after crossing',
      )

      resetUncaughtErrorHealth()

      assert(
        uncaughtErrorRateCheck.call(FAKE_HEALTH_CONTEXT, FAKE_HEALTH_CONTEXT),
        'healthy immediately after a manual reset',
      )
    } finally {
      resetAll()
    }
  },
})

Deno.test({
  name:
    'UncaughtErrorMonitor: applies threshold/windowMs/exitOnThreshold as a config-setter facade',
  fn: async () => {
    setErrorLogThrottleStore(createRecordingStore().store)
    new UncaughtErrorMonitor({ threshold: 1, windowMs: 60_000, exitOnThreshold: true })

    try {
      assert(await recordUncaughtError(), 'the constructor-applied config takes effect immediately')
    } finally {
      resetAll()
    }
  },
})
