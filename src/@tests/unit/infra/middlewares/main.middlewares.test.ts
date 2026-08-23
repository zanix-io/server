import { assert, assertEquals } from '@std/assert'
import {
  GUARD_BLOCKED_HEADERS_LOCALS_KEY,
  GUARD_HEADERS_LOCALS_KEY,
  mainGuard,
  mainInterceptor,
  routerInterceptor,
} from 'modules/infra/middlewares/defaults/main.middlewares.ts'

console.error = () => {}

Deno.test('routerInterceptor: no status on the error defaults the response to 500', async () => {
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

  // A plain `Error` with no `.status` defaults to 500, not 400 — it's far more likely an
  // unhandled server-side fault than a genuine client mistake (a real client error is normally
  // thrown as `HttpError` with its own explicit 4xx status in the first place).
  assertEquals((response as Response).status, 500)
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

Deno.test(
  "mainInterceptor: a guard's CSP applies as the base/default when the handler's own response " +
    'set none — same as before this fix',
  async () => {
    const context = {
      id: 'ctx-4',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
    } as never

    const headers = new Headers()
    headers.set('Content-Security-Policy', "default-src 'self'")

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => new Response('ok'),
      headers,
    })

    assertEquals(
      (response as Response).headers.get('Content-Security-Policy'),
      "default-src 'self'",
    )
  },
)

Deno.test(
  "mainInterceptor: the handler's own CSP applies as-is when no guard sets one — same as before " +
    'this fix',
  async () => {
    const context = {
      id: 'ctx-5',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
    } as never

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () =>
        new Response('ok', {
          headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'nonce-abc'" },
        }),
      headers: new Headers(),
    })

    assertEquals(
      (response as Response).headers.get('Content-Security-Policy'),
      "default-src 'self'; script-src 'nonce-abc'",
    )
  },
)

Deno.test(
  "mainInterceptor: the handler's own CSP WINS over a guard's own CSP for the same response " +
    "(never comma-joined) — the handler's value is the more specific, final word; the guard's is " +
    'simply dropped rather than combined into it',
  async () => {
    const context = {
      id: 'ctx-6',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
    } as never

    const headers = new Headers()
    headers.set('Content-Security-Policy', "default-src 'self'") // the "global"/base guard policy

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () =>
        new Response('ok', {
          // the page's own, more specific policy
          headers: { 'Content-Security-Policy': "default-src 'none'" },
        }),
      headers,
    })

    const csp = (response as Response).headers.get('Content-Security-Policy')
    assertEquals(csp, "default-src 'none'")
    assert(!csp?.includes(','), `CSP must never be comma-joined, got: ${csp}`)
  },
)

Deno.test(
  'mainInterceptor: the same handler-wins rule applies to any header, not just CSP — a non-CSP ' +
    "header already on the handler's response is left untouched, the guard's own value for the " +
    'same key is simply dropped',
  async () => {
    const context = {
      id: 'ctx-7',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
    } as never

    const headers = new Headers()
    headers.set('X-Custom-Header', 'from-guard')

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => new Response('ok', { headers: { 'X-Custom-Header': 'from-handler' } }),
      headers,
    })

    assertEquals(
      (response as Response).headers.get('X-Custom-Header'),
      'from-handler',
    )
  },
)

Deno.test(
  'mainInterceptor: the handler can read the accumulated guard headers via ' +
    'ctx.locals[GUARD_HEADERS_LOCALS_KEY] — the SAME Headers instance passed in — and the key is ' +
    'deleted again once the handler returns',
  async () => {
    // deno-lint-ignore no-explicit-any
    const context: any = {
      id: 'ctx-8',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
      locals: {},
    }

    const guardHeaders = new Headers()
    guardHeaders.set('Content-Security-Policy', "default-src 'self'")

    let seenDuringHandler: Headers | undefined
    await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => {
        seenDuringHandler = context.locals[GUARD_HEADERS_LOCALS_KEY]
        return new Response('ok')
      },
      headers: guardHeaders,
    })

    assertEquals(seenDuringHandler, guardHeaders)
    assertEquals(context.locals[GUARD_HEADERS_LOCALS_KEY], undefined)
  },
)

Deno.test(
  'mainInterceptor: defensively initializes context.locals when a minimal context omits it',
  async () => {
    const context = {
      id: 'ctx-9',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
    } as never

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => new Response('ok'),
      headers: new Headers(),
    })

    assertEquals((response as Response).status, 200)
  },
)

Deno.test(
  'mainInterceptor: a header the handler lists in ctx.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY] ' +
    'never reaches the final Response — genuinely absent, not an empty value',
  async () => {
    // deno-lint-ignore no-explicit-any
    const context: any = {
      id: 'ctx-10',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
      locals: {},
    }

    const guardHeaders = new Headers()
    guardHeaders.set('Content-Security-Policy', "default-src 'self'")

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => {
        context.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY] = new Set(['content-security-policy'])
        return new Response('ok')
      },
      headers: guardHeaders,
    })

    assertEquals((response as Response).headers.get('Content-Security-Policy'), null)
    assertEquals(context.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY], undefined)
  },
)

Deno.test(
  'mainInterceptor: blocking one guard header never affects any other guard header — the rest ' +
    'still merge in normally',
  async () => {
    // deno-lint-ignore no-explicit-any
    const context: any = {
      id: 'ctx-11',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
      locals: {},
    }

    const guardHeaders = new Headers()
    guardHeaders.set('Content-Security-Policy', "default-src 'self'")
    guardHeaders.set('X-Frame-Options', 'SAMEORIGIN')

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => {
        context.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY] = new Set(['content-security-policy'])
        return new Response('ok')
      },
      headers: guardHeaders,
    })

    assertEquals((response as Response).headers.get('Content-Security-Policy'), null)
    assertEquals((response as Response).headers.get('X-Frame-Options'), 'SAMEORIGIN')
  },
)

Deno.test(
  'mainInterceptor: blocking a header has no effect on Set-Cookie, which keeps accumulating via ' +
    '.append() exactly as before',
  async () => {
    // deno-lint-ignore no-explicit-any
    const context: any = {
      id: 'ctx-12',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
      locals: {},
    }

    const guardHeaders = new Headers()
    guardHeaders.append('Set-Cookie', 'population=abc; Path=/')
    guardHeaders.append('Set-Cookie', 'lang=en; Path=/')
    guardHeaders.set('Content-Security-Policy', "default-src 'self'")

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => {
        context.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY] = new Set(['content-security-policy'])
        return new Response('ok')
      },
      headers: guardHeaders,
    })

    assertEquals((response as Response).headers.getSetCookie(), [
      'population=abc; Path=/',
      'lang=en; Path=/',
    ])
    assertEquals((response as Response).headers.get('Content-Security-Policy'), null)
  },
)

Deno.test(
  'mainInterceptor: with no GUARD_BLOCKED_HEADERS_LOCALS_KEY set at all, every guard header ' +
    'merges in normally — same as before this mechanism existed',
  async () => {
    const context = {
      id: 'ctx-13',
      url: new URL('http://localhost/route'),
      req: new Request('http://localhost/route'),
      locals: {},
    } as never

    const guardHeaders = new Headers()
    guardHeaders.set('Content-Security-Policy', "default-src 'self'")

    const response = await mainInterceptor(context, null as never, {
      interceptors: [],
      handler: () => new Response('ok'),
      headers: guardHeaders,
    })

    assertEquals(
      (response as Response).headers.get('Content-Security-Policy'),
      "default-src 'self'",
    )
  },
)
