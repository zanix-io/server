import { assert, assertEquals, assertExists } from '@std/assert'
import { HttpError, InternalError } from '@zanix/errors'
import { getMainHandler, multiplexer } from 'modules/webserver/helpers/handler.ts'
import { getHeadersFromError, getRequestFromError } from 'utils/errors/request-context.ts'
import Program from 'modules/program/mod.ts'
import {
  getGraphqlHandlerFactory,
  registerGraphqlHandlerFactory,
} from 'handlers/graphql/registry.ts'

type TestHandler = (req: Request) => Promise<Response>

console.info = () => {}
console.error = () => {}

Deno.test('multiplexer: dispatches to the handler matching the request prefix', async () => {
  const box = {
    current: {
      api: (() => new Response('api-response')) as never,
      admin: (() => new Response('admin-response')) as never,
    },
  }

  const dispatch = multiplexer(box) as (
    req: Request,
    info: unknown,
  ) => Promise<Response> | Response

  const response = await dispatch(
    new Request('http://localhost/api/users'),
    {} as never,
  )

  assertEquals(await (response as Response).text(), 'api-response')
})

// Runs before anything else in this file (or, transitively, in this test FILE's own module
// graph — `deno test` gives each test file its own isolated module instances, confirmed via a real
// repro) ever imports `handlers/graphql/handler.ts` — that's the only thing that populates
// `registry.ts`'s slot (see `registerGraphqlHandlerFactory`'s own doc), so this genuinely observes
// the "nothing registered yet" state, not an artifact of test ordering.
Deno.test(
  'getMainHandler: type "graphql" throws a clear InternalError, synchronously at call time (not ' +
    'from the returned handler), when nothing has registered a handler factory yet (no ' +
    '@zanix/server/graphql import anywhere in composition)',
  () => {
    assertEquals(getGraphqlHandlerFactory(), undefined)

    let thrown: unknown
    try {
      getMainHandler('graphql', undefined, '')
    } catch (error) {
      thrown = error
    }

    assertExists(thrown)
    assertEquals(thrown instanceof InternalError, true)
    assertEquals(
      (thrown as InternalError).message.includes('@zanix/server/graphql'),
      true,
    )
  },
)

