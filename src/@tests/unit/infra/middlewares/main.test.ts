import { assert, assertEquals } from '@std/assert'
import {
  mainGuard,
  mainInterceptor,
  routerInterceptor,
} from 'modules/infra/middlewares/defaults/main.middlewares.ts'

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

Deno.test(
  'mainGuard: two guards each returning their own Set-Cookie both survive (no clobbering)',
  async () => {
    const context = { id: 'ctx-2' } as never

    const guardA = () => ({ headers: { 'Set-Cookie': 'population=abc; Path=/' } })
    const guardB = () => ({ headers: { 'Set-Cookie': 'lang=en; Path=/' } })

    const { headers } = await mainGuard(context, [guardA, guardB] as never)

    assert(headers instanceof Headers)
    assertEquals(headers.getSetCookie(), [
      'population=abc; Path=/',
      'lang=en; Path=/',
    ])
  },
)

Deno.test(
  'mainGuard: a second guard returning the SAME non-cookie header still overrides the first ' +
    '(last-guard-wins, e.g. a page-level @Guard(cspGuard(...)) overriding an app-wide policy)',
  async () => {
    const context = { id: 'ctx-2b' } as never

    const appWide = () => ({ headers: { 'Content-Security-Policy': "default-src 'self'" } })
    const pageLevel = () => ({ headers: { 'Content-Security-Policy': "default-src 'none'" } })

    const { headers } = await mainGuard(context, [appWide, pageLevel] as never)

    assert(headers instanceof Headers)
    assertEquals(headers.get('Content-Security-Policy'), "default-src 'none'")
  },
)

Deno.test(
  'mainInterceptor: multiple Set-Cookie headers from guards all reach the final Response',
  async () => {
    const context = {
      id: 'ctx-3',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
    } as never

    const headers = new Headers()
    headers.append('Set-Cookie', 'population=abc; Path=/')
    headers.append('Set-Cookie', 'lang=en; Path=/')

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => new Response('ok'),
      headers,
    })

    assertEquals((response as Response).headers.getSetCookie(), [
      'population=abc; Path=/',
      'lang=en; Path=/',
    ])
  },
)
