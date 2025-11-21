import { assert, assertFalse } from '@std/assert'
import { HttpError, InternalError } from '@zanix/errors'
import {
  getStatusError,
  setErrorConcurrency,
  shouldNotLogError,
  statusErrorConcurrency,
} from 'webserver/helpers/errors.ts'

console.error = () => {}

// Test: shouldNotLogError with an unknown error
Deno.test('shouldNotLogError - unknown error', () => {
  const unknownError = new Error('Unknown')
  const result = shouldNotLogError(unknownError)
  assertFalse(result, 'It should return false because the error is not known')
})

// Test: shouldNotLogError with a known error without status
Deno.test('shouldNotLogError - known error without status', () => {
  const knownError = new InternalError('BAD_GATEWAY')
  const result = shouldNotLogError(knownError)
  const errorStatus = getStatusError(knownError)
  assertFalse(errorStatus)
  assertFalse(
    result,
    'It should return false because the error is known and _logged is true as default',
  )
})

// Test: shouldNotLogError with a known error with status 500
Deno.test('shouldNotLogError - known error with status 500', () => {
  const knownError = new HttpError('BAD_GATEWAY')
  const result = shouldNotLogError(knownError)
  const errorStatus = getStatusError(knownError)

  assert(errorStatus && errorStatus >= 500)

  assertFalse(result, 'It should return false because the status error >= 500')
})

// Test: shouldNotLogError with a known error with no valid status error
Deno.test('shouldNotLogError - known error with no valid status error', () => {
  const knownError = { status: { value: 200 }, _logged: false }
  const result = shouldNotLogError(knownError)

  const errorStatus = getStatusError(knownError)
  assert(errorStatus === 200)

  assert(result, 'It should return true because the status error is not considering an error')
})

// Test: shouldNotLogError with a known error already logged
Deno.test('shouldNotLogError - known error already logged', () => {
  const knownError = { _logged: true }
  const result = shouldNotLogError(knownError)
  assertFalse(result, 'It should return false because the error was already logged')
})

// Test: shouldNotLogError with a known error with status and less than 50 errors
Deno.test('shouldNotLogError - known error with status and less than 50 errors', () => {
  const knownError = new HttpError('BAD_REQUEST')

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)

  const result = shouldNotLogError(knownError)
  assert(result, 'It should return true because the error count has not reached the limit')
})

// Test: shouldNotLogError with a known error and more than 50 errors
Deno.test('shouldNotLogError - known error with more than 50', () => {
  const knownError = new HttpError('FORBIDDEN')

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)

  // Simulate 50 errors already recorded
  if (errorStatus) {
    setErrorConcurrency(errorStatus) // Initialize if it doesn't exist
    statusErrorConcurrency.set(errorStatus, {
      value: 48,
      expiredTime: Date.now() + 1000,
    })
  }
  assert(shouldNotLogError(knownError)) // add one more register
  const result = shouldNotLogError(knownError)
  assertFalse(result, 'It should return false because more than 50 errors have occurred')

  const newResult = shouldNotLogError(knownError)

  assert(newResult, 'It should return true because the error counter has been reset')
})

// Test: shouldNotLogError with a known error and expired time
Deno.test('shouldNotLogError - known error with more than 50 errors and expired time', () => {
  const knownError = new HttpError('CONFLICT')

  const errorStatus = getStatusError(knownError) || 0
  assert(errorStatus >= 400 && errorStatus < 500)
  // Simulate 50 errors already recorded
  if (errorStatus) {
    setErrorConcurrency(errorStatus) // Initialize if it doesn't exist
    statusErrorConcurrency.set(errorStatus, {
      value: 49, // Set exactly 50 errors
      expiredTime: Date.now() - 100,
    })
  }

  const result = shouldNotLogError(knownError)
  assert(result, 'It should return true because the error counter has been reset')
})