Deno.test(
  'getMainHandler: type "graphql" defines the GraphQL route (via the registered factory) once ' +
    'one is registered — the same registration `handlers/graphql/handler.ts` performs as its own ' +
    'side effect',
  () => {
    registerGraphqlHandlerFactory(() => () => new Response('graphql-response'))

    // A non-empty `globalPrefix` — `defineRoute`'s raw `{ path, handler }` form (no decorated
    // `Target`, the escape hatch this branch uses) only stores the route when `path` is truthy;
    // `''` is what an anchored server would pass, never a realistic default for this call (see
    // `bootstrapServerType`'s own `defaultPrefix: 'graphql'`).
    getMainHandler('graphql', undefined, 'graphql')

    const routes = Program.routes.getRoutes('graphql')
    assertExists(routes)
    assertEquals(Object.keys(routes ?? {}).length, 1)

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: doesn't attach the request to a NOT_FOUND error by default",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const request = new Request('http://localhost/unknown')

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'NOT_FOUND')
    assertEquals(getRequestFromError(error), undefined)

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: attaches the request to a NOT_FOUND error when opted in via attachRequestToErrors',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      attachRequestToErrors: true,
    }) as unknown as TestHandler
    const request = new Request('http://localhost/unknown')

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'NOT_FOUND')
    assertExists(getRequestFromError(error))
    assertEquals(getRequestFromError(error), request)

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: attaches the request to a METHOD_NOT_ALLOWED error only when opted in',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const request = new Request('http://localhost/known', { method: 'POST' })

    const defaultHandler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const defaultError = await defaultHandler(request).catch((e: unknown) => e) as HttpError
    assertEquals(defaultError.status.code, 'METHOD_NOT_ALLOWED')
    assertEquals(getRequestFromError(defaultError), undefined)

    const optedInHandler = getMainHandler('rest', undefined, '', {
      attachRequestToErrors: true,
    }) as unknown as TestHandler
    const optedInError = await optedInHandler(request).catch((e: unknown) => e) as HttpError
    assertEquals(optedInError.status.code, 'METHOD_NOT_ALLOWED')
    assertEquals(getRequestFromError(optedInError), request)

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: attaches the request to a CORS-rejected error only when opted in ' +
    '(same uncaught path as route matching, not just NOT_FOUND/METHOD_NOT_ALLOWED)',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const request = new Request('http://localhost/known', {
      headers: { Origin: 'https://evil.example' },
    })

    const defaultHandler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['https://allowed.example'] },
    }) as unknown as TestHandler
    const defaultError = await defaultHandler(request).catch((e: unknown) => e) as HttpError
    assertEquals(defaultError.status.code, 'BAD_REQUEST')
    assertEquals(getRequestFromError(defaultError), undefined)

    const optedInHandler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['https://allowed.example'] },
      attachRequestToErrors: true,
    }) as unknown as TestHandler
    const optedInError = await optedInHandler(request).catch((e: unknown) => e) as HttpError
    assertEquals(optedInError.status.code, 'BAD_REQUEST')
    assertEquals(getRequestFromError(optedInError), request)

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a genuinely unmatched path (no route at all in this server) still stamps ' +
    "corsGuard's own headers onto the NOT_FOUND error it throws — a route never means a guard " +
    'chain runs (no `routerGuard`/`mainGuard` at all), so without this a cross-origin caller ' +
    "hitting a typo'd/removed endpoint sees a bare CORS failure masking the real 404 underneath.",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['http://localhost:20202'] },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/totally-unknown', {
      headers: { Origin: 'http://localhost:20202' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'NOT_FOUND')
    const headers = getHeadersFromError(error)
    assert(headers instanceof Headers)
    assertEquals(headers.get('Access-Control-Allow-Origin'), 'http://localhost:20202')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a path that DOES exist, just not for this method, also stamps CORS headers ' +
    'onto the resulting METHOD_NOT_ALLOWED — same fix, the 405 sibling of the NOT_FOUND case above.',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['http://localhost:20202'] },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/known', {
      method: 'POST',
      headers: { Origin: 'http://localhost:20202' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'METHOD_NOT_ALLOWED')
    const headers = getHeadersFromError(error)
    assert(headers instanceof Headers)
    assertEquals(headers.get('Access-Control-Allow-Origin'), 'http://localhost:20202')

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: an unmatched path from a REJECTED origin surfaces corsGuard's own BAD_REQUEST " +
    'instead of a plain NOT_FOUND — a more specific, more honest answer either way (the request ' +
    'would have been rejected by CORS regardless of whether the path were real), and never leaks ' +
    "whether the path exists to an origin that isn't allowed to ask.",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['https://allowed.example'] },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/totally-unknown', {
      headers: { Origin: 'https://evil.example' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'BAD_REQUEST')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: an unmatched path with NO cors configured at all is unaffected — plain ' +
    'NOT_FOUND, no headers stamped, same as before this fix (nothing to attach without a cors config)',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '') as unknown as TestHandler
    const request = new Request('http://localhost/totally-unknown')

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'NOT_FOUND')
    assertEquals(getHeadersFromError(error), undefined)

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a real preflight (OPTIONS + cors.preflight) against a path NOTHING registers ' +
    'still 404s, not silently answered as if the path existed — the unmatched-path CORS fix above ' +
    "deliberately never reads corsGuard's own preflight `response`, only reused for its `headers`, " +
    "so it can't reopen the exact bug the preflight branch's own scoping already prevents.",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: {
        origins: ['http://localhost:20202'],
        preflight: { optionsSuccessStatus: 204, maxAge: 600 },
      },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/totally-unknown', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:20202' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'NOT_FOUND')

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: corsGuard's OWN METHOD_NOT_ALLOWED (its own allowedMethods policy) is " +
    'deliberately swallowed for an unmatched path, not surfaced — only a REJECTED ORIGIN takes ' +
    'precedence over the route-level error; a method corsGuard itself disallows still falls ' +
    "through to this server's own real NOT_FOUND/METHOD_NOT_ALLOWED unchanged (out of scope for " +
    "this fix — see this repo's own discussion on corsGuard's internal METHOD_NOT_ALLOWED throw).",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['http://localhost:20202'], allowedMethods: ['GET'] },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/totally-unknown', {
      method: 'DELETE',
      headers: { Origin: 'http://localhost:20202' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    // Still the route-level NOT_FOUND (this server never registered '/totally-unknown' for
    // anything), never corsGuard's own METHOD_NOT_ALLOWED for its unrelated allowedMethods policy.
    assertEquals(error.status.code, 'NOT_FOUND')

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: a custom PIPE throwing still stamps corsGuard's own accumulated headers onto " +
    "the escaping error — mainProcess's own catch, distinct from mainGuard's (a guard throwing, " +
    'covered at the unit level in main.middlewares.test.ts) since a pipe runs AFTER routerGuard ' +
    'already resolved successfully. Without this, a cross-origin caller denied by a custom pipe ' +
    "(a common real shape — e.g. an app's own request-validation pipe) sees a bare CORS failure " +
    'masking the real denial underneath.',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
      pipes: [() => {
        throw new HttpError('BAD_REQUEST', { message: 'invalid payload' })
      }],
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['http://localhost:20202'] },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/known', {
      headers: { Origin: 'http://localhost:20202' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'BAD_REQUEST')
    const headers = getHeadersFromError(error)
    assert(headers instanceof Headers)
    assertEquals(headers.get('Access-Control-Allow-Origin'), 'http://localhost:20202')

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: on a MATCHED route (registered for the exact method requested), corsGuard's " +
    'OWN METHOD_NOT_ALLOWED (allowed origin, but this method is outside its OWN allowedMethods ' +
    "policy) still carries real CORS headers end to end — corsGuard's own fix (cors.guard.test.ts) " +
    "plus mainGuard's 'never clobber an already-stamped header' fix (main.middlewares.test.ts) " +
    'composed through the real getMainHandler pipeline (reaching mainGuard at all requires the ' +
    "ROUTE ITSELF to match this method — see the sibling 'unmatched path' tests above for the " +
    "DIFFERENT, pre-guard case where the route table itself doesn't have this method).",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      httpMethod: 'DELETE',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { origins: ['http://localhost:20202'], allowedMethods: ['GET'] },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/known', {
      method: 'DELETE',
      headers: { Origin: 'http://localhost:20202' },
    })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'METHOD_NOT_ALLOWED')
    const headers = getHeadersFromError(error)
    assert(headers instanceof Headers)
    assertEquals(headers.get('Access-Control-Allow-Origin'), 'http://localhost:20202')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: OPTIONS still 405s exactly like any other unsupported method when ' +
    'cors.preflight is not configured — the new preflight interception is opt-in, not automatic',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '') as unknown as TestHandler
    const request = new Request('http://localhost/known', { method: 'OPTIONS' })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'METHOD_NOT_ALLOWED')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a real preflight (OPTIONS + cors.preflight configured) against a path some ' +
    "other method registers is answered directly by corsGuard — never reaching the route's own " +
    'handler, and never 405ing',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => {
        throw new Error('a preflight must never reach the real route handler')
      },
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: {
        allowedHeaders: ['Content-Type', 'Authorization'],
        preflight: { optionsSuccessStatus: 204, maxAge: 600 },
      },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/known', { method: 'OPTIONS' })

    const response = await handler(request)
    assertEquals(response.status, 204)
    assertEquals(
      response.headers.get('access-control-allow-headers'),
      'Content-Type, Authorization',
    )
    assertEquals(response.headers.get('access-control-max-age'), '600')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a preflight (OPTIONS + cors.preflight configured) against a path NOTHING ' +
    'registers still 404s, same as for any other method — not silently answered as if the path ' +
    'existed',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/known',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler('rest', undefined, '', {
      cors: { preflight: { optionsSuccessStatus: 204, maxAge: 600 } },
    }) as unknown as TestHandler
    const request = new Request('http://localhost/unknown', { method: 'OPTIONS' })

    const error = await handler(request).catch((e: unknown) => e) as HttpError
    assertEquals(error.status.code, 'NOT_FOUND')

    Program.routes.resetContainer()
  },
)

