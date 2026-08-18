// deno-coverage-ignore-file

/**
 * Deterministic fixtures shared by every scenario in this suite.
 *
 * Everything here is synthetic and in-process: `Request` objects built from string literals, route
 * tables registered directly into `ProgramModule.routes`, payloads generated from a pure function
 * of their size. No network, no filesystem, no database, no clock- or randomness-dependent value
 * ever reaches a measured code path — so a change in a benchmark number can only come from
 * `@zanix/server`'s own code (or from the machine it runs on), never from an external service.
 *
 * @module
 */
import type { HandlerContext } from 'typings/context.ts'
import type { RouteDefinitionProps } from 'typings/router.ts'

import { contextId } from 'utils/context.ts'
import { pathToRegex } from 'utils/routes.ts'
import { getMainHandler } from 'modules/webserver/helpers/handler.ts'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import { searchParamsPropertyDescriptor } from '@zanix/helpers'
import ProgramModule from 'modules/program/mod.ts'

import { PAYLOAD_SIZES, type SizeLabel, withSilencedLogs } from './setup.ts'

/** The base origin every synthetic request in this suite is built against. */
export const ORIGIN = 'http://localhost:8000'

/** One row of a generated JSON payload — small, but not degenerate: mixed value types. */
export interface Item {
  id: number
  label: string
  score: number
  active: boolean
  tags: string[]
}

/** Pure, deterministic payload rows — identical bytes on every run and every machine. */
export function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    label: `item-${i}`,
    score: i % 7,
    active: i % 2 === 0,
    tags: [`tag-${i % 3}`, `tag-${i % 5}`],
  }))
}

/** The response/body object a size-sensitive JSON scenario serializes or parses. */
export function makePayload(size: SizeLabel): { ok: boolean; total: number; items: Item[] } {
  const total = PAYLOAD_SIZES[size]
  return { ok: true, total, items: makeItems(total) }
}

/**
 * Pre-serialized payloads, computed once at module load. Body-parsing scenarios must not pay for
 * `JSON.stringify` inside the measured region — they are measuring `bodyPayloadProperty`'s parse,
 * not this suite's own fixture construction.
 */
export const PAYLOAD_JSON: Record<SizeLabel, string> = {
  small: JSON.stringify(makePayload('small')),
  medium: JSON.stringify(makePayload('medium')),
  large: JSON.stringify(makePayload('large')),
}

/** Byte length of each pre-serialized payload — reported alongside baselines so a future reader
 * can tell whether a number moved because the code changed or because the fixture did. */
export const PAYLOAD_BYTES: Record<SizeLabel, number> = {
  small: new TextEncoder().encode(PAYLOAD_JSON.small).length,
  medium: new TextEncoder().encode(PAYLOAD_JSON.medium).length,
  large: new TextEncoder().encode(PAYLOAD_JSON.large).length,
}

/**
 * A realistic `Cookie` header: two framework-scoped (`X-Znx-`) cookies the `cookiesGuard` keeps,
 * plus three unrelated ones it must filter out — the filtering, not just the parsing, is the work
 * being measured.
 */
export const COOKIE_HEADER =
  'X-Znx-Session=s-abc123; X-Znx-Cookies-Accepted=true; theme=dark; consent=1; _ga=GA1.2.3.4'

/** A realistic set of request headers — enough to make header access non-degenerate. */
export const REQUEST_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'User-Agent': 'zanix-bench/1.0',
  'Cookie': COOKIE_HEADER,
  'X-Znx-Request-Id': 'req-0000',
}

/**
 * Builds a synthetic request. Deterministic: same arguments always produce identical bytes.
 *
 * **Constructing a `Request` is expensive — measured at roughly 5–11 µs on the reference machine,
 * almost all of it inside `new Headers()`.** That is one to two orders of magnitude MORE than most
 * of the operations this suite measures, so a scenario that builds its request inside the timed
 * region measures Deno's `Headers` implementation and almost nothing of `@zanix/server`. Every
 * scenario here therefore builds its request ONCE, outside the measured region, and reuses it —
 * which is also what actually happens in production, where `Deno.serve` hands the handler a
 * `Request` it built itself and `@zanix/server` never constructs one.
 *
 * The sole exception is a scenario that CONSUMES the body (`req.json()` can only run once per
 * `Request`, and a re-read silently returns `undefined` through `bodyPayloadProperty`'s own
 * `catch`, which would make the scenario measure nothing at all). Those scenarios build inside the
 * timed region, are paired with an explicit `control:` scenario measuring construction alone, and
 * are only eligible to become a regression gate where construction is a small fraction of the
 * total — see `src/@tests/performance/baseline.ts`.
 */
