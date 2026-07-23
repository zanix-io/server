import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { bodyPayloadProperty } from 'utils/routes.ts'

Deno.test('bodyPayloadProperty: parses urlencoded form bodies', async () => {
  const req = new Request('http://localhost/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'name=ismael',
  })

  const body = await bodyPayloadProperty(req)

  assert(body instanceof FormData)
  assertEquals((body as FormData).get('name'), 'ismael')
})
