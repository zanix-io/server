import type { HandlerContext } from 'typings/context.ts'
import type { ServerHandler, WebServerTypes } from 'typings/server.ts'

import { getDefaultGlobalPipe, getResponseInterceptor } from './middlewares.ts'

import { bodyPayloadProperty, cleanRoute } from 'utils/routes.ts'
import { getGraphqlHandler } from 'handlers/graphql/handler.ts'
import { searchParamsPropertyDescriptor } from '@zanix/helpers'
import { HttpError } from '@zanix/errors'
import { contextId } from 'utils/uuid.ts'

import ProgramModule from 'modules/program/mod.ts'
import { routeProcessor } from './routes.ts'

/**
 * Default routes handler
 * @param {WebServerTypes} type
 * @param {ServerOptions} server
 *
 * @returns {ServerHandler}
 */
export const getMainHandler = (
  type: WebServerTypes,
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

  return (async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const path = cleanRoute(url.pathname)

    // Context definition
    const context = { id: await contextId(), payload: {}, req, url } as HandlerContext

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
      getDefaultGlobalPipe(absoluteRoute)(context)
      return getResponseInterceptor(absoluteRoute)(context)
    }

    // Check for no absolute paths
    for (const route in processedRoutes) {
      const processedRoute = processedRoutes[route]
      const { regex, params } = processedRoute

      const match = path.match(regex)

      if (!match) continue

      getDefaultGlobalPipe(processedRoute)(context)

      // Define a lazy-loaded getter to improve efficiency by computing values only when accessed
      Object.defineProperty(context.payload, 'params', {
        set(value) {
          this._computedParams = value
        },
        get() {
          if (this._computedParams) return this._computedParams

          const matchParts = match.slice(1)
          this._computedParams = {}

          for (let i = 0; i < params.length; i++) {
            const value = matchParts[i]
            this._computedParams[params[i]] = value?.slice(1)
          }

          return this._computedParams
        },
      })

      return getResponseInterceptor(processedRoute)(context)
    }

    throw new HttpError('NOT_FOUND', { id: context.id })
  })
}
