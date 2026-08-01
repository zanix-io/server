import type { HandlerBox, ServerHandler, WebServerTypes } from 'typings/server.ts'
import type { ProcessedRouteDefinition } from 'typings/router.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { CorsOptions } from 'typings/middlewares.ts'
import type { GzipOptions } from 'typings/general.ts'

import { bodyPayloadProperty, findMatchingRoute, getPrefix } from 'utils/routes.ts'
import { contextId, payloadAccessorDefinition } from 'utils/context.ts'
import { getGraphqlHandler } from 'handlers/graphql/handler.ts'
import { cleanRoute, searchParamsPropertyDescriptor } from '@zanix/helpers'
import { asyncContext } from 'modules/infra/base/storage.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
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
 * @param {string} application - The Application this server instance is being built for (see
 * `bootstrapServers`'s `BootstrapServerOptions[type].application`) — only routes/resolvers
 * registered under this same Application are included. Defaults to the default Application.
 * @param {string} globalPrefix - The full route-path prefix baked into this handler's own path
 * table (via `routeProcessor`) — this is the `Runtime`'s own `routeHandlerPrefix` (`runtime.ts`'s
 * `compileRuntime`): for an anchored server, the server's own id plus an optional `{globalPrefix}`
 * segment, NOT necessarily a single path segment; this is a separate concern from
 * `WebServerManager.create`'s `dispatchKey`, which the multiplexer uses to pick which handler to
 * invoke in the first place.
 * @returns {ServerHandler}
 */
export const getMainHandler = (
  type: WebServerTypes,
  application: string = DEFAULT_APPLICATION,
  globalPrefix: string = '',
  options: { cors?: CorsOptions; gzip?: GzipOptions } = {},
): ServerHandler => {
  if (type === 'graphql') {
    // Registered lazily here, at Runtime-activation time rather than composition time (no
    // `ApplicationContainer.define(...)` scope is active this late) — `applicationOverride`
    // (`defineRoute`'s 3rd argument) attributes it correctly regardless.
    ProgramModule.routes.defineRoute('graphql', {
      path: globalPrefix,
      handler: getGraphqlHandler(application),
      httpMethod: 'POST',
    }, application)
  }

  const { relativePaths, absolutePaths, routePaths } = routeProcessor(
    type,
    application,
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
 * Always returns the live-lookup dispatcher — even when `box.current` has exactly one entry at call
 * time — rather than shortcutting to that single handler function directly. `manager.ts`'s
 * `create()` never mutates a port's dispatch table in place — each new registration swaps `box`'s
 * own `current` field to an entirely new, frozen table (see `HandlerBox`'s own doc) — so the
 * dispatcher must always dereference `box.current` fresh per request, never close over one specific
 * table snapshot, or it would go stale the moment a later registration swaps `current` to a new
 * table. The extra `getPrefix()` call in the single-handler case is negligible.
 *
 * A request whose path prefix doesn't match any registered handler gets a plain `NOT_FOUND`
 * response here, rather than reaching a per-type handler's own 404 logic — this can legitimately
 * happen once *any* two logical servers share a port.
 */
export function multiplexer(box: HandlerBox) {
  return (request: Request, info: Deno.ServeHandlerInfo<Deno.NetAddr>) => {
    const url = new URL(request.url)
    const prefix = getPrefix(url.pathname)
    const handler = box.current[prefix]

    if (!handler) {
      return httpErrorResponse(new HttpError('NOT_FOUND', { meta: { path: url.pathname } }))
    }

    return handler(request, info)
  }
}