export function makeRequest(
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Request {
  const { method = 'GET', body, headers } = init
  return new Request(`${ORIGIN}${path}`, {
    method,
    body,
    headers: {
      ...REQUEST_HEADERS,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  })
}

/**
 * Builds a `HandlerContext` exactly the way `getMainHandler` builds one per request (same `id`,
 * `payload`, `req`, `url`, `locals` fields; same lazy `search` accessor) — so middleware-level
 * scenarios, which are handed a context rather than a `Request`, operate on the real shape the
 * production pipeline produces rather than an ad-hoc stub.
 *
 * `body` is assigned directly instead of going through `bodyPayloadProperty`: body PARSING is its
 * own separately-measured scenario, and folding it in here would make every middleware number
 * partly a JSON-parse number.
 */
export function makeContext(req: Request, body: unknown = undefined): HandlerContext {
  const url = new URL(req.url)
  const context = {
    id: contextId(),
    payload: {},
    req,
    url,
    locals: {},
  } as HandlerContext

  Object.assign(context.payload, { body })
  Object.defineProperty(
    context.payload,
    'search',
    searchParamsPropertyDescriptor(url.searchParams),
  )

  return context
}

/** The request handler shape `getMainHandler` returns, narrowed for direct in-process invocation. */
export type TestServerHandler = (req: Request) => Promise<Response>

/**
 * Registers `definitions` into the global route registry, compiles a dispatch table out of them
 * via the real `getMainHandler`, and then clears the registry again.
 *
 * The registry (`ProgramModule.routes`) is a process-wide singleton shared with every other test
 * file, so it is always left exactly as it was found. That is safe because `getMainHandler` reads
 * the registry ONCE, at construction time, and never again at request time (see its own doc) — the
 * returned handler keeps working against its own frozen table long after the registry is emptied.
 */
export function buildHandler(
  definitions: RouteDefinitionProps[],
  options: Parameters<typeof getMainHandler>[3] = {},
): TestServerHandler {
  return withSilencedLogs(() => {
    ProgramModule.routes.resetContainer()
    for (const definition of definitions) ProgramModule.routes.defineRoute('rest', definition)
    const handler = getMainHandler('rest', undefined, '', options)
    ProgramModule.routes.resetContainer()
    return handler as unknown as TestServerHandler
  })
}

/** Same registry discipline as {@linkcode buildHandler}, but returning `routeProcessor`'s raw
 * output — what the route-MATCHING scenarios need in order to call `findMatchingRoute` directly,
 * without a surrounding request lifecycle. */
export function buildRouteTables(
  definitions: RouteDefinitionProps[],
): ReturnType<typeof routeProcessor> {
  return withSilencedLogs(() => {
    ProgramModule.routes.resetContainer()
    for (const definition of definitions) ProgramModule.routes.defineRoute('rest', definition)
    const tables = routeProcessor('rest')
    ProgramModule.routes.resetContainer()
    return tables
  })
}

/**
 * `n` distinct `:param` route definitions, `/resource-0/:id` … `/resource-{n-1}/:id`.
 *
 * Route matching for `:param` routes is a LINEAR scan over the table (`findMatchingRoute` in
 * `utils/routes.ts`), so where in the table the matched route sits dominates the measurement.
 * Every scenario built on this fixture therefore matches the LAST route — the deterministic
 * worst case, and the one whose cost actually scales with table size. Matching the first route
 * would produce a number that looks identical at 5 and at 200 routes and would protect nothing.
 */
export function paramRouteDefinitions(n: number, handler: RouteDefinitionProps['handler']) {
  return Array.from({ length: n }, (_, i) => ({
    path: `/resource-${i}/:id`,
    httpMethod: 'GET' as const,
    handler,
  }))
}

/** The request path that matches the LAST route produced by {@linkcode paramRouteDefinitions}. */
export function lastParamRoutePath(n: number): string {
  return `/resource-${n - 1}/9876`
}

/** The HTTP methods {@linkcode mixedMethodRouteDefinitions} spreads its routes across — the ones a
 * REST application actually declares. */
export const MIXED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/**
 * `n` `:param` routes spread evenly across {@linkcode MIXED_METHODS}, which is what a real REST
 * application's route table looks like — unlike {@linkcode paramRouteDefinitions}, whose routes are
 * all `GET`.
 *
 * The distinction matters for measurement, not just realism: route matching scans a table linearly,
 * and a single-method table cannot show whether the scan is wasting work on routes whose method the
 * request never uses. Both shapes are measured, so a routing change has to prove it helps the mixed
 * table WITHOUT hurting the single-method one.
 */
export function mixedMethodRouteDefinitions(
  n: number,
  handler: RouteDefinitionProps['handler'],
): RouteDefinitionProps[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `/mixed-${i}/:id`,
    httpMethod: MIXED_METHODS[i % MIXED_METHODS.length],
    handler,
  }))
}

