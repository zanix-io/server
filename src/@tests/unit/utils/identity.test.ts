import { assertEquals } from '@std/assert'
import { getServiceId, sanitizeIdentifier } from 'utils/identity.ts'

Deno.test('sanitizeIdentifier: lowercases and collapses non [a-z0-9_] runs to a single "_"', () => {
  assertEquals(sanitizeIdentifier('Custom Billing!!'), 'custom_billing')
  assertEquals(sanitizeIdentifier('@zanix/core'), 'zanix_core')
})

Deno.test('sanitizeIdentifier: strips leading/trailing underscores after sanitization', () => {
  assertEquals(sanitizeIdentifier('--custom--'), 'custom')
})

Deno.test('sanitizeIdentifier: truncates to the given max length', () => {
  assertEquals(sanitizeIdentifier('a'.repeat(100), 10), 'a'.repeat(10))
})

Deno.test('sanitizeIdentifier: defaults to a 64-character cap', () => {
  assertEquals(sanitizeIdentifier('a'.repeat(100)).length, 64)
})

// `readConfig()` (from `@zanix/helpers`) memoizes its result the first time it's called with a
// given path — mocking `Deno.readTextFileSync` before that first call lets us control it here,
// same convention as `database-name-empty.test.ts`/`database-name-truncate.test.ts`.
Deno.readTextFileSync = (() => '{"name": "Custom Billing"}') as typeof Deno.readTextFileSync

Deno.test('getServiceId: derives and sanitizes the id from the project name', () => {
  assertEquals(getServiceId(), 'custom_billing')
})
