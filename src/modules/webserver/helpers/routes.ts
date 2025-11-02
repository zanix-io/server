import type { HandlerFunction, ProcessedRoutes } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HandlerTypes } from 'typings/program.ts'

import { cleanRoute, getParamNames, pathToRegex } from 'utils/routes.ts'
import ProgramModule from 'modules/program/mod.ts'
import { capitalize } from '@zanix/helpers'
import { InternalError } from '@zanix/errors'
import logger from '@zanix/logger'
import { ZANIX_PROPS } from 'utils/constants.ts'

/** Function to process routes */
export const routeProcessor = (server: WebServerTypes, globalPrefix: string = '') => {
  const routes = ProgramModule.routes.getRoutes(server)
  const serverName = capitalize(server)

  if (!routes || !Object.keys(routes).length) {
    throw new InternalError(`Not routes defined for ${serverName} sever`)
  }

  globalPrefix = cleanRoute(globalPrefix).replace(/\/$/g, '').replace(/^\//g, '')

  const processedRoutes = Object.keys(routes).reduce<ProcessedRoutes>((acc, route) => {
    const { handler, interceptors, pipes, methods } = routes[route]
    route = globalPrefix && `/${globalPrefix}` !== route ? `/${globalPrefix}${route}` : route

    logger.info(
      `${serverName} sever route:`,
      route,
      methods.length ? `| Methods: ${methods}` : '',
      'noSave',
    )

    let processedHandler: HandlerFunction

    let enableALS = false

    if (typeof handler === 'function') {
      processedHandler = handler
    } else {
      const { key, type, data } = handler.Target.prototype[ZANIX_PROPS]

      enableALS = data.enableALS as boolean

      processedHandler = (ctx) => {
        const Target = ProgramModule.targets.getHandler(key, type as HandlerTypes, ctx)
        const method: HandlerFunction = Target[handler.propertyKey].bind(Target)

        return method(ctx)
      }
    }

    acc[route as keyof typeof acc] = {
      regex: pathToRegex(route),
      params: getParamNames(route),
      handler: processedHandler,
      methods: methods.length === 0 ? ['GET', 'POST'] : methods,
      interceptors,
      enableALS,
      pipes,
    }
    return acc
  }, {})

  return processedRoutes
}
