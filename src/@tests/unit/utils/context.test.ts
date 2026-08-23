import { assertEquals, assertMatch } from '@std/assert'
import { UUID_REGEX } from '@zanix/regex'
import { contextId, processScopedPayload } from 'utils/context.ts'

Deno.test('processScopedPayload: body accessor reads from the payload body by key', () => {
  const scoped = processScopedPayload({
    params: { id: '1' },
    search: { q: 'x' },
    body: { name: 'ismael' },
  } as never)

  assertEquals((scoped.body as (key: string) => unknown)('name'), 'ismael')
})

Deno.test('contextId should return a correct uuid', () => {
  assertMatch(contextId(), UUID_REGEX)
})
