import { assertEquals } from '@std/assert/assert-equals'
import { resolveGlobalPrefix } from 'modules/webserver/mod.ts'

Deno.test('resolveGlobalPrefix: a configured prefix always wins, anchored or not', () => {
  assertEquals(resolveGlobalPrefix(undefined, 'custom', 'api'), 'custom')
  assertEquals(resolveGlobalPrefix('my-id', 'custom', 'api'), 'custom')
})

Deno.test('resolveGlobalPrefix: an unanchored server with no configured prefix falls back', () => {
  assertEquals(resolveGlobalPrefix(undefined, undefined, 'api'), 'api')
})

Deno.test('resolveGlobalPrefix: an anchored server with no configured prefix gets none', () => {
  assertEquals(resolveGlobalPrefix('my-id', undefined, 'api'), undefined)
})

Deno.test('resolveGlobalPrefix: no fallback means no prefix, anchored or not', () => {
  assertEquals(resolveGlobalPrefix(undefined, undefined), undefined)
  assertEquals(resolveGlobalPrefix('my-id', undefined), undefined)
})
