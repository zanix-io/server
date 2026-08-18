// deno-coverage-ignore-file

/**
 * The middleware pipeline — the three phases `mainProcess` (`modules/webserver/helpers/handler.ts`)
 * runs, in order, for every matched route:
 *
 * 1. `routerGuard` — the built-in CORS + cookies guards, plus whatever the route declares.
 * 2. `routerPipe` — `contextSettingPipe` (scoped-context registration), plus the route's pipes.
 * 3. `routerInterceptor` — handler execution, guard-header merge, the route's interceptors,
 *    scoped-context cleanup.
 *
 * Each phase is measured with NO custom middleware (the framework's own floor: what an application
 * that declares none still pays) and with THREE (how the cost grows per declared middleware) — the
 * two numbers together are what make a regression attributable to either the framework or the
 * per-middleware dispatch.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'
import type { MiddlewareGuard, MiddlewareInterceptor, MiddlewarePipe } from 'typings/middlewares.ts'
import type { HandlerFunction } from 'typings/router.ts'

import {
  routerGuard,
  routerInterceptor,
  routerPipe,
} from 'middlewares/defaults/main.middlewares.ts'
import { corsGuard } from 'middlewares/defaults/cors.guard.ts'
import { getResponseInterceptor } from 'middlewares/defaults/response.interceptor.ts'

import { makeContext, makePayload, makeRequest } from '../fixtures.ts'

/** Three plausible custom guards: one setting a header, one reading a header, one pure check. */
const CUSTOM_GUARDS: MiddlewareGuard[] = [
  () => ({ headers: { 'X-Bench-Guard': '1' } }),
  (ctx) => ctx.req.headers.get('X-Znx-Request-Id') ? {} : {},
  () => ({ headers: { 'X-Bench-Trace': 'on' } }),
]

/** Three plausible custom pipes — `mainPipe` runs them concurrently via `Promise.all`. */
const CUSTOM_PIPES: MiddlewarePipe[] = [
  (ctx) => {
    ctx.locals.a = 1
  },
  (ctx) => {
    ctx.locals.b = 2
  },
  // deno-lint-ignore require-await
  async (ctx) => {
    ctx.locals.c = 3
  },
]

/** Three plausible custom interceptors — `mainInterceptor` runs them SEQUENTIALLY, each handed
 * the previous one's `Response`. */
const CUSTOM_INTERCEPTORS: MiddlewareInterceptor[] = [
  (_, response) => {
    response.headers.set('X-Bench-I1', '1')
    return response
  },
  (_, response) => {
    response.headers.set('X-Bench-I2', '2')
    return response
  },
  (_, response) => response,
]

/** Builds the middleware scenarios. See {@linkcode createContextScenarios} for why this is a
 * factory.
 *
 * Every scenario reuses ONE context across iterations, deliberately. All three phases are
 * idempotent with respect to it (`routerGuard` injects then deletes its
 * interactors/providers/connectors fields; `contextSettingPipe` overwrites the same
 * `context:{id}` registry entry rather than appending; `routerInterceptor` ends by deleting that
 * entry again) — so repeated invocation neither accumulates state nor grows memory, and the
 * measurement stays about the phase rather than about context construction. Context construction
 * itself is measured separately, in `scenarios/context.ts`. */
export function createMiddlewareScenarios(): Scenario[] {
  const payload = makePayload('small')
  const handler = (() => payload) as HandlerFunction

  const guardContext = makeContext(makeRequest('/orgs/acme/members?page=2'))
  const pipeContext = makeContext(makeRequest('/orgs/acme/members?page=2'))
  const interceptorContext = makeContext(makeRequest('/orgs/acme/members?page=2'))
  const corsContext = makeContext(
    makeRequest('/orgs/acme/members', { headers: { Origin: 'https://app.example' } }),
  )
  const preflightContext = makeContext(
    makeRequest('/orgs/acme/members', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.example' },
    }),
  )

  const cors = corsGuard({}, 'rest')
  const corsPreflight = corsGuard(
    { preflight: { maxAge: 3600, optionsSuccessStatus: 204 } },
    'rest',
  )

  return [
    {
      key: 'middleware:guard:default',
      name: 'routerGuard() — built-in CORS + cookies guards only',
      group: 'middleware-guard',
      baseline: true,
      run: () => routerGuard(guardContext, { type: 'rest' }),
    },
    {
      key: 'middleware:guard:custom3',
      name: 'routerGuard() — built-ins + 3 custom guards',
      group: 'middleware-guard',
      run: () => routerGuard(guardContext, { type: 'rest', guards: CUSTOM_GUARDS }),
    },
    {
      key: 'middleware:cors:simple',
      name: 'corsGuard() — cross-origin GET, headers only',
      group: 'middleware-guard',
      run: () => cors(corsContext),
    },
    {
      key: 'middleware:cors:preflight',
      name: 'corsGuard() — OPTIONS preflight short-circuit Response',
      group: 'middleware-guard',
      run: () => corsPreflight(preflightContext),
    },
    {
      key: 'middleware:pipe:default',
      name: 'routerPipe() — contextSettingPipe only (no custom pipes)',
      group: 'middleware-pipe',
      baseline: true,
      run: () => routerPipe(pipeContext, []),
    },
    {
      key: 'middleware:pipe:custom3',
      name: 'routerPipe() — contextSettingPipe + 3 custom pipes',
      group: 'middleware-pipe',
      run: () => routerPipe(pipeContext, CUSTOM_PIPES),
    },
    {
      key: 'middleware:interceptor:default',
      name: 'routerInterceptor() — handler + header merge + cleanup (no custom interceptors)',
      group: 'middleware-interceptor',
      baseline: true,
      run: () =>
        routerInterceptor(interceptorContext, null as never, {
          handler,
          interceptors: [],
          type: 'rest',
        }),
    },
    {
      key: 'middleware:interceptor:custom3',
      name: 'routerInterceptor() — same, plus 3 sequential custom interceptors',
      group: 'middleware-interceptor',
      run: () =>
        routerInterceptor(interceptorContext, null as never, {
          handler,
          interceptors: CUSTOM_INTERCEPTORS,
          type: 'rest',
        }),
    },
    {
      key: 'middleware:response-interceptor',
      name: 'getResponseInterceptor() — handler result → Response (small JSON)',
      group: 'middleware-interceptor',
      run: () => getResponseInterceptor(interceptorContext, null as never, handler),
    },
  ]
}
