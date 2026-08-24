/**
 * Request/context setup and URL/query/header parsing — everything `@zanix/server` does between
 * receiving a `Request` and having a `HandlerContext` a route can be dispatched against.
 *
 * These are the costs EVERY request pays, on every route, before any application code runs, so
 * they set the floor for the whole runtime.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'

import { contextId, payloadAccessorDefinition } from 'utils/context.ts'
import { bodyPayloadProperty, getPrefix } from 'utils/routes.ts'
import { cookiesGuard } from 'middlewares/defaults/cookies.guard.ts'
import { asyncContext } from 'modules/infra/base/storage.ts'
import { searchParamsPropertyDescriptor } from '@zanix/helpers'

import {
  CATCHALL_PARAMS_MATCH_FIXTURE,
  COOKIE_HEADER,
  makeContext,
  makeRequest,
  ORIGIN,
  PARAMS_MATCH_FIXTURE,
  PAYLOAD_JSON,
} from '../fixtures.ts'
import { PAYLOAD_SIZES, type SizeLabel } from '../setup.ts'

const REQUEST_PATH = '/orgs/acme/teams/core/members/42?page=3&limit=50&sort=-createdAt&q=zanix'
const REQUEST_URL = `${ORIGIN}${REQUEST_PATH}`

/** Builds the request/context scenarios. A factory, not a module-level constant, so importing
 * this file has no side effects at all — the performance regression test shares the `deno test`
 * process with every other test file and must not mutate the global route registry at import
 * time. */
