import { assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'
import { getTemporaryFolder } from '@zanix/helpers'
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

Deno.test('getServiceId: derives and sanitizes the id from the project name', async () => {
  // `readConfig()` (`@zanix/helpers`) memoizes its result process-wide, keyed by resolved config
  // path — a distinct `Deno.cwd()` (with its own real config file) gets its own cache entry, so
  // this test controls what it resolves to without depending on being the first caller in the
  // process (mocking `Deno.readTextFileSync` at module load time, as this file used to, raced
  // anything else that happened to import the logger first and read the real config before this
  // file's own mock ever installed). Same convention as
  // `database-name-empty.test.ts`/`database-name-truncate.test.ts`.
  const dir = getTemporaryFolder(import.meta.url, 'identity-')
  await Deno.writeTextFile(dir + '/deno.json', '{"name": "Custom Billing"}')
  const cwdStub = stub(Deno, 'cwd', () => dir)

  try {
    assertEquals(getServiceId(), 'custom_billing')
  } finally {
    cwdStub.restore()
    await Deno.remove(dir, { recursive: true })
  }
})
