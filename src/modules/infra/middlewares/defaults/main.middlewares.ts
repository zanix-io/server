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
 * Guards that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const mainGuard = async (
  context: HandlerContext,
  guards: MiddlewareGuard[],
) => {
  // A plain `Record<string, string>` accumulator collapses ALL same-name headers to just the last
  // guard's value — correct and deliberately relied on for a single-value header (a page-level
  // `@Guard(cspGuard(...))` OVERRIDING an app-wide `defineMiddleware([cspGuard(...)])` policy, see
  // `define-middleware.test.tsx`), but wrong for `Set-Cookie`: HTTP allows repeated `Set-Cookie`
  // headers, and two independent guards (a population-cookie guard, a lang-cookie guard) each
  // setting their own must BOTH survive, not have the second silently erase the first. So
  // `Set-Cookie` accumulates via `Headers.append` (spec-excluded from header-list combining, so
  // multiple values stay separate instead of comma-joining); every other header keeps the
  // existing override semantics via `Headers.set`.
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
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (key.toLowerCase() === 'set-cookie') {
        baseHeaders.append(key, value)
      } else {
        baseHeaders.set(key, value)
      }
    }
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

  let response = await getResponseInterceptor(context, null as never, handler)

  for (const [key, value] of headers ?? []) {
    response.headers.append(key, value)
  }

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
