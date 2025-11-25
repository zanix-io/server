import type { HandlerFunction, ProcessedRoutes } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HandlerTypes } from 'typings/program.ts'

import { cleanRoute, getParamNames, pathToRegex } from 'utils/routes.ts'
import ProgramModule from 'modules/program/mod.ts'
import { capitalize } from '@zanix/helpers'
import { InternalError } from '@zanix/errors'
import logger from '@zanix/logger'
import { PARAM_PATTERN, ZANIX_PROPS } from 'utils/constants.ts'

/** Function to process routes */
export const routeProcessor = (server: WebServerTypes, globalPrefix: string = '') => {
  const routes = ProgramModule.routes.getRoutes(server)
  const serverName = capitalize(server)

  if (!routes || !Object.keys(routes).length) {
    throw new InternalError(`Not routes defined for ${serverName} sever`, {
      meta: { source: 'zanix', serverName },
    })
  }

  globalPrefix = cleanRoute(globalPrefix).replace(/\/$/g, '').replace(/^\//g, '')

  const processedRoutes = Object.keys(routes).reduce<
    { absolutePaths: ProcessedRoutes; relativePaths: ProcessedRoutes; routePaths: Set<string> }
  >((acc, route) => {
    const { handler, path, interceptors, pipes, httpMethod, guards } = routes[route]
    let fullPath = path
    if (globalPrefix && `/${globalPrefix}` !== path) {
      route = `/${globalPrefix}${route}`
      fullPath = `/${globalPrefix}${path}`
      acc.routePaths.add(fullPath)
    } else acc.routePaths.add(path)

    logger.info(
      `${serverName} sever route:`,
      fullPath,
      httpMethod ? `| Method: ${httpMethod}` : '',
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

    const baseRoute = {
      params: getParamNames(route),
      handler: processedHandler,
      httpMethod: httpMethod || 'GET',
      interceptors,
      enableALS,
      guards,
      pipes,
    } as ProcessedRoutes[0]

    if (PARAM_PATTERN.test(route)) {
      acc.relativePaths[route] = { ...baseRoute, regex: pathToRegex(route) }
    } else {
      acc.absolutePaths[route] = baseRoute
    }
    return acc
  }, { relativePaths: {}, absolutePaths: {}, routePaths: new Set([]) })

  return processedRoutes
}
