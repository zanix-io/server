import type { MiddlewareInternalInterceptor, MiddlewarePipe } from 'typings/middlewares.ts'
import type { ProcessedRouteDefinition } from 'typings/router.ts'
import type { HttpError } from '@zanix/errors'

import { getResponseInterceptor } from './response.interceptor.ts'
import { errorResponses } from 'webserver/helpers/errors.ts'
import { cleanUpPipe, contextSettingPipe } from './context.pipe.ts'
import { validateMethodsPipe } from './methods.pipe.ts'
import logger from '@zanix/logger'

/**
 * Pipes that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const getDefaultGlobalPipes = (
  route: Pick<ProcessedRouteDefinition, 'methods' | 'pipes'>,
): MiddlewarePipe => {
  const validateMethods = validateMethodsPipe(route.methods)
  return async (ctx) => {
    contextSettingPipe(ctx)
    validateMethods(ctx)
    await Promise.all(route.pipes.map((pipe) => pipe(ctx)))
  }
}

/**
 * Interceptors that are executed across all types of HTTP web servers.
 * Ensures the execution of current middleware for each route.
 */
export const getDefaultGlobalInterceptors = (
  route: Pick<ProcessedRouteDefinition, 'pipes' | 'interceptors' | 'handler'>,
  headers: Record<string, string> = {},
): MiddlewareInternalInterceptor => {
  const responseInterceptor = getResponseInterceptor(route.handler)

  return (async (ctx) => {
    try {
      let response = await responseInterceptor(ctx)

      for await (const interceptor of route.interceptors) {
        response = await interceptor(ctx, response) // execute interceptors secuentially
      }

      cleanUpPipe(ctx)

      for (const header of Object.entries(headers)) {
        response.headers.append(...header)
      }

      return response
    } catch (e) {
      const error = e as HttpError
      error.id = error.id || ctx.id
      logger.error(`An error occurred on route '${ctx.url.pathname}'`, error, {
        meta: { route: ctx.url.pathname, source: 'zanix' },
        code: 'ROUTE_ERROR',
      })

      return errorResponses(e)
    }
  })
}