/** The request path and method that match the LAST route {@linkcode mixedMethodRouteDefinitions}
 * produces — the deterministic worst case, same reasoning as {@linkcode lastParamRoutePath}. */
export function lastMixedRoute(n: number): { path: string; method: string } {
  return {
    path: `/mixed-${n - 1}/9876`,
    method: MIXED_METHODS[(n - 1) % MIXED_METHODS.length],
  }
}

/** `n` distinct static (non-`:param`) route definitions — these land in the hash-keyed
 * `absolutePaths` table instead of the linearly-scanned one. */
export function absoluteRouteDefinitions(n: number, handler: RouteDefinitionProps['handler']) {
  return Array.from({ length: n }, (_, i) => ({
    path: `/static-${i}/resource`,
    httpMethod: 'GET' as const,
    handler,
  }))
}

/**
 * How many tail chunks {@linkcode makeSsrLikeResponse}'s stream produces after its first (shell)
 * chunk. High enough that "produce the whole body" and "produce only the shell" are separated by
 * far more than measurement noise — which is the entire point of a time-to-first-chunk scenario —
 * and low enough that the scenario stays fast.
 */
export const SSR_TAIL_CHUNKS = 64

const SHELL_BYTES = new TextEncoder().encode(
  '<!doctype html><html><head><title>bench</title></head><body><div id="app">',
)
const TAIL_BYTES = new TextEncoder().encode(
  `<section class="row">${'x'.repeat(512)}</section>`,
)

/**
 * A `Response` shaped like a streaming SSR body (`WebServerTypes`' own `'ssr'`, the one type
 * `routerInterceptor` routes through `gzipStreamingResponse`): a shell chunk available
 * immediately, followed by {@linkcode SSR_TAIL_CHUNKS} more chunks produced only when the consumer
 * pulls for them. A deterministic stand-in for a body whose tail is expensive to produce — no
 * timers, no network, and nothing outside this package involved.
 *
 * The returned `pulls()` counts how many source chunks were actually produced. That count is the
 * DETERMINISTIC signal a time-to-first-byte scenario rests on: a consumer that gets its first byte
 * after 1 pull is genuinely streaming, one that needs all {@linkcode SSR_TAIL_CHUNKS}` + 1` pulls
 * buffered the whole body first, and no timing measurement is needed to tell those two apart. See
 * `src/@tests/performance/validity.ts`, which asserts exactly that before any TTFB number is
 * trusted.
 */
export function makeSsrLikeResponse(): { response: Response; pulls: () => number } {
  let produced = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced === 0) controller.enqueue(SHELL_BYTES)
      else if (produced <= SSR_TAIL_CHUNKS) controller.enqueue(TAIL_BYTES)
      else return controller.close()
      produced++
    },
  })

  return {
    response: new Response(stream, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    pulls: () => produced,
  }
}

/** Reads a response's first body chunk and cancels the rest — the time-to-first-byte measurement
 * a streaming SSR response exists to make fast, and the one a buffering compressor destroys. */
export async function readFirstChunk(response: Response): Promise<Uint8Array | undefined> {
  const body = response.body
  if (!body) return undefined
  const reader = body.getReader()
  try {
    const { value } = await reader.read()
    return value
  } finally {
    await reader.cancel()
  }
}

/** A pre-built regex match + param-name list for the `payloadAccessorDefinition` scenario —
 * produced by the SAME `pathToRegex` the router uses, against a three-param route. */
export const PARAMS_MATCH_FIXTURE: { match: RegExpExecArray; params: string[] } = (() => {
  const regex = pathToRegex('/orgs/:orgId/teams/:teamId/members/:memberId/GET')
  const match = regex.exec('/orgs/acme/teams/core/members/42/GET') as RegExpExecArray
  return { match, params: ['orgId', 'teamId', 'memberId'] }
})()
