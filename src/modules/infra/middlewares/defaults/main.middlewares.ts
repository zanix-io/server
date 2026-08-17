import type {
  CorsOptions,
  MiddlewareGuard,
  MiddlewareInterceptor,
  MiddlewarePipe,
} from 'typings/middlewares.ts'
import type { HandlerFunction } from 'typings/router.ts'
import type { GzipOptions } from 'typings/general.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HandlerContext } from 'typings/context.ts'

import { getConnectors, getInteractors, getProviders } from 'modules/program/public.ts'
import { httpErrorResponse, logAppError } from 'utils/errors/helper.ts'
import { getResponseInterceptor } from './response.interceptor.ts'
import { cleanUpPipe, contextSettingPipe } from './context.pipe.ts'
import { gzipResponseFromResponse, gzipStreamingResponse } from 'utils/gzip.ts'
import { cookiesGuard } from './cookies.guard.ts'
import { corsGuard } from './cors.guard.ts'

/**
 * `ctx.locals` key {@linkcode mainInterceptor} stashes the fully-accumulated guard headers under,
 * right before invoking the handler — same "guard state handed to a later stage via `ctx.locals`"
 * pattern `protocol-version.ts`'s own `PROTOCOL_VERSION_LOCALS_KEY` already establishes, applied
 * here in the other temporal direction (guard state read by the HANDLER itself, not by a later
 * interceptor).
 *
 * This exists because {@linkcode mergeHeaders}'s own `overwrite: false` rule in `mainInterceptor`
 * can only ever distinguish two states for a given header — "the handler's response already has
 * it" vs. "it doesn't" — which isn't enough for a handler whose OWN zero-config default would
 * otherwise be indistinguishable from a deliberate choice (e.g. `@zanix/space`'s
 * `SpacePageController`, whose built-in nonce-based CSP default used to always end up "already
 * set" by the time this merge ran, silently preventing a guard-registered `cspGuard()` from ever
 * acting as the app-wide default it was meant to be — see `@zanix/space`'s own CHANGELOG). Reading
 * `ctx.locals[GUARD_HEADERS_LOCALS_KEY]` lets such a handler check what a guard already decided
 * BEFORE building its own response, so it can correctly implement its own multi-tier precedence
 * (e.g. "my own explicit config > a guard's app-wide default > my own zero-config default") instead
 * of relying solely on this generic, two-state merge.
 */
export const GUARD_HEADERS_LOCALS_KEY = 'guardHeaders'

/**
 * `ctx.locals` key a handler may set — the OTHER direction from {@linkcode GUARD_HEADERS_LOCALS_KEY}
 * — to a `Set<string>` of lowercased header names {@linkcode mainInterceptor} must never fill in
 * from a guard for THIS response, no matter what. Read once, right after the handler returns, then
 * deleted — same temporary, stage-scoped `ctx.locals` discipline every other key here follows.
 *
 * Exists for the one case `GUARD_HEADERS_LOCALS_KEY` alone can't express: a handler that explicitly
 * decided "no value for this header at all, not mine, not the guard's" (e.g. `@zanix/space`'s own
 * `Page({ headers: { csp: false } })`) can't communicate that by simply not setting the header
 * itself — an absent header is EXACTLY what `mainInterceptor`'s own merge already reads as "please
 * fill this from the guard," the opposite of what's needed here. Deliberately generic — a plain set
 * of header names, no CSP or `@zanix/space`-specific concept anywhere in this package — so any
 * handler for any header can use it the same way.
 */
export const GUARD_BLOCKED_HEADERS_LOCALS_KEY = 'guardBlockedHeaders'

