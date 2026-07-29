import type { ServerHandler, WebServerTypes } from 'typings/server.ts'
import type { ProcessedRouteDefinition } from 'typings/router.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { CorsOptions } from 'typings/middlewares.ts'
import type { GzipOptions } from 'typings/general.ts'

import { bodyPayloadProperty, findMatchingRoute, getPrefix } from 'utils/routes.ts'
import { contextId, payloadAccessorDefinition } from 'utils/context.ts'
import { getGraphqlHandler } from 'handlers/graphql/handler.ts'
import { cleanRoute, searchParamsPropertyDescriptor } from '@zanix/helpers'
import { asyncContext } from 'modules/infra/base/storage.ts'
import ProgramModule from 'modules/program/mod.ts'
import { routeProcessor } from './routes.ts'
import { httpErrorResponse } from 'utils/errors/helper.ts'
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
  const { route: { interceptors, handler, pipes, guards, enableALS } } = options
  const { context, gzip, cors, type } = options

  const process = async () => {
    const { response, headers } = await routerGuard(context, { type, cors, guards })
    if (response) return response
    await routerPipe(context, pipes)
    return routerInterceptor(context, null as never, { gzip, interceptors, handler, headers })
  }

  if (!enableALS) return process()

  return asyncContext.runWith(context.id, process)
}

/**
 * Default routes handler
 * @param {WebServerTypes} type
 * @param {boolean} isInternal - Whether this handler is being built for the internal server
 * instance (see `bootstrapServers`'s `BootstrapServerOptions[type].isInternal`) — only
 * routes/resolvers with a matching `isInternal` flag are included.
 * @returns {ServerHandler}
 */
export const getMainHandler = (
  type: WebServerTypes,
  isInternal: boolean = false,
  globalPrefix: string = '',
  options: { cors?: CorsOptions; gzip?: GzipOptions } = {},
): ServerHandler => {
  if (type === 'graphql') {
    ProgramModule.routes.defineRoute('graphql', {
      path: globalPrefix,
      handler: getGraphqlHandler(isInternal),
      httpMethod: 'POST',
    }, isInternal)
  }

  const { relativePaths, absolutePaths, routePaths } = routeProcessor(
    type,
    isInternal,
    globalPrefix,
  )

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
    const fullPath = `${path}/${req.method}`
    const absoluteRoute = absolutePaths[fullPath]

    if (absoluteRoute) {
      return mainProcess({ route: absoluteRoute, context, gzip, cors, type })
    }

    const processedRoute = findMatchingRoute(relativePaths, fullPath)
    if (!processedRoute) {
      if (routePaths.absolute.has(path) || routePaths.relative.test(path)) {
        throw new HttpError('METHOD_NOT_ALLOWED', { id: context.id })
      }

      throw new HttpError('NOT_FOUND', { id: context.id, meta: { path } })
    }

    const { route, match } = processedRoute

    // Define a lazy-loaded getter to improve efficiency by computing values only when accessed
    Object.defineProperty(context.payload, 'params', payloadAccessorDefinition(match, route.params))

    return mainProcess({ route, context, gzip, cors, type })
  })
}

/**
 * Creates a request multiplexer that routes incoming HTTP/WebSocket requests
 * to the appropriate server handler based on the request URL, method, protocol,
 * or any logic defined inside the multiplexer implementation.
 *
 * This is designed to unify multiple logical servers (HTTP, REST, GraphQL,
 * WebSocket, SSR, etc.) under a single `Deno.serve` instance — especially useful
 * on platforms where only one port listener is allowed.
 *
 * Always returns the live-lookup dispatcher — even when `handlers` has exactly one entry at call
 * time — rather than shortcutting to that single handler function directly. `manager.ts`'s
 * `create()` mutates the same `handlers` object in place as more servers register on this port
 * (e.g. a public server created *after* an internal one on the same port), so a shortcut captured
 * by value here would go stale the moment a second handler is added — the dispatcher must always
 * re-read `handlers[prefix]` per request against the live object. The extra `getPrefix()` call in
 * the single-handler case is negligible.
 *
 * A request whose path prefix doesn't match any registered handler gets a plain `NOT_FOUND`
 * response here, rather than reaching a per-type handler's own 404 logic — this can legitimately
 * happen once *any* two logical servers share a port.
 */
export function multiplexer(handlers: Record<string, ServerHandler>) {
  return (request: Request, info: Deno.ServeHandlerInfo<Deno.NetAddr>) => {
    const url = new URL(request.url)
    const prefix = getPrefix(url.pathname)
    const handler = handlers[prefix]

    if (!handler) {
      return httpErrorResponse(new HttpError('NOT_FOUND', { meta: { path: url.pathname } }))
    }

    return handler(request, info)
  }
}
