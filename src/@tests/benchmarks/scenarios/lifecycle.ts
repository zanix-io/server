/**
 * The full in-process request lifecycle — `Request` in, `Response` out, through the real handler
 * `getMainHandler` compiles: context construction, body parsing, route matching, guards, pipes,
 * handler execution, response serialization and scoped-context cleanup.
 *
 * These are the suite's headline numbers. Every other scenario in this directory exists to
 * ATTRIBUTE a movement here to a specific phase; on its own, a lifecycle number is the only one
 * that answers "how expensive is one request to this server". Nothing here touches a socket:
 * `getMainHandler` returns a plain `(Request) => Promise<Response>` function, so the whole
 * lifecycle runs as a direct call with no `Deno.serve`, no port and no kernel involvement — the
 * measurement is `@zanix/server`'s code and nothing else.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'
import type { HandlerBox } from 'typings/server.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { RouteDefinitionProps } from 'typings/router.ts'
import type { MiddlewareGuard, MiddlewareInterceptor, MiddlewarePipe } from 'typings/middlewares.ts'

import { multiplexer } from 'modules/webserver/helpers/handler.ts'

import {
  buildHandler,
  lastMixedRoute,
  lastParamRoutePath,
  makePayload,
  makeRequest,
  mixedMethodRouteDefinitions,
  paramRouteDefinitions,
  PAYLOAD_JSON,
} from '../fixtures.ts'
import { PAYLOAD_SIZES, ROUTE_TABLE_SIZES, type SizeLabel } from '../setup.ts'

type Params = Record<string, string>

const SMALL_PAYLOAD = makePayload('small')

/** Builds the lifecycle scenarios. See {@linkcode createContextScenarios} for why this is a
 * factory. */
