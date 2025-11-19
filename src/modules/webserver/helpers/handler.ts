import type { ServerHandler, WebServerTypes } from 'typings/server.ts'
import type { ProcessedRouteDefinition } from 'typings/router.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { CorsOptions } from 'typings/middlewares.ts'
import type { GzipOptions } from 'typings/general.ts'

import { bodyPayloadProperty, cleanRoute, findMatchingRoute } from 'utils/routes.ts'
import { contextId, payloadAccessorDefinition } from 'utils/context.ts'
import { getGraphqlHandler } from 'handlers/graphql/handler.ts'
import { searchParamsPropertyDescriptor } from '@zanix/helpers'
import { asyncContext } from 'modules/infra/base/storage.ts'
import ProgramModule from 'modules/program/mod.ts'
import { routeProcessor } from './routes.ts'
import { HttpError } from '@zanix/errors'
import {
  routerGuard,
  routerInterceptor,
  routerPipe,
} from 'middlewares/defaults/main.middlewares.ts'

/**
 * Main  process execution
 */
const mainProcess = (options: {
  route: ProcessedRouteDefinition
  context: HandlerContext
  type: WebServerTypes
  cors?: CorsOptions
  gzip?: GzipOptions
}) => {
  const { route: { methods, interceptors, handler, pipes, guards, enableALS } } = options
  const { context, gzip, cors, type } = options

  const process = async () => {
    const { response, headers } = await routerGuard(context, { type, cors, guards })
    if (response) return response
    await routerPipe(context, { methods, pipes })
    return routerInterceptor(context, null as never, { gzip, interceptors, handler, headers })
  }

  if (!enableALS) return process()

  return asyncContext.runWith(context.id, process)
}

/**
 * Default routes handler
 * @param {WebServerTypes} type
 * @returns {ServerHandler}
 */
export const getMainHandler = (
  type: WebServerTypes,
  options: { cors?: CorsOptions; gzip?: GzipOptions } = {},
  globalPrefix: string = '',
): ServerHandler => {
  if (type === 'graphql') {
    ProgramModule.routes.defineRoute('graphql', {
      path: globalPrefix || 'graphql',
      handler: getGraphqlHandler(),
      methods: ['POST'],
    })
  }

  const { relativePaths, absolutePaths } = routeProcessor(type, globalPrefix)

  const { cors, gzip } = options

  return (async (req: Request): Promise<Response> => {
    const url = new URL(req.url)

    // Context definition
    const context = { id: contextId(), payload: {}, req, url, locals: {} } as HandlerContext

    Object.assign(context.payload, { body: await bodyPayloadProperty(req) })

    // Define a lazy-loaded getters to improve efficiency by computing values only when accessed
    Object.defineProperty(
      context.payload,
      'search',
      searchParamsPropertyDescriptor(url.searchParams),
    )

    // Check for absolute paths
    const path = cleanRoute(url.pathname)
    const absoluteRoute = absolutePaths[path]

    if (absoluteRoute) {
      return mainProcess({ route: absoluteRoute, context, gzip, cors, type })
    }

    const processedRoute = findMatchingRoute(relativePaths, path)
    if (!processedRoute) throw new HttpError('NOT_FOUND', { id: context.id })

    const { route, match } = processedRoute

    // Define a lazy-loaded getter to improve efficiency by computing values only when accessed
    Object.defineProperty(context.payload, 'params', payloadAccessorDefinition(match, route.params))

    return mainProcess({ route, context, gzip, cors, type })
  })
}
