import type {
  CorsOptions,
  MiddlewareGuard,
  MiddlewareInterceptor,
  MiddlewarePipe,
} from 'typings/middlewares.ts'
import type { HandlerFunction, HttpMethods } from 'typings/router.ts'
import type { GzipOptions } from 'typings/general.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HttpError } from '@zanix/errors'

import { getResponseInterceptor } from './response.interceptor.ts'
import { errorResponses } from 'webserver/helpers/errors.ts'
import { cleanUpPipe, contextSettingPipe } from './context.pipe.ts'
import { validateMethodsPipe } from './methods.pipe.ts'
import logger from '@zanix/logger'
import { gzipResponseFromResponse } from 'utils/gzip.ts'
import { corsGuard } from './cors.guard.ts'

/**
 * Guards that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const mainGuard: MiddlewareGuard = async (context, guards: MiddlewareGuard[]) => {
  let baseHeaders: Record<string, string> = {}
  for await (const guard of guards) {
    const { response, headers } = await guard(context)
    baseHeaders = { ...baseHeaders, ...headers }
    if (response) {
      return { response }
    }
  }
  return { headers: baseHeaders }
}

/**
 * Pipes that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const mainPipe: MiddlewarePipe = async (context, pipes: MiddlewarePipe[]) => {
  await Promise.all(pipes.map((pipe) => pipe(context)))
}

/**
 * Interceptors that are executed across all types of HTTP web servers.
 * Ensures the execution of current middleware for each route.
 */
export const mainInterceptor: MiddlewareInterceptor = async (context, _, options: {
  handler: HandlerFunction
  interceptors: MiddlewareInterceptor[]
  headers?: Record<string, string>
}) => {
  const { handler, interceptors, headers = {} } = options

  let response = await getResponseInterceptor(context, null as never, handler)

  for (const header of Object.entries(headers)) {
    response.headers.append(...header)
  }

  for await (const interceptor of interceptors) {
    response = await interceptor(context, response) // execute interceptors secuentially
  }

  return response
}

/**
 * Main Guard that must be executed across all routes of HTTP web servers.
 */
export const routerGuard: MiddlewareGuard = (context, options: {
  type: WebServerTypes
  cors?: CorsOptions
  guards?: MiddlewareGuard[]
}) => {
  const { type, cors, guards = [] } = options
  const baseCorsGuard = corsGuard(cors, type)
  return mainGuard(context, [baseCorsGuard, ...guards])
}

/**
 * Main Pipe that must be executed across all routes of HTTP web servers.
 */
export const routerPipe: MiddlewarePipe = async (context, options: {
  pipes: MiddlewarePipe[]
  methods: HttpMethods[]
}) => {
  const { pipes, methods } = options
  const validateMethods = validateMethodsPipe(methods)

  contextSettingPipe(context)
  validateMethods(context)
  await mainPipe(context, pipes)
}

/**
 * Main Interceptor that must be executed across all routes of HTTP web servers.
 */
export const routerInterceptor: MiddlewareInterceptor = async (context, _, options: {
  gzip?: GzipOptions
  headers?: Record<string, string>
  interceptors: MiddlewareInterceptor[]
  handler: HandlerFunction
}) => {
  const { gzip, headers, interceptors, handler } = options

  try {
    const acceptsGzip = gzip !== false &&
      context.req.headers.get('accept-encoding')?.includes('gzip')

    const response = await mainInterceptor(context, null as never, {
      handler,
      interceptors,
      headers,
    })

    cleanUpPipe(context)

    return acceptsGzip ? gzipResponseFromResponse(response, gzip) : response
  } catch (e) {
    const error = e as HttpError
    error.id = error.id || context.id
    logger.error(`An error occurred on route '${context.url.pathname}'`, error, {
      meta: { route: context.url.pathname, source: 'zanix' },
      code: 'ROUTE_ERROR',
    })

    return errorResponses(e)
  }
}
