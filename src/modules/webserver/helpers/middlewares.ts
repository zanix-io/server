import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { errorResponses } from './errors.ts'
import { HttpError } from '@zanix/errors'
import logger from '@zanix/logger'

/**
 * A pipe that must be executed across all types of HTTP web servers.
 * This ensures consistent behavior regardless of the server implementation.
 */
export const getDefaultGlobalPipe = (
  route: Pick<ProcessedRouteDefinition, 'methods' | 'start'>,
): MiddlewarePipe => {
  const { methods, start } = route
  return ((ctx) => {
    start(ctx)

    if (!methods.includes(ctx.req.method as HttpMethods)) {
      throw new HttpError('METHOD_NOT_ALLOWED', { id: ctx.id })
    }
  })
}

/**
 * An interceptor that is executed across all types of HTTP web servers.
 * Ensures the execution of current middleware for each route.
 */
export const getResponseInterceptor = (
  route: Pick<ProcessedRouteDefinition, 'pipes' | 'interceptors' | 'end' | 'handler'>,
): MiddlewareInternalInterceptor => {
  return (async (ctx) => {
    await Promise.all(route.pipes.map((pipe) => pipe(ctx)))

    try {
      const handlerResponse = await route.handler(ctx)

      let response: Response
      if (typeof handlerResponse === 'string') response = new Response(handlerResponse)
      else if (handlerResponse instanceof Response) response = handlerResponse
      else {response = new Response(JSON.stringify(handlerResponse), {
          headers: JSON_CONTENT_HEADER,
        })}

      for await (const interceptor of route.interceptors) {
        response = await interceptor(ctx, response) // execute interceptors secuentially
      }

      route.end(ctx)

      return response
    } catch (e) {
      const error = e as HttpError
      error.id = error.id || ctx.id
      logger.error(`An error ocurred on route '${ctx.url.pathname}'`, error)

      return errorResponses(e)
    }
  })
}