/**
 * Merges `source`'s header entries onto `target`, in place — the one shared rule both
 * {@linkcode mainGuard} (merging multiple guards' headers together, as it goes) and
 * {@linkcode mainInterceptor} (merging the fully-accumulated guard headers onto a handler's
 * already-built response) need, kept in exactly one place so the two can never silently drift
 * apart from each other.
 *
 * **`Set-Cookie` always accumulates, regardless of `overwrite`.** HTTP allows repeated `Set-Cookie`
 * headers by design (unlike every other header, which is a single value) — the Fetch spec excludes
 * it from `Headers`' own header-list combining rule, so `.append()` on it keeps multiple entries
 * genuinely separate instead of comma-joining them. This is the one header where "two sources both
 * set it" has to mean "both survive" (e.g. one guard setting a population cookie, another setting a
 * language cookie), never "one wins."
 *
 * **Every other header is a single value, so two sources setting it can only ever mean "one wins" —
 * `overwrite` decides which.** `.append()`ing a second value onto an already-set single-value header
 * doesn't combine into something meaningful: `Headers` just comma-joins the two strings into one
 * syntactically corrupted result (confirmed empirically — most visibly broken for
 * `Content-Security-Policy`, which separates directives with `;`, never `,`; a comma-joined CSP
 * isn't "enforce both policies," it's a value no browser interprets correctly at all). So this
 * function never appends for anything but `Set-Cookie`: it either replaces (`overwrite: true`) or
 * skips entirely when `target` already has that key (`overwrite: false`) — there is no third option
 * that stays safe for a single-value header.
 *
 * - **`overwrite: true` — last source wins.** Used by `mainGuard`, which calls this once per guard,
 *   accumulating into the same `Headers` instance across the whole guard chain: a later guard (e.g.
 *   a page-level `@Guard(cspGuard(...))`, which runs after every global
 *   `defineMiddleware`-registered guard) is meant to override an earlier one's same-name header —
 *   see `define-middleware.test.tsx`'s own `StricterCspPage` fixture (in `@zanix/space`) for the
 *   real scenario this protects.
 * - **`overwrite: false` — existing value wins, source only fills gaps.** Used by `mainInterceptor`,
 *   which calls this once, merging the fully-accumulated guard headers onto a response the handler
 *   has already fully built (including its own headers — e.g. `@zanix/space`'s own per-page CSP,
 *   applied directly inside its handler, never through this guard pipeline at all). The handler's
 *   own value is always the final word — more specific, and computed after every guard already ran
 *   — so a guard's value only ever supplies the base/default for whatever the handler didn't already
 *   set itself. See `@zanix/space`'s own CHANGELOG for the real scenario this fixes: a global
 *   `cspGuard()` acting as an app-wide base policy that a specific page can still override with its
 *   own, more specific one.
 */
function mergeHeaders(
  target: Headers,
  source: Iterable<[string, string]>,
  { overwrite }: { overwrite: boolean },
): void {
  for (const [key, value] of source) {
    if (key.toLowerCase() === 'set-cookie') {
      target.append(key, value)
      continue
    }
    if (!overwrite && target.has(key)) continue
    target.set(key, value)
  }
}

/**
 * Guards that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const mainGuard = async (
  context: HandlerContext,
  guards: MiddlewareGuard[],
) => {
  // Accumulates every guard's own headers as it goes — see `mergeHeaders`'s own doc for the exact
  // per-header merge rule (`overwrite: true` here: a later guard's same-name header wins).
  const baseHeaders = new Headers()

  // Avoid destructuring because guards may mutate the context at runtime

  // Runtime errors are retrieved with `verbose` disabled. In HTTP applications,
  // exceptions are captured by the framework's middleware and translated into
  // the corresponding HTTP response. Server-side logging is controlled by the
  // `verbose` option: `true` or `undefined` enables error logging, while `false`
  // disables it.
  Object.assign(context, {
    interactors: getInteractors(context.id),
    providers: getProviders(context.id),
    connectors: getConnectors(context.id),
  })

  for await (const guard of guards) {
    const { response, headers } = await guard(context as never)
    mergeHeaders(baseHeaders, Object.entries(headers ?? {}), { overwrite: true })
    if (response) {
      return { response }
    }
  }

  // Removing context data intended for guards
  delete context['interactors' as never]
  delete context['providers' as never]
  delete context['connectors' as never]

  return { headers: baseHeaders }
}

/**
 * Pipes that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const mainPipe: MiddlewarePipe = async (
  context,
  pipes: MiddlewarePipe[],
) => {
  await Promise.all(pipes.map((pipe) => pipe(context)))
}

/**
 * Interceptors that are executed across all types of HTTP web servers.
 * Ensures the execution of current middleware for each route.
 */
