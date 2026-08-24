import type {
  GraphqlValidationOptions,
  HandlerBox,
  ServerHandler,
  WebServerTypes,
} from 'typings/server.ts'
import type { ProcessedRouteDefinition } from 'typings/router.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { CorsOptions } from 'typings/middlewares.ts'
import type { GzipOptions } from 'typings/general.ts'

import {
  bodyPayloadProperty,
  bucketRoutesByMethod,
  EMPTY_ROUTES,
  findMatchingRoute,
  getPrefix,
} from 'utils/routes.ts'
import { contextId, payloadAccessorDefinition } from 'utils/context.ts'
import { getGraphqlHandler } from 'handlers/graphql/handler.ts'
import { cleanRoute, searchParamsPropertyDescriptor } from '@zanix/helpers'
import { asyncContext } from 'modules/infra/base/storage.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import ProgramModule from 'modules/program/mod.ts'
import { routeProcessor } from './routes.ts'
import { httpErrorResponse } from 'utils/errors/helper.ts'
import { attachRequestToError } from 'utils/errors/request-context.ts'
import { HttpError } from '@zanix/errors'
import {
  routerGuard,
  routerInterceptor,
  routerPipe,
} from 'middlewares/defaults/main.middlewares.ts'

/**
 * Main process execution. `enableALS` (see `GenericHandlerOptions.enableALS`'s own doc for the
 * Deno-vs-Node-compat caveat) opens one `asyncContext` scope per request here — the
 * highest-concurrency use of `AsyncContext` in this codebase, since a busy server runs many of
 * these `runWith` calls genuinely concurrently.
 *
 * `routerInterceptor` already catches everything from the handler body/custom interceptors and
 * converts it directly to a `Response` (`httpErrorResponse`, see its own doc) — it never throws.
 * `routerGuard` (CORS, cookies, any custom `guards`) and `routerPipe` (custom `pipes`) are the only
 * phases whose errors actually escape uncaught up to `Deno.serve`'s `onError` — this one `try/catch`
 * around both is what makes `attachRequestToErrors` apply uniformly to every guard/pipe throw
 * (framework-owned like CORS's `BAD_REQUEST`/`METHOD_NOT_ALLOWED`, or a consumer's own custom
 * guard/pipe) without each of them needing to call `attachRequestToError` itself.
 */
