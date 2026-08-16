import { assertEquals } from '@std/assert'
import {
  getApplicationMountPrefix,
  registerApplicationMount,
} from 'modules/webserver/application-mount-registry.ts'

Deno.test('getApplicationMountPrefix: an unregistered Application resolves to ""', () => {
  assertEquals(getApplicationMountPrefix('never-registered'), '')
})

Deno.test('getApplicationMountPrefix: defaults to the default Application with no argument', () => {
  assertEquals(getApplicationMountPrefix(), '')
})

Deno.test('registerApplicationMount: normalizes the prefix (slashes)', () => {
  registerApplicationMount('billing-normalize-test', 'billing/')
  assertEquals(getApplicationMountPrefix('billing-normalize-test'), '/billing')
})

Deno.test('registerApplicationMount: an empty prefix is a valid, explicit "no mount"', () => {
  registerApplicationMount('inventory-empty-test', '')
  assertEquals(getApplicationMountPrefix('inventory-empty-test'), '')
})

Deno.test('registerApplicationMount: calling it twice for the same Application overwrites', () => {
  registerApplicationMount('reviews-overwrite-test', 'old-prefix')
  registerApplicationMount('reviews-overwrite-test', 'new-prefix')
  assertEquals(
    getApplicationMountPrefix('reviews-overwrite-test'),
    '/new-prefix',
  )
})

Deno.test('registerApplicationMount: two different Applications get independent prefixes', () => {
  registerApplicationMount('app-a-independent-test', 'a')
  registerApplicationMount('app-b-independent-test', 'b')
  assertEquals(getApplicationMountPrefix('app-a-independent-test'), '/a')
  assertEquals(getApplicationMountPrefix('app-b-independent-test'), '/b')
})