export const mainInterceptor: MiddlewareInterceptor = async (
  context,
  _,
  options: {
    handler: HandlerFunction
    interceptors: MiddlewareInterceptor[]
    headers?: Headers
  },
) => {
  const { handler, interceptors, headers } = options

  // Exposes the fully-accumulated guard headers to the handler itself — see
  // `GUARD_HEADERS_LOCALS_KEY`'s own doc for why. Cleaned up right after, same "temporary,
  // stage-scoped context field" discipline `mainGuard` already applies to its own
  // interactors/providers/connectors injection. `locals` itself is defensive (`??=`), not assumed
  // — a real request's own context always has it set upstream, but a minimal test fixture calling
  // this function directly may not.
  context.locals ??= {}
  context.locals[GUARD_HEADERS_LOCALS_KEY] = headers
  let response = await getResponseInterceptor(context, null as never, handler)
  delete context.locals[GUARD_HEADERS_LOCALS_KEY]

  // Reads back whichever headers the handler explicitly vetoed — see
  // `GUARD_BLOCKED_HEADERS_LOCALS_KEY`'s own doc for why a merely-absent header isn't enough to
  // express this. Filtered out of the guard's own contribution below, before the merge even sees
  // them — never partially applied, never a value that has to be stripped back out afterward.
  const blocked = context.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY] as Set<string> | undefined
  delete context.locals[GUARD_BLOCKED_HEADERS_LOCALS_KEY]
  const mergeableHeaders = blocked
    ? [...(headers ?? [])].filter(([key]) => !blocked.has(key.toLowerCase()))
    : headers ?? []

  // Merges the fully-accumulated guard headers onto the handler's already-built response — see
  // `mergeHeaders`'s own doc for the exact per-header merge rule (`overwrite: false` here: the
  // handler's own value, if it set this header itself, is always the final word).
  mergeHeaders(response.headers, mergeableHeaders, { overwrite: false })

  for await (const interceptor of interceptors) {
    response = await interceptor(context, response) // execute interceptors secuentially
  }

  return response
}

/**
 * Main Guard that must be executed across all routes of HTTP web servers.
 */
export const routerGuard = (context: HandlerContext, options: {
  type: WebServerTypes
  cors?: CorsOptions
  guards?: MiddlewareGuard[]
}) => {
  const { type, cors, guards = [] } = options

  const baseCorsGuard = corsGuard(cors, type)
  const znxCookiesGuard = cookiesGuard()
  return mainGuard(context, [baseCorsGuard, znxCookiesGuard, ...guards])
}

/**
 * Main Pipe that must be executed across all routes of HTTP web servers.
 */
export const routerPipe: MiddlewarePipe = async (
  context,
  pipes: MiddlewarePipe[],
) => {
  contextSettingPipe(context)
  await mainPipe(context, pipes)
}

/**
 * Main Interceptor that must be executed across all routes of HTTP web servers.
 *
 * `type` decides WHICH compressor a gzip-eligible response goes through, not just whether one
 * runs: `'ssr'` responses are piped through {@linkcode gzipStreamingResponse} (the response body
 * stays a live stream throughout — required so a streaming SSR render keeps sending bytes as it
 * renders, not only after it fully finishes). Every other type keeps
 * {@linkcode gzipResponseFromResponse}'s byte-length-aware buffering, which is harmless there
 * (those bodies are already fully materialized in memory by this point) and gives them the
 * `threshold` check streaming bodies can't have (their total size isn't known upfront).
 */
export const routerInterceptor: MiddlewareInterceptor = async (
  context,
  _,
  options: {
    gzip?: GzipOptions
    headers?: Headers
    interceptors: MiddlewareInterceptor[]
    handler: HandlerFunction
    type?: WebServerTypes
  },
) => {
  const { gzip, headers, interceptors, handler, type } = options

  try {
    const acceptsGzip = gzip !== false &&
      context.req.headers.get('accept-encoding')?.includes('gzip')

    const response = await mainInterceptor(context, null as never, {
      handler,
      interceptors,
      headers,
    })

    await cleanUpPipe(context)

    if (!acceptsGzip) return response
    return type === 'ssr'
      ? gzipStreamingResponse(response)
      : gzipResponseFromResponse(response, gzip)
  } catch (e) {
    await logAppError(e, {
      message: `An error occurred on route '${context.url.pathname}'`,
      meta: { route: context.url.pathname },
      contextId: context.id,
      code: 'ROUTE_ERROR',
    })

    return httpErrorResponse(e, { contextId: context.id })
  }
}
