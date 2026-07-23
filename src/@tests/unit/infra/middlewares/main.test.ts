import { assertEquals } from '@std/assert'
import { routerInterceptor } from 'modules/infra/middlewares/defaults/main.middlewares.ts'

console.error = () => {}

Deno.test('routerInterceptor: catches handler errors and returns an error response', async () => {
  const context = {
    id: 'ctx-1',
    url: new URL('http://localhost/route'),
    req: new Request('http://localhost/route'),
  } as never

  const handler = () => {
    throw new Error('boom')
  }

  const response = await routerInterceptor(context, null as never, {
    interceptors: [],
    handler,
  })

  assertEquals((response as Response).status, 400)
})
