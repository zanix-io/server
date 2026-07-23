import { assertEquals } from '@std/assert/assert-equals'
import { processScopedPayload } from 'utils/context.ts'

Deno.test('processScopedPayload: body accessor reads from the payload body by key', () => {
  const scoped = processScopedPayload({
    params: { id: '1' },
    search: { q: 'x' },
    body: { name: 'ismael' },
  } as never)

  assertEquals((scoped.body as (key: string) => unknown)('name'), 'ismael')
})
