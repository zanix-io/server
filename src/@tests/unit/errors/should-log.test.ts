// deno-lint-ignore-file no-await-in-loop
import { assert, assertEquals, assertFalse } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { HttpError, InternalError } from '@zanix/errors'
import { getStatusError, shouldNotLogError } from 'utils/errors/helper.ts'

console.error = () => {}

// Test: shouldNotLogError with an unknown error
Deno.test('shouldNotLogError - unknown error', async () => {
  const unknownError = new Error('Unknown')
  const result = await shouldNotLogError(unknownError)
  assertFalse(result, 'It should return false because the error is not known')
})

// Test: shouldNotLogError with a critic error
Deno.test('shouldNotLogError - known error without status', async () => {
  const knownError = new InternalError('BAD_GATEWAY', { shouldLog: false })
  const result = await shouldNotLogError(knownError)
  assert(result, 'It should return true because critic error already are logged')
})

// Test: shouldNotLogError with a known error with status 500
Deno.test('shouldNotLogError - known error with status 500', async () => {
  const knownError = new HttpError('BAD_GATEWAY')
  const result = await shouldNotLogError(knownError)
  const errorStatus = getStatusError(knownError)

  assert(errorStatus && errorStatus >= 500)

  assertFalse(result, 'It should return false because the status error >= 500')
})

// Test: shouldNotLogError with a known error with no valid status error
Deno.test('shouldNotLogError - known error with no valid status error', async () => {
  const knownError = { status: { value: 200 }, _logged: false }
  const result = await shouldNotLogError(knownError)

  const errorStatus = getStatusError(knownError)
  assert(errorStatus === 200)

  assert(result, 'It should return true because the status error is not considering an error')
})

// Test: shouldNotLogError with a known error already logged
Deno.test('shouldNotLogError - known error already logged', async () => {
  const knownError = { _logged: true }
  const result = await shouldNotLogError(knownError)
  assert(result, 'It should return true because the error was already logged')
})

// Test: shouldNotLogError with a known error with status and less than 50 errors
Deno.test('shouldNotLogError - known error with status and less than 50 errors', async () => {
  const knownError = new HttpError('BAD_REQUEST')

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)

  const result = await shouldNotLogError(knownError)
  assert(result, 'It should return true because the error count has not reached the limit')
})

// Test: shouldNotLogError with a known error and 50 errors within the window
Deno.test('shouldNotLogError - known error with 50 errors within the window', async () => {
  const knownError = new HttpError('FORBIDDEN', { meta: { data: 'my meta data' } })

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)

  // Occurrences 1..49 stay under the threshold
  for (let i = 0; i < 49; i++) {
    assert(await shouldNotLogError(knownError))
  }

  // The 50th occurrence crosses the threshold
  const result = await shouldNotLogError(knownError)
  assertEquals(knownError.meta, {
    data: 'my meta data',
    reason: 'Error rate exceeded: 50 errors within 3600000ms',
    description:
      'Error triggered by exceeding 50 errors within the configured window, possibly due to system overload or recurring issues.',
    resolution: 'Check system load or request patterns to address potential causes.',
  })
  assertFalse(result, 'It should return false because 50 errors have occurred')

  // The window was reset by the threshold hit, so the next occurrence starts fresh
  const newResult = await shouldNotLogError(knownError)
  assert(newResult, 'It should return true because the error counter has been reset')
})

// Test: shouldNotLogError with a known error without a pre-existing `meta` object
Deno.test('shouldNotLogError - 50 errors and no existing meta', async () => {
  const knownError: { status: { value: number }; _logged: boolean; meta?: unknown } = {
    status: { value: 404 },
    _logged: false,
  }

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)

  for (let i = 0; i < 49; i++) {
    assert(await shouldNotLogError(knownError))
  }

  const result = await shouldNotLogError(knownError)

  assertEquals(knownError.meta, {
    reason: 'Error rate exceeded: 50 errors within 3600000ms',
    description:
      'Error triggered by exceeding 50 errors within the configured window, possibly due to system overload or recurring issues.',
    resolution: 'Check system load or request patterns to address potential causes.',
  })
  assertFalse(result, 'It should return false because 50 errors have occurred')
})

// Test: shouldNotLogError resets the window once it naturally expires
Deno.test('shouldNotLogError - resets the window once it expires', async () => {
  using time = new FakeTime()
  const knownError = new HttpError('CONFLICT')

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)

  for (let i = 0; i < 49; i++) {
    assert(await shouldNotLogError(knownError))
  }
  time.tick(60 * 60 * 1000 + 1) // advance past the 1-hour rolling window

  const result = await shouldNotLogError(knownError)

  assert(result, 'It should return true because the window expired and restarted')
})
