import type { HandlerFunction, ProcessedRoutes } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HandlerTypes } from 'typings/program.ts'

import { getParamNames, pathToRegex } from 'utils/routes.ts'
import ProgramModule from 'modules/program/mod.ts'
import { capitalize } from '@zanix/helpers'
import { InternalError } from '@zanix/errors'
import logger from '@zanix/logger'
import { PARAM_PATTERN, ZANIX_PROPS } from 'utils/constants.ts'

/**
 * Function to process routes
 * @param isInternal - Only routes whose own `isInternal` flag (default `false`) matches this
 * value are included — see `bootstrapServers`'s `BootstrapServerOptions[type].isInternal`.
 */
export const routeProcessor = (
  server: WebServerTypes,
  isInternal: boolean = false,
  globalPrefix: string = '',
) => {
  const allRoutes = ProgramModule.routes.getRoutes(server) || {}
  const routeKeys = Object.keys(allRoutes).filter((route) =>
    !!allRoutes[route].isInternal === isInternal
  )
  const serverName = capitalize(server)

  if (!routeKeys.length) {
    throw new InternalError(`Not routes defined for ${serverName} sever`, {
      meta: { source: 'zanix', serverName },
    })
  }

  const processedRoutes = routeKeys.reduce<
    {
      absolutePaths: ProcessedRoutes
      relativePaths: ProcessedRoutes
      routePaths: { absolute: Set<string>; relative: RegExp[] }
    }
  >((acc, route) => {
    const { handler, path, interceptors, pipes, httpMethod, guards } = allRoutes[route]
    let fullPath
    if (globalPrefix && `/${globalPrefix}` !== path) {
      route = `/${globalPrefix}${route}`
      fullPath = `/${globalPrefix}${path}`
    } else fullPath = path

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
      acc.routePaths.relative.push(pathToRegex(fullPath))
    } else {
      acc.absolutePaths[route] = baseRoute
      acc.routePaths.absolute.add(fullPath)
    }
    return acc
  }, {
    relativePaths: {},
    absolutePaths: {},
    routePaths: { absolute: new Set([]), relative: [] },
  })

  const { relativePaths, routePaths, absolutePaths } = processedRoutes

  return {
    relativePaths,
    absolutePaths,
    routePaths: {
      absolute: routePaths.absolute,
      // `(?!)` never matches anything — an empty `routePaths.relative` must not fall back to
      // `new RegExp('')`, which (as an empty pattern) matches every string at position 0 and
      // would make any unmatched path look like a 405 (method not allowed) instead of a 404.
      relative: routePaths.relative.length
        ? new RegExp(routePaths.relative.map((r) => r.source).join('|'))
        : /(?!)/,
    },
  }
}
