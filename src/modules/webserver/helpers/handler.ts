import type { ServerHandler, WebServerTypes } from 'typings/server.ts'
import type { ProcessedRouteDefinition } from 'typings/router.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { CorsOptions } from 'typings/middlewares.ts'

import { getDefaultGlobalInterceptors, getDefaultGlobalPipes } from 'middlewares/defaults/mod.ts'
import { bodyPayloadProperty, cleanRoute, findMatchingRoute } from 'utils/routes.ts'
import { getGraphqlHandler } from 'handlers/graphql/handler.ts'
import { searchParamsPropertyDescriptor } from '@zanix/helpers'
import { contextId, payloadAccessorDefinition } from 'utils/context.ts'
import { corsValidation } from 'middlewares/defaults/cors.ts'
import { HttpError } from '@zanix/errors'
import { asyncContext } from 'modules/program/public.ts'
import { routeProcessor } from './routes.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * Main  process execution
 */
const mainProcess = async (
  route: ProcessedRouteDefinition,
  context: HandlerContext,
  headers: Record<string, string> = {},
) => {
  if (!route.enableALS) {
    await getDefaultGlobalPipes(route)(context)
    return getDefaultGlobalInterceptors(route, headers)(context)
  }

  return asyncContext.runWith(context.id, async () => {
    await getDefaultGlobalPipes(route)(context)
    return getDefaultGlobalInterceptors(route, headers)(context)
  })
}

/**
 * Default routes handler
 * @param {WebServerTypes} type
 * @returns {ServerHandler}
 */
export const getMainHandler = (
  type: WebServerTypes,
  corsOptions?: CorsOptions,
  globalPrefix: string = '',
): ServerHandler => {
  if (type === 'graphql') {
    ProgramModule.routes.defineRoute('graphql', {
      path: globalPrefix || 'graphql',
      handler: getGraphqlHandler(),
      methods: ['POST'],
    })
  }

  const processedRoutes = routeProcessor(type, globalPrefix)

  const cors = corsValidation(corsOptions, type)

  return (async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const path = cleanRoute(url.pathname)

    // Context definition
    const context = { id: contextId(), payload: {}, req, url } as HandlerContext

    const { response, headers } = cors(context)

    if (response) return response

    Object.assign(context.payload, { body: await bodyPayloadProperty(req) })

    // Define a lazy-loaded getters to improve efficiency by computing values only when accessed
    Object.defineProperty(
      context.payload,
      'search',
      searchParamsPropertyDescriptor(url.searchParams),
    )

    // Check for absolute paths
    const absoluteRoute = processedRoutes[path]

    if (absoluteRoute) {
      return mainProcess(absoluteRoute, context, headers)
    }

    const processedRoute = findMatchingRoute(processedRoutes, path)
    if (!processedRoute) throw new HttpError('NOT_FOUND', { id: context.id })

    const { route, match } = processedRoute

    // Define a lazy-loaded getter to improve efficiency by computing values only when accessed
    Object.defineProperty(context.payload, 'params', payloadAccessorDefinition(match, route.params))

    return mainProcess(route, context, headers)
  })
}
