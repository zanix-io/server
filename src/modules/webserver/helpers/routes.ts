import type { HandlerFunction, ProcessedRoutes } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'

import { cleanRoute, getParamNames, pathToRegex, routeOnEnd, routeOnStart } from 'utils/routes.ts'
import ProgramModule from 'modules/program/mod.ts'
import { capitalize } from '@zanix/helpers'
import logger from '@zanix/logger'

/** Function to process routes */
export const routeProcessor = (server: WebServerTypes, globalPrefix: string = '') => {
  const routes = ProgramModule.routes.getRoutes(server)
  const serverName = capitalize(server)

  if (!routes || !Object.keys(routes).length) {
    throw new Deno.errors.Interrupted(`Not routes defined for ${serverName} sever`)
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

    if (typeof handler === 'function') {
      processedHandler = handler
    } else {
      const { key, type } = handler.Target.prototype['_znxProps']

      processedHandler = (ctx) =>
        (ProgramModule.targets.getInstance(
          key,
          type,
          { ctx },
        )[handler.propertyKey as never] as HandlerFunction)(
          ctx,
        )
    }

    acc[route as keyof typeof acc] = {
      regex: pathToRegex(route),
      params: getParamNames(route),
      handler: processedHandler,
      methods: methods.length === 0 ? ['GET', 'POST'] : methods,
      interceptors,
      start: routeOnStart(),
      end: routeOnEnd(),
      pipes,
    }
    return acc
  }, {})

  return processedRoutes
}
