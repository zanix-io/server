// deno-lint-ignore-file no-await-in-loop
import { assert, assertEquals, assertFalse } from '@std/assert'
import { HttpError } from '@zanix/errors'
import {
  DEFAULT_ERROR_LOG_THROTTLE_CONFIG,
  defaultErrorLogThrottleStore,
  ErrorLogThrottle,
  type ErrorLogThrottleStore,
  setErrorLogThrottleConfig,
  setErrorLogThrottleStore,
  shouldNotLogError,
} from 'utils/errors/helper.ts'

console.error = () => {}

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

// Test: shouldNotLogError delegates to a custom store instead of the default in-memory Map
Deno.test('shouldNotLogError - delegates to a custom ErrorLogThrottleStore', async () => {
  const { store, calls } = createRecordingStore()
  setErrorLogThrottleStore(store)

  try {
    const knownError = new HttpError('UNAUTHORIZED')
    const errorStatus = knownError.status.value

    const result = await shouldNotLogError(knownError)

    assert(result, 'It should return true because the custom store starts a fresh count')
    assertEquals(calls, [{ method: 'increment', status: errorStatus }])
  } finally {
    setErrorLogThrottleStore(defaultErrorLogThrottleStore)
  }
})

// Test: a custom store's own count (not the default Map's) governs the 50-per-window suppression
Deno.test({
  name: 'shouldNotLogError - suppresses once the custom store reports 50 occurrences',
  fn: async () => {
    const { store, calls } = createRecordingStore()
    setErrorLogThrottleStore(store)

    try {
      const knownError = new HttpError('METHOD_NOT_ALLOWED')

      for (let i = 0; i < 49; i++) {
        assert(await shouldNotLogError(knownError))
      }

      const result = await shouldNotLogError(knownError)
      assertFalse(result, 'It should return false once the custom store reaches 50')

      const resetCalls = calls.filter((c) => c.method === 'reset')
      assertEquals(resetCalls.length, 1, 'the store should be reset exactly once, on threshold hit')
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
    }
  },
})

// Test: after restoring the default store, throttling is independent again per-instance
Deno.test({
  name: 'shouldNotLogError - restoring the default store resumes independent in-memory tracking',
  fn: async () => {
    const { store } = createRecordingStore()
    setErrorLogThrottleStore(store)
    setErrorLogThrottleStore(defaultErrorLogThrottleStore)

    const knownError = new HttpError('UNAUTHORIZED')
    const result = await shouldNotLogError(knownError)

    assert(result, 'It should behave like a fresh window against the restored default store')
  },
})

// Test: setErrorLogThrottleConfig lets the threshold and window be tuned
Deno.test({
  name: 'setErrorLogThrottleConfig - honors a custom threshold and window',
  fn: async () => {
    const { store } = createRecordingStore()
    setErrorLogThrottleStore(store)
    setErrorLogThrottleConfig({ threshold: 3, windowMs: 1000 })

    try {
      const knownError = new HttpError('NOT_FOUND')

      assert(await shouldNotLogError(knownError), 'occurrence 1/3')
      assert(await shouldNotLogError(knownError), 'occurrence 2/3')

      const result = await shouldNotLogError(knownError)
      assertFalse(result, 'It should return false once the custom threshold (3) is reached')
      assertEquals(
        knownError.meta?.reason,
        'Error rate exceeded: 3 errors within 1000ms',
      )
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setErrorLogThrottleConfig(DEFAULT_ERROR_LOG_THROTTLE_CONFIG)
    }
  },
})

// Test: `new ErrorLogThrottle({...})` is a facade over setErrorLogThrottleConfig + setErrorLogThrottleStore
Deno.test({
  name: 'ErrorLogThrottle - applies threshold/windowMs without touching the active store',
  fn: async () => {
    const { store, calls } = createRecordingStore()
    setErrorLogThrottleStore(store)

    try {
      new ErrorLogThrottle({ threshold: 2, windowMs: 500 })

      const knownError = new HttpError('BAD_REQUEST')

      assert(await shouldNotLogError(knownError), 'occurrence 1/2')
      const result = await shouldNotLogError(knownError)

      assertFalse(result, 'It should return false once the custom threshold (2) is reached')
      assertEquals(
        knownError.meta?.reason,
        'Error rate exceeded: 2 errors within 500ms',
      )
      // the store passed to setErrorLogThrottleStore earlier is still the one in use
      assert(calls.some((c) => c.method === 'increment'))
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setErrorLogThrottleConfig(DEFAULT_ERROR_LOG_THROTTLE_CONFIG)
    }
  },
})