const mainProcess = (options: {
  route: ProcessedRouteDefinition
  context: HandlerContext
  type: WebServerTypes
  cors?: CorsOptions
  gzip?: GzipOptions
  attachRequestToErrors?: boolean
}) => {
  const { route: { interceptors, handler, pipes, guards, enableALS } } = options
  const { context, gzip, cors, type, attachRequestToErrors } = options

  const process = async () => {
    try {
      const { response, headers } = await routerGuard(context, {
        type,
        cors,
        guards,
      })
      if (response) return response
      await routerPipe(context, pipes)
      return routerInterceptor(context, null as never, {
        gzip,
        interceptors,
        handler,
        headers,
        type,
      })
    } catch (error) {
      if (attachRequestToErrors && error instanceof Error) {
        throw attachRequestToError(error, context.req)
      }
      throw error
    }
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
  options: {
    cors?: CorsOptions
    gzip?: GzipOptions
    attachRequestToErrors?: boolean
    maxBodyBytes?: number
    graphqlValidation?: GraphqlValidationOptions
  } = {},
): ServerHandler => {
  if (type === 'graphql') {
    // Registered lazily here, at Runtime-activation time rather than composition time (no
    // `ApplicationContainer.define(...)` scope is active this late) — `applicationOverride`
    // (`defineRoute`'s 3rd argument) attributes it correctly regardless.
    ProgramModule.routes.defineRoute('graphql', {
      path: globalPrefix,
      handler: getGraphqlHandler(application, options.graphqlValidation),
      httpMethod: 'POST',
    }, application)
  }

  const { relativePaths, catchAllPaths, absolutePaths, routePaths } = routeProcessor(
    type,
    application,
    globalPrefix,
  )

  // Both `:param` tables, split into one bucket per HTTP method — built once, here, never per
  // request. See `bucketRoutesByMethod`'s own doc: the scan `findMatchingRoute` performs is linear,
  // and without this a `GET` runs the regex of every `POST`/`PUT`/`PATCH`/`DELETE` route before
  // reaching its own. Precedence between the two tables is unchanged (ordinary `:param` first,
  // catch-all second), and so is the behavior for a method no route uses.
  const relativeByMethod = bucketRoutesByMethod(relativePaths)
  const catchAllByMethod = bucketRoutesByMethod(catchAllPaths)

  const { cors, gzip, attachRequestToErrors, maxBodyBytes } = options

  return (async (req: Request): Promise<Response> => {
    const url = new URL(req.url)

    // Context definition
    const context = {
      id: contextId(),
      payload: {},
      req,
      url,
      locals: {},
    } as HandlerContext

    try {
      Object.assign(context.payload, {
        body: await bodyPayloadProperty(req, context.id, maxBodyBytes),
      })
    } catch (error) {
      throw attachRequestToErrors && error instanceof HttpError
        ? attachRequestToError(error, req)
        : error
    }

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
      return mainProcess({
        route: absoluteRoute,
        context,
        gzip,
        cors,
        type,
        attachRequestToErrors,
      })
    }

    // Deterministic precedence, independent of registration order: ordinary `:param` routes are
    // tried before catch-all (`:name*`) routes, always — never "whichever was registered first".
    // `relativePaths`/`catchAllPaths` are two SEPARATE tables precisely so this order is fixed
    // structurally, not by accident of iteration order within one combined table.
    const processedRoute =
      findMatchingRoute(relativeByMethod[req.method] ?? EMPTY_ROUTES, fullPath) ??
        findMatchingRoute(catchAllByMethod[req.method] ?? EMPTY_ROUTES, fullPath)
    if (!processedRoute) {
      if (routePaths.absolute.has(path) || routePaths.relative.test(path)) {
        const error = new HttpError('METHOD_NOT_ALLOWED', { id: context.id })
        throw attachRequestToErrors ? attachRequestToError(error, req) : error
      }

      // `path` is safe to expose in the response: the caller already knows it, it's the one they
      // requested — see `@zanix/errors`' `ErrorOptions.exposeMeta` doc.
      const error = new HttpError('NOT_FOUND', {
        id: context.id,
        meta: { path },
        exposeMeta: true,
      })
      throw attachRequestToErrors ? attachRequestToError(error, req) : error
    }

    const { route, match } = processedRoute

    // A THUNK, not a pre-computed string — building it here is just capturing `url`/`req.method`
    // in a closure, essentially free. The actual `cleanRoute()` call only happens if/when
    // `payloadAccessorDefinition`'s own getter invokes this thunk, which itself only happens on
    // the FIRST real read of `ctx.payload.params` (and never again — cached from then on). Given
    // for any route that declares at least one `:param` (ordinary or catch-all) — a route with
    // none (`absoluteRoute`, handled above via its own early `return`) never reaches this line at
    // all. `cleanRoute` applies the IDENTICAL structural transform either way (trim, `\`→`/`,
    // collapse `//`, drop trailing slash) and differs only in the final `.toLowerCase()`, so
    // character OFFSETS in `path` (lowercased, what `match`/`match.indices` were computed against)
    // line up exactly with the same offsets in this case-preserved string — no re-matching needed,
    // just a direct slice by those same indices, for EVERY param, not just a catch-all (see
    // `payloadAccessorDefinition`'s own doc). A handler that never reads `params` at all — however
    // many the route declares — never pays for this string work either.
    const getRawFullPath = route.params.length
      ? () => `${cleanRoute(url.pathname, true)}/${req.method}`
      : undefined

    // Define a lazy-loaded getter to improve efficiency by computing values only when accessed
    Object.defineProperty(
      context.payload,
      'params',
      payloadAccessorDefinition(
        match,
        route.params,
        getRawFullPath,
      ),
    )

    return mainProcess({
      route,
      context,
      gzip,
      cors,
      type,
      attachRequestToErrors,
    })
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
 * Always returns the live-lookup dispatcher, even when `box.current` has exactly one entry at call
 * time. Although it would be possible to shortcut directly to that handler, doing so would prevent
 * the dispatcher from observing future updates to `box.current`. `manager.ts`'s
 * `create()` never mutates a port's dispatch table in place — each new registration swaps `box`'s
 * own `current` field to an entirely new, frozen table (see `HandlerBox`'s own doc) — so the
 * dispatcher must always dereference `box.current` fresh per request, never close over one specific
 * table snapshot, or it would go stale the moment a later registration swaps `current` to a new
 * table. The extra `getPrefix()` call in the single-handler case is negligible.
 *
 * A request whose path prefix doesn't match any registered handler, and for which no `''`-keyed
 * catch-all is registered either (see below), gets a plain `NOT_FOUND` response here, rather than
 * reaching a per-type handler's own 404 logic — this can legitimately happen once *any* two logical
 * servers share a port.
 *
 * An entry registered under the empty-string key (an unanchored server with no `globalPrefix` at
 * all — e.g. an `'ssr'` server, whose pages must resolve at the site's real root paths rather than
 * under a fixed first path segment) acts as this port's catch-all: it's tried whenever the
 * request's own first path segment has no dedicated entry. This never shadows a real prefix (an
 * exact match always wins first), so it composes safely with REST/GraphQL/Socket sharing the same
 * port under their own non-empty prefixes.
 */
export function multiplexer(box: HandlerBox) {
  return (request: Request, info: Deno.ServeHandlerInfo<Deno.NetAddr>) => {
    const url = new URL(request.url)
    const prefix = getPrefix(url.pathname)
    const handler = box.current[prefix] ?? box.current['']

    if (!handler) {
      return httpErrorResponse(
        new HttpError('NOT_FOUND', { meta: { path: url.pathname }, exposeMeta: true }),
      )
    }

    return handler(request, info)
  }
}