export function createContextScenarios(): Scenario[] {
  const cookieRequest = makeRequest('/any', { headers: { Cookie: COOKIE_HEADER } })
  const cookieContext = makeContext(cookieRequest)
  const guard = cookiesGuard()

  // Built ONCE, outside every measured region — see `makeRequest`'s own doc for why that matters
  // so much here. A `GET` request never has its body read, so reusing one across iterations is
  // both valid and closer to production than rebuilding it.
  const getRequest = makeRequest(REQUEST_PATH)

  const searchUrl = new URL(REQUEST_URL)
  const { match, params, rawPath } = PARAMS_MATCH_FIXTURE

  // Built and primed ONCE, outside the measured region — the cached-read scenario below must
  // measure only the cache-hit property lookup, never the object construction, `defineProperty`
  // call, or first-read case-preservation work `context:params:accessor` already measures on its
  // own. Reusing one already-primed payload across every iteration is what actually isolates that.
  const cachedParamsPayload = {} as Record<string, unknown>
  Object.defineProperty(
    cachedParamsPayload,
    'params',
    payloadAccessorDefinition(match, params, () => rawPath),
  )
  ;(cachedParamsPayload.params as Record<string, string>).memberId // Primes the cache once.

  const scenarios: Scenario[] = [
    {
      key: 'context:id',
      name: 'contextId() — per-request UUID',
      group: 'context-setup',
      baseline: true,
      run: () => contextId(),
    },
    {
      // The control for every scenario below that must build its own `Request` inside the measured
      // region (a `Request` body can only be read once, so body-parsing scenarios cannot reuse
      // one). Subtract this to read those numbers as pure `@zanix/server` cost.
      key: 'context:control:request-construct',
      name: 'control — new Request() construction only (no server code)',
      group: 'context-setup',
      run: () => makeRequest(REQUEST_PATH),
    },
    {
      // `new URL(req.url)` is literally `getMainHandler`'s first statement. It is a WHATWG/Deno
      // primitive rather than `@zanix/server` code, measured here only so the rest of the
      // pipeline's numbers can be read in proportion to it.
      key: 'context:control:url-parse',
      name: 'control — new URL(req.url) (runtime primitive)',
      group: 'context-setup',
      run: () => new URL(REQUEST_URL),
    },
    {
      key: 'context:prefix',
      name: 'getPrefix() — multiplexer path-prefix extraction',
      group: 'context-setup',
      run: () => getPrefix(searchUrl.pathname),
    },
    {
      key: 'context:search:lazy',
      name: 'lazy search accessor — define descriptor + first read',
      group: 'context-setup',
      run: () => {
        const payload = {} as Record<string, unknown>
        Object.defineProperty(
          payload,
          'search',
          searchParamsPropertyDescriptor(searchUrl.searchParams),
        )
        return (payload.search as Record<string, string>).page
      },
    },
    {
      // The realistic shape: `getMainHandler` builds this accessor's `getRawPath` thunk for any
      // route with at least one param, ordinary or catch-all. First-read cost here includes the
      // ONE case-preserved-path lookup this scenario's own `rawPath` stands in for (pre-built
      // here — the thunk itself is a trivial closure returning it; the router's real thunk instead
      // calls `cleanRoute(url.pathname, true)` per request, whose own cost is attributed
      // separately by the `context:control:url-parse`-adjacent scenarios in this suite, not
      // duplicated here).
      key: 'context:params:accessor',
      name: 'payloadAccessorDefinition() — 3 route params, case-preserved, first read',
      group: 'context-setup',
      run: () => {
        const payload = {} as Record<string, unknown>
        Object.defineProperty(
          payload,
          'params',
          payloadAccessorDefinition(match, params, () => rawPath),
        )
        return (payload.params as Record<string, string>).memberId
      },
    },
    {
      // The cached (second+) read — costs only a plain property lookup (`_computedParams` already
      // populated on `cachedParamsPayload`, primed once above, outside this measured region),
      // proving the "compute once" contract actually holds once real case-preservation work (the
      // scenario above) is involved, not just when it's a no-op.
      key: 'context:params:accessor:cached',
      name: 'payloadAccessorDefinition() — 3 route params, case-preserved, cached (second) read',
      group: 'context-setup',
      run: () => (cachedParamsPayload.params as Record<string, string>).memberId,
    },
    {
      // The catch-all (`:name*`) shape of the same mechanism, measured directly — a trailing
      // catch-all and an ordinary `:param` share the exact same case-preservation code path in
      // `payloadAccessorDefinition`, so this scenario's cost should track the one above closely.
      key: 'context:params:accessor:catchall',
      name: 'payloadAccessorDefinition() — catch-all param, case-preserved, first read',
      group: 'context-setup',
      run: () => {
        const payload = {} as Record<string, unknown>
        Object.defineProperty(
          payload,
          'params',
          payloadAccessorDefinition(
            CATCHALL_PARAMS_MATCH_FIXTURE.match,
            CATCHALL_PARAMS_MATCH_FIXTURE.params,
            () => CATCHALL_PARAMS_MATCH_FIXTURE.rawPath,
          ),
        )
        return (payload.params as Record<string, string>).path
      },
    },
    {
      key: 'context:cookies:guard',
      name: 'cookiesGuard() — parse + filter 5 cookies down to the X-Znx- ones',
      group: 'context-setup',
      run: () => guard(cookieContext as never),
    },
    {
      // The per-request cost of `enableALS` (see `GenericHandlerOptions.enableALS`) — one
      // `asyncContext.runWith` scope per request, the highest-concurrency use of AsyncLocalStorage
      // in this codebase.
      key: 'context:als:runWith',
      name: 'asyncContext.runWith() — one ALS scope per request',
      group: 'context-setup',
      run: () => asyncContext.runWith('bench-context-id', () => asyncContext.getId()),
    },
    {
      key: 'context:body:none',
      name: 'bodyPayloadProperty() — GET fast path (no body read at all)',
      group: 'body-parsing',
      baseline: true,
      run: () => bodyPayloadProperty(getRequest),
    },
    {
      // The floor for the three JSON body scenarios below, which — unlike every other scenario in
      // this suite — genuinely cannot hoist their `Request` out of the measured region.
      key: 'context:control:request-construct-body',
      name: 'control — new Request() with a medium JSON body (no server code)',
      group: 'body-parsing',
      run: () => makeRequest('/ingest', { method: 'POST', body: PAYLOAD_JSON.medium }),
    },
  ]

  // These DO construct their `Request` inside the measured region — a body can only be read once,
  // and `bodyPayloadProperty` swallows the second read into `undefined`, so a pooled/reused request
  // would silently turn the scenario into a measurement of nothing. The
  // `context:control:request-construct-body` scenario above is what makes that included cost
  // visible, and it is why the small/medium sizes are informational rather than gates.
  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    scenarios.push({
      key: `context:body:json:${size}`,
      // See `Scenario.skipDenoBench`: `Deno.bench` exhausts the V8 heap on the large size. The
      // regression gate still measures it, with its own sampler.
      skipDenoBench: size === 'large',
      name: `bodyPayloadProperty() — POST application/json (${size}, ${PAYLOAD_SIZES[size]} items)`,
      group: 'body-parsing',
      run: () =>
        bodyPayloadProperty(
          makeRequest('/ingest', { method: 'POST', body: PAYLOAD_JSON[size] }),
        ),
    })
  }

  return scenarios
}