// --- Trailing catch-all (`:name*`) — Task #82 -------------------------------------------------

/** Captures whatever `ctx.payload.params` reads as, for direct assertion — avoids any dependency
 * on how a handler's return value gets serialized into the final `Response` body. */
function paramsCapturingHandler(sink: { params?: unknown }, tag: string) {
  return (ctx: { payload: { params: unknown } }) => {
    sink.params = ctx.payload.params
    return tag
  }
}

Deno.test(
  'getMainHandler: exact/static wins over :param, which wins over catch-all — deterministic, ' +
    'independent of registration order (catch-all registered FIRST here, on purpose)',
  async () => {
    const catchAll: { params?: unknown } = {}
    const param: { params?: unknown } = {}

    // Registered in the OPPOSITE order precedence should produce — proves the ordering isn't
    // "whichever was declared first".
    Program.routes.defineRoute('rest', {
      path: '/files/:path*',
      handler: paramsCapturingHandler(catchAll, 'catch-all') as never,
    })
    Program.routes.defineRoute('rest', {
      path: '/files/:name',
      handler: paramsCapturingHandler(param, 'param') as never,
    })
    Program.routes.defineRoute('rest', {
      path: '/files/readme',
      handler: () => 'exact' as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler

    const exactResponse = await handler(
      new Request('http://localhost/files/readme'),
    )
    assertEquals(await exactResponse.text(), 'exact')

    const paramResponse = await handler(
      new Request('http://localhost/files/foo'),
    )
    assertEquals(await paramResponse.text(), 'param')
    assertEquals(param.params, { name: 'foo' })

    const catchAllResponse = await handler(
      new Request('http://localhost/files/foo/bar'),
    )
    assertEquals(await catchAllResponse.text(), 'catch-all')
    assertEquals(catchAll.params, { path: 'foo/bar' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a catch-all preserves the ORIGINAL request casing — /assets/Logo.svg → ' +
    "params.path === 'Logo.svg', while the route itself still matches case-insensitively",
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/ASSETS/:path*',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    // Neither the route's own declared casing nor the request's matches the other — matching
    // itself is still case-insensitive (unchanged), only the CAPTURED VALUE preserves the
    // request's own casing.
    const response = await handler(
      new Request('http://localhost/assets/Logo.svg'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { path: 'Logo.svg' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a catch-all captures multiple nested segments, case preserved throughout',
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/assets/:path*',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const response = await handler(
      new Request('http://localhost/assets/Icons/Products/Shoe.PNG'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { path: 'Icons/Products/Shoe.PNG' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: an ordinary :param (no catch-all involved) preserves the request's own " +
    'casing for its VALUE, while matching itself stays case-insensitive — /files/README → ' +
    "params.name === 'README', not 'readme'",
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/FILES/:name',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    // Neither the route's own declared casing nor the request's matches the other — matching
    // itself is still case-insensitive (unchanged), only the CAPTURED VALUE preserves the
    // request's own casing.
    const response = await handler(
      new Request('http://localhost/files/README'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { name: 'README' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: EVERY ordinary :param in a multi-param route independently preserves its own ' +
    'real casing, alongside its own case-preserved NAME',
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/triggers/:serviceId/:model',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    // Matches case-insensitively (the route was declared lowercase) — only the two extracted
    // VALUES, each with its own distinct real casing, must come back untouched.
    const response = await handler(
      new Request('http://localhost/Triggers/Billing/Invoice'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { serviceId: 'Billing', model: 'Invoice' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: a :param route whose handler never reads ctx.payload.params doesn't crash — " +
    'the case-preserved raw-path computation is a lazy thunk, tolerated even if never invoked',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/files/:name',
      handler: (() => 'ok') as never, // Never touches `ctx.payload.params`.
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const response = await handler(
      new Request('http://localhost/files/README'),
    )

    assertEquals(await response.text(), 'ok')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a route with zero params (an absolute/static route) never even reaches the ' +
    'case-preserved raw-path thunk construction — no params getter is defined at all for it',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/no-params-here',
      handler: ((ctx: { payload: Record<string, unknown> }) => {
        // `params` is never defined via `payloadAccessorDefinition` for an absolute route —
        // `getMainHandler` returns via the `absoluteRoute` early branch, before the case-preserved
        // raw-path thunk (or the params getter that would read it) is ever built.
        assertEquals(Object.prototype.hasOwnProperty.call(ctx.payload, 'params'), false)
        return 'ok'
      }) as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const response = await handler(
      new Request('http://localhost/no-params-here'),
    )

    assertEquals(await response.text(), 'ok')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a catch-all value is never URL-decoded — same as any ordinary :param today',
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/assets/:path*',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    // '%20' is a literal, still-encoded space — must survive undecoded.
    const response = await handler(
      new Request('http://localhost/assets/my%20logo.svg'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { path: 'my%20logo.svg' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: '%2F' in the request is never treated as a path separator by the router — " +
    'it stays a literal 3-character sequence inside whichever segment the URL parser already drew',
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/assets/:path*',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const response = await handler(
      new Request('http://localhost/assets/foo%2Fbar.svg'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { path: 'foo%2Fbar.svg' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a trailing slash on the request normalizes the same way it already does for ' +
    'any other route — no catch-all-specific handling needed',
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/assets/:path*',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const response = await handler(
      new Request('http://localhost/assets/logo.svg/'),
    )

    assertEquals(await response.text(), 'ok')
    assertEquals(captured.params, { path: 'logo.svg' })

    Program.routes.resetContainer()
  },
)

Deno.test(
  "getMainHandler: '../' traversal attempts never reach route matching as a literal string at " +
    "all — the WHATWG URL parser itself resolves '..' segments before `pathname` is even read, " +
    'an even stronger guarantee than anything the router would need to add on its own',
  async () => {
    const captured: { params?: unknown } = {}
    Program.routes.defineRoute('rest', {
      path: '/assets/:path*',
      handler: paramsCapturingHandler(captured, 'ok') as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    // `new URL(...).pathname` for this request is already `/etc/passwd` — `URL`'s own parser
    // resolves `..` segments during parsing, so this never even reaches the `/assets` prefix.
    const error = await handler(
      new Request('http://localhost/assets/../../etc/passwd'),
    ).catch((
      e: unknown,
    ) => e)

    assertEquals((error as HttpError).status.code, 'NOT_FOUND')
    assertEquals(captured.params, undefined) // the handler never ran at all

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: a bare prefix with no trailing segment at all does not match a catch-all route',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/assets/:path*',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const error = await handler(new Request('http://localhost/assets')).catch((
      e: unknown,
    ) => e)

    assertEquals((error as HttpError).status.code, 'NOT_FOUND')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: an invalid catch-all position (not the last segment) throws at REGISTRATION ' +
    'time, never the first time a request happens to reach it',
  () => {
    let threw = false
    try {
      Program.routes.defineRoute('rest', {
        path: '/:path*/foo',
        handler: () => 'ok' as never,
      })
    } catch {
      threw = true
    }
    assertEquals(threw, true)

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: backward compatibility — an ordinary route with no catch-all anywhere in ' +
    'the whole route table behaves exactly as before this feature existed',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/users/:id',
      handler: () => 'ok' as never,
    })

    const handler = getMainHandler(
      'rest',
      undefined,
      '',
    ) as unknown as TestHandler
    const response = await handler(new Request('http://localhost/users/42'))
    assertEquals(await response.text(), 'ok')

    const notFound = await handler(new Request('http://localhost/nope')).catch((
      e: unknown,
    ) => e)
    assertEquals((notFound as HttpError).status.code, 'NOT_FOUND')

    Program.routes.resetContainer()
  },
)

// --- HEAD → GET fallback -------------------------------------------------------------------------

Deno.test(
  'getMainHandler: HEAD on a Get()-only absolute route responds with the SAME status/headers as ' +
    'GET (including a computed Content-Length), but an empty body — no Head() registration exists',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/head-absolute',
      handler: () =>
        new Response(JSON.stringify({ hello: 'world' }), {
          headers: { 'content-type': 'application/json', 'x-custom': 'yes' },
        }) as never,
    })

    const handler = getMainHandler('rest', undefined, '') as unknown as TestHandler

    const getResponse = await handler(new Request('http://localhost/head-absolute'))
    const getBody = await getResponse.text()

    const headResponse = await handler(
      new Request('http://localhost/head-absolute', { method: 'HEAD' }),
    )
    const headBody = await headResponse.text()

    assertEquals(headResponse.status, getResponse.status)
    assertEquals(headBody, '')
    assertEquals(headResponse.headers.get('content-type'), 'application/json')
    assertEquals(headResponse.headers.get('x-custom'), 'yes')
    assertEquals(headResponse.headers.get('content-length'), String(getBody.length))

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: HEAD on a Get()-only :param (relative-bucket) route falls back to its GET ' +
    'entry the same way an absolute route does',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/head-param/:id',
      handler: paramsCapturingHandler({}, 'value') as never,
    })

    const handler = getMainHandler('rest', undefined, '') as unknown as TestHandler

    const headResponse = await handler(
      new Request('http://localhost/head-param/42', { method: 'HEAD' }),
    )

    assertEquals(headResponse.status, 200)
    assertEquals(await headResponse.text(), '')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: an explicit HEAD registration (the raw {path, handler} escape hatch) still ' +
    "wins outright over the generic GET fallback — it's tried first, never shadowed",
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/head-explicit',
      handler: () => new Response('get-body') as never,
    })
    Program.routes.defineRoute('rest', {
      path: '/head-explicit',
      handler: () => new Response(null, { headers: { 'x-explicit-head': 'yes' } }) as never,
      httpMethod: 'HEAD',
    })

    const handler = getMainHandler('rest', undefined, '') as unknown as TestHandler

    const headResponse = await handler(
      new Request('http://localhost/head-explicit', { method: 'HEAD' }),
    )

    assertEquals(headResponse.headers.get('x-explicit-head'), 'yes')

    Program.routes.resetContainer()
  },
)

Deno.test(
  'getMainHandler: HEAD on a route registered under a different, non-GET method only (no GET ' +
    'entry to fall back to) still 405s — the fallback never masks a real method mismatch',
  async () => {
    Program.routes.defineRoute('rest', {
      path: '/head-post-only',
      handler: () => 'ok' as never,
      httpMethod: 'POST',
    })

    const handler = getMainHandler('rest', undefined, '') as unknown as TestHandler

    const error = await handler(
      new Request('http://localhost/head-post-only', { method: 'HEAD' }),
    ).catch((e: unknown) => e)

    assertEquals((error as HttpError).status.code, 'METHOD_NOT_ALLOWED')

    Program.routes.resetContainer()
  },
)
