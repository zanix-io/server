import type { HandlerFunction, ProcessedRoutes } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HandlerTypes } from 'typings/program.ts'

import { getParamNames, isCatchAllRoute, pathToRegex } from 'utils/routes.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { getApplicationMountPrefix } from 'modules/webserver/application-mount-registry.ts'
import ProgramModule from 'modules/program/mod.ts'
import { capitalize, cleanRoute } from '@zanix/helpers'
import { InternalError } from '@zanix/errors'
import logger from '@zanix/logger'
import { PARAM_PATTERN, ZANIX_PROPS } from 'utils/constants.ts'

/**
 * Function to process routes
 * @param application - Only routes registered under this Application (see
 * `ApplicationContainer`) are included — see `bootstrapServers`'s
 * `BootstrapServerOptions[type].application`. Defaults to the default Application (`'main'`).
 */
export const routeProcessor = (
  server: WebServerTypes,
  application: string = DEFAULT_APPLICATION,
  globalPrefix: string = '',
) => {
  const allRoutes = ProgramModule.routes.getRoutes(server) || {}
  // `Object.keys(allRoutes)` yields `${application}:${path}/${httpMethod}`-shaped storage keys
  // (see `RouteContainer.defineRoute`/`defineTargetRoutes`) — that `application:` prefix is an
  // identity/collision-detection concern of `RouteContainer`, never a dispatch-path concern here,
  // so it must NOT leak past this filter. Every downstream use derives its own clean
  // `path`/`httpMethod`-based route string instead of reusing this storage key.
  const routeKeys = Object.keys(allRoutes).filter((storageKey) =>
    allRoutes[storageKey].application === application
  )
  const serverName = capitalize(server)

  if (!routeKeys.length) {
    throw new InternalError(`Not routes defined for ${serverName} sever`, {
      meta: { source: 'zanix', serverName },
    })
  }

  // Resolved ONCE for the whole call — every route processed here belongs to the same
  // `application` (see the filter above), so its mount prefix never varies mid-loop. `''` (never
  // registered, or explicitly registered empty) preserves today's behavior exactly — see
  // `application-mount-registry.ts`'s own doc.
  const mountPrefix = getApplicationMountPrefix(application)

  const processedRoutes = routeKeys.reduce<
    {
      absolutePaths: ProcessedRoutes
      relativePaths: ProcessedRoutes
      catchAllPaths: ProcessedRoutes
      routePaths: { absolute: Set<string>; relative: RegExp[] }
    }
  >((acc, storageKey) => {
    const { handler, path, interceptors, pipes, httpMethod, guards } = allRoutes[storageKey]
    // The mount prefix sits between `globalPrefix` and this route's own controller-prefix/
    // method-path (`path`): `globalPrefix + applicationMountPrefix + controllerPrefix +
    // methodPath`. `mountPrefix` empty (the default) makes `mountedPath === path`, identical to
    // the behavior before Application-scoped mounting existed.
    const mountedPath = mountPrefix ? cleanRoute(`${mountPrefix}${path}`) : path
    // `fullPath` is cleaned as a whole, AFTER the `globalPrefix` concatenation decision — not by
    // cleaning `mountedPath` in isolation beforehand. `path` (and therefore `mountedPath`) can be
    // the literal empty string (a root-level page with no controller prefix and no `globalPrefix`:
    // `defineTargetRoutes`'s own `prefix === '' && endpoint === '' ? ''` case), and
    // `getMainHandler`'s request-side `cleanRoute(url.pathname)` never produces an empty string for
    // the root path — it normalizes to `'/'`. Cleaning `mountedPath` on its own before prepending
    // `globalPrefix` would instead introduce a spurious extra `/` once a `globalPrefix` IS present
    // (`/api` + `/` + `/GET` ≠ the client's `/api` + `/GET`) — cleaning the fully-combined path
    // once avoids that.
    const takesGlobalPrefixBranch = globalPrefix &&
      `/${globalPrefix}` !== mountedPath
    const fullPath = takesGlobalPrefixBranch
      ? cleanRoute(`/${globalPrefix}${mountedPath}`)
      : cleanRoute(mountedPath)
    const route = `${fullPath}/${httpMethod || 'GET'}`
    // A case-preserved mirror of `fullPath`/`route`, used ONLY to extract `:paramName` names below
    // — never for matching/storage keys/logging, which all keep using the lowercased `route` above
    // exactly as before. Without this, a `:serviceId`-shaped param registers as `:serviceid`
    // (`cleanRoute` lowercases the WHOLE path it's given, including param placeholder text, not
    // just literal segments), so `ctx.payload.params.serviceId` would silently read `undefined` —
    // the actual key ends up `serviceid`. `pathToRegex`/route matching is purely positional (it
    // discards param names into a plain capture group, see `pathToRegex`'s own regex), and
    // `payloadAccessorDefinition` (`utils/context.ts`) zips `route.params[i]` with the regex
    // match's `i`-th group by ARRAY INDEX — so swapping in a case-preserved name here changes
    // nothing about which request matches which route, only what key its params end up under.
    // Does NOT fix a `:paramName`'s VALUE (the actual URL segment a caller sent) also being
    // lowercased — that's a separate, deeper concern this fix deliberately doesn't touch.
    const mountedPathRaw = mountPrefix ? cleanRoute(`${mountPrefix}${path}`, true) : path
    const fullPathRaw = takesGlobalPrefixBranch
      ? cleanRoute(`/${globalPrefix}${mountedPathRaw}`, true)
      : cleanRoute(mountedPathRaw, true)
    const routeRaw = `${fullPathRaw}/${httpMethod || 'GET'}`

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
        const Target = ProgramModule.targets.getHandler(
          key,
          type as HandlerTypes,
          ctx,
        )
        const method: HandlerFunction = Target[handler.propertyKey].bind(
          Target,
        )

        return method(ctx)
      }
    }

    const baseRoute = {
      params: getParamNames(routeRaw),
      handler: processedHandler,
      httpMethod: httpMethod || 'GET',
      interceptors,
      enableALS,
      guards,
      pipes,
    } as ProcessedRoutes[0]

    if (PARAM_PATTERN.test(route)) {
      // Filed into a SEPARATE bucket from an ordinary `:param` route — never together — so
      // `getMainHandler` can try them in a fixed, deterministic order (exact → `:param` →
      // catch-all) regardless of which was registered first. `isCatchAllRoute` checks `fullPath`
      // (no method suffix) — simpler than checking `route`, and equivalent here since a method
      // suffix can never itself introduce or remove a catch-all shape.
      if (isCatchAllRoute(fullPath)) {
        // Guaranteed to exist and be `params`'s own last entry — `assertValidCatchAllPosition`
        // (registration time, `RouteContainer`) already rejects any route where a catch-all isn't
        // the final segment, so there is no case here where this is undefined.
        const catchAllParam = baseRoute.params[baseRoute.params.length - 1]
        acc.catchAllPaths[route] = {
          ...baseRoute,
          catchAllParam,
          regex: pathToRegex(route),
        }
      } else {
        acc.relativePaths[route] = { ...baseRoute, regex: pathToRegex(route) }
      }
      acc.routePaths.relative.push(pathToRegex(fullPath))
    } else {
      acc.absolutePaths[route] = baseRoute
      acc.routePaths.absolute.add(fullPath)
    }
    return acc
  }, {
    relativePaths: {},
    absolutePaths: {},
    catchAllPaths: {},
    routePaths: { absolute: new Set([]), relative: [] },
  })

  const { relativePaths, catchAllPaths, routePaths, absolutePaths } = processedRoutes

  return {
    relativePaths,
    catchAllPaths,
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