export function createLifecycleScenarios(): Scenario[] {
  // --- One static route, one :param route, one catch-all route, all on the same handler ---------
  const basicHandler = buildHandler([
    { path: '/status', httpMethod: 'GET', handler: (() => SMALL_PAYLOAD) as never },
    {
      path: '/users/:id',
      httpMethod: 'GET',
      handler: ((ctx: HandlerContext) => ({ id: (ctx.payload.params as Params).id })) as never,
    },
    {
      path: '/assets/:path*',
      httpMethod: 'GET',
      handler: ((ctx: HandlerContext) => ({ path: (ctx.payload.params as Params).path })) as never,
    },
  ])

  // --- A route carrying a realistic amount of declared middleware ------------------------------
  const guards: MiddlewareGuard[] = [
    () => ({ headers: { 'X-Bench-Guard': '1' } }),
    () => ({}),
    () => ({ headers: { 'X-Bench-Trace': 'on' } }),
  ]
  const pipes: MiddlewarePipe[] = [
    (ctx) => {
      ctx.locals.a = 1
    },
    (ctx) => {
      ctx.locals.b = 2
    },
  ]
  const interceptors: MiddlewareInterceptor[] = [
    (_, response) => {
      response.headers.set('X-Bench-I1', '1')
      return response
    },
    (_, response) => response,
  ]

  const middlewareHandler = buildHandler([{
    path: '/orgs/:orgId/members',
    httpMethod: 'GET',
    handler: (() => SMALL_PAYLOAD) as never,
    guards,
    pipes,
    interceptors,
  }] as RouteDefinitionProps[])

  // --- POST + JSON body, at three payload sizes ------------------------------------------------
  const ingestHandler = buildHandler([{
    path: '/ingest',
    httpMethod: 'POST',
    handler: ((ctx: HandlerContext) => ({
      received: (ctx.payload.body as { total: number }).total,
    })) as never,
  }])

  // --- The same :param dispatch against three route-table sizes --------------------------------
  const tableHandlers = {} as Record<SizeLabel, ReturnType<typeof buildHandler>>
  for (const size of Object.keys(ROUTE_TABLE_SIZES) as SizeLabel[]) {
    tableHandlers[size] = buildHandler(
      paramRouteDefinitions(
        ROUTE_TABLE_SIZES[size],
        ((ctx: HandlerContext) => ({ id: (ctx.payload.params as Params).id })) as never,
      ),
    )
  }

  // --- Shared-port multiplexing -----------------------------------------------------------------
  const apiHandler = buildHandler([{
    path: '/api/users/:id',
    httpMethod: 'GET',
    handler: ((ctx: HandlerContext) => ({ id: (ctx.payload.params as Params).id })) as never,
  }])
  const box = { current: { api: apiHandler as never } } as HandlerBox
  const dispatch = multiplexer(box) as (
    req: Request,
    info: unknown,
  ) => Promise<Response> | Response

  // Every GET request below is built ONCE, outside the measured region. `new Request()` costs
  // 5–11 µs on the reference machine (almost entirely `new Headers()`) — comparable to or larger
  // than a whole dispatch — so building one per iteration would make these numbers a measurement of
  // Deno's `Headers`, not of `@zanix/server`. Reuse is also the production shape: `Deno.serve`
  // builds the `Request`, the framework never does. A GET body is never read, so a single instance
  // is safe to reuse indefinitely. See `makeRequest`'s own doc.
  const requests = {
    status: makeRequest('/status'),
    param: makeRequest('/users/42?verbose=1'),
    catchAll: makeRequest('/assets/img/icons/logo.svg'),
    notFound: makeRequest('/nope/at/all'),
    middleware: makeRequest('/orgs/acme/members'),
    multiplexed: makeRequest('/api/users/42'),
  }
  const tableRequests = {} as Record<SizeLabel, Request>
  for (const size of Object.keys(ROUTE_TABLE_SIZES) as SizeLabel[]) {
    tableRequests[size] = makeRequest(lastParamRoutePath(ROUTE_TABLE_SIZES[size]))
  }

  const scenarios: Scenario[] = [
    {
      // The floor for the whole runtime: an exact static hit never touches the linearly-scanned
      // `:param` table at all (`absolutePaths` is a plain hash lookup).
      key: 'lifecycle:absolute',
      name: 'GET /status — static route, small JSON response',
      group: 'lifecycle-dispatch',
      baseline: true,
      run: () => basicHandler(requests.status),
    },
    {
      key: 'lifecycle:param',
      name: 'GET /users/:id — :param route, params read in the handler',
      group: 'lifecycle-dispatch',
      run: () => basicHandler(requests.param),
    },
    {
      key: 'lifecycle:catchall',
      name: 'GET /assets/:path* — catch-all route, 3 nested segments',
      group: 'lifecycle-dispatch',
      run: () => basicHandler(requests.catchAll),
    },
    {
      key: 'lifecycle:notfound',
      name: 'GET /nope — unmatched path (NOT_FOUND throw path)',
      group: 'lifecycle-dispatch',
      run: () => basicHandler(requests.notFound).catch((e: unknown) => e),
    },
    {
      key: 'lifecycle:middleware3',
      name: 'GET /orgs/:orgId/members — 3 guards + 2 pipes + 2 interceptors',
      group: 'lifecycle-dispatch',
      run: () => middlewareHandler(requests.middleware),
    },
    {
      key: 'lifecycle:multiplexer',
      name: 'multiplexer() → GET /api/users/:id — shared-port prefix dispatch',
      group: 'lifecycle-dispatch',
      run: () => dispatch(requests.multiplexed, undefined),
    },
    {
      // The floor the JSON scenarios below sit on: those are the only lifecycle scenarios that
      // must still build their `Request` inside the measured region, because they consume its
      // body. Everything above reuses a pre-built request and does NOT pay this.
      key: 'lifecycle:control:request-construct-body',
      name: 'control — new Request() with a small JSON body (no server code)',
      group: 'lifecycle-json',
      run: () => makeRequest('/ingest', { method: 'POST', body: PAYLOAD_JSON.small }),
    },
  ]

  for (const size of Object.keys(ROUTE_TABLE_SIZES) as SizeLabel[]) {
    const count = ROUTE_TABLE_SIZES[size]
    scenarios.push({
      key: `lifecycle:param:table:${size}`,
      name: `GET the LAST of ${count} :param routes (${size} route table)`,
      group: 'lifecycle-route-table',
      baseline: size === 'small',
      run: () => tableHandlers[size](tableRequests[size]),
    })
  }

  // End to end against a mixed-method table — the shape a real REST application has. Paired with
  // the all-GET `lifecycle:param:table:*` scenarios above so a routing change must help here
  // without hurting those.
  {
    const count = ROUTE_TABLE_SIZES.large
    const { path, method } = lastMixedRoute(count)
    const mixedHandler = buildHandler(
      mixedMethodRouteDefinitions(
        count,
        ((ctx: HandlerContext) => ({ id: (ctx.payload.params as Params).id })) as never,
      ),
    )
    const mixedRequest = makeRequest(path, { method })
    scenarios.push({
      key: 'lifecycle:param:mixed:large',
      name: `${method} the LAST of ${count} routes across 5 methods (mixed-method table)`,
      group: 'lifecycle-route-table',
      skipDenoBench: true,
      run: () => mixedHandler(mixedRequest),
    })
  }

  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    scenarios.push({
      key: `lifecycle:json:${size}`,
      // See `Scenario.skipDenoBench`: `Deno.bench` exhausts the V8 heap on the large size. The
      // regression gate still measures it, with its own sampler.
      skipDenoBench: size === 'large',
      name: `POST /ingest — parse + handle + respond, ${size} JSON body (${
        PAYLOAD_SIZES[size]
      } items)`,
      group: 'lifecycle-json',
      baseline: size === 'small',
      run: () =>
        ingestHandler(makeRequest('/ingest', { method: 'POST', body: PAYLOAD_JSON[size] })),
    })
  }

  // Every scenario here except the synchronous `control:` one drives a whole `getMainHandler`
  // pipeline per iteration — the heaviest asynchronous object graph in this suite — and `Deno.bench`
  // in Deno 2.9.5 cannot run any of them: capped at a 1 GB heap it dies with `Fatal JavaScript out
  // of memory` on the very first one (a plain GET on a static route), and uncapped it grew to a 32
  // GB peak footprint and silently produced no row for most of the file. The same scenarios run
  // 100,000 iterations each through this suite's own sampler in ~164 MB. See
  // `Scenario.skipDenoBench` for the full reasoning: this costs the `deno bench` TABLE these rows,
  // not the suite its coverage — the regression gate measures, thresholds and reports every one of
  // them, and `deno task bench:baseline` prints them all as a table on demand.
  return scenarios.map((scenario) =>
    scenario.key.startsWith('lifecycle:control:') ? scenario : { ...scenario, skipDenoBench: true }
  )
}
