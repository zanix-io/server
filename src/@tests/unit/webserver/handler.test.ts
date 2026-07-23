import { assertEquals } from '@std/assert/assert-equals'
import { multiplexer } from 'modules/webserver/helpers/handler.ts'

Deno.test('multiplexer: dispatches to the handler matching the request prefix', async () => {
  const handlers = {
    api: (() => new Response('api-response')) as never,
    admin: (() => new Response('admin-response')) as never,
  }

  const dispatch = multiplexer(handlers) as (
    req: Request,
    info: unknown,
  ) => Promise<Response> | Response

  const response = await dispatch(new Request('http://localhost/api/users'), {} as never)

  assertEquals(await (response as Response).text(), 'api-response')
})