// Test: `new ErrorLogThrottle({ store })` installs a new store as the active one
Deno.test({
  name: 'ErrorLogThrottle - installs a custom store',
  fn: async () => {
    const { store, calls } = createRecordingStore()

    try {
      new ErrorLogThrottle({ store })

      const knownError = new HttpError('CONFLICT')
      await shouldNotLogError(knownError)

      assertEquals(calls, [{ method: 'increment', status: knownError.status.value }])
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
    }
  },
})

// Test: by default, server errors (>= 500) are always logged and never consult the store at all
Deno.test('shouldNotLogError - never consults the store for server errors by default', async () => {
  const { store, calls } = createRecordingStore()
  setErrorLogThrottleStore(store)

  try {
    const knownError = new HttpError('BAD_GATEWAY')
    const result = await shouldNotLogError(knownError)

    assertFalse(result, 'server errors are always logged by default')
    assertEquals(calls, [], 'the store must never be consulted for a 5xx status by default')
  } finally {
    setErrorLogThrottleStore(defaultErrorLogThrottleStore)
  }
})

// Test: raising maxStatus brings server errors into the throttled range too
Deno.test({
  name: 'ErrorLogThrottle - raising maxStatus also throttles server errors',
  fn: async () => {
    const { store, calls } = createRecordingStore()
    setErrorLogThrottleStore(store)
    new ErrorLogThrottle({ maxStatus: 600, threshold: 2, windowMs: 1000 })

    try {
      const knownError = new HttpError('BAD_GATEWAY') // 502, normally always logged unsuppressed

      assert(await shouldNotLogError(knownError), 'occurrence 1/2 stays suppressed')

      const result = await shouldNotLogError(knownError)
      assertFalse(result, 'threshold reached, even for a 5xx status once maxStatus is raised')
      assert(
        calls.some((c) => c.method === 'increment'),
        'the store was consulted for a 5xx status',
      )
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setErrorLogThrottleConfig(DEFAULT_ERROR_LOG_THROTTLE_CONFIG)
    }
  },
})

// Test: excludeStatuses always logs listed statuses, bypassing the store entirely
Deno.test({
  name: 'ErrorLogThrottle - excludeStatuses always logs listed statuses without the store',
  fn: async () => {
    const { store, calls } = createRecordingStore()
    setErrorLogThrottleStore(store)
    new ErrorLogThrottle({ excludeStatuses: [401] })

    try {
      const knownError = new HttpError('UNAUTHORIZED') // 401, in the excluded list

      const first = await shouldNotLogError(knownError)
      const second = await shouldNotLogError(knownError)

      assertFalse(first, 'excluded statuses are always logged')
      assertFalse(second, 'excluded statuses are always logged, every single time')
      assertEquals(calls, [], 'the store must never be consulted for an excluded status')
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setErrorLogThrottleConfig(DEFAULT_ERROR_LOG_THROTTLE_CONFIG)
    }
  },
})

// Test: excludeStatuses leaves other, non-listed statuses throttled as usual
Deno.test({
  name: 'ErrorLogThrottle - excludeStatuses does not affect other statuses',
  fn: async () => {
    const { store } = createRecordingStore()
    setErrorLogThrottleStore(store)
    new ErrorLogThrottle({ excludeStatuses: [401], threshold: 2, windowMs: 1000 })

    try {
      const knownError = new HttpError('FORBIDDEN') // 403, not in the excluded list

      assert(await shouldNotLogError(knownError), 'occurrence 1/2')
      const result = await shouldNotLogError(knownError)

      assertFalse(result, 'non-excluded statuses are still throttled by the threshold')
    } finally {
      setErrorLogThrottleStore(defaultErrorLogThrottleStore)
      setErrorLogThrottleConfig(DEFAULT_ERROR_LOG_THROTTLE_CONFIG)
    }
  },
})
