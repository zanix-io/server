import type { HandlerFunction, ProcessedRoutes, RouteEntry } from 'typings/router.ts'
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
 * One route's already-computed processing result — everything `routeProcessor`'s reduce loop
 * needs to re-insert a route into `acc` without recomputing `mountedPath`/`fullPath`/`regex`/param
 * extraction or re-running `logger.info`. `bucket` records which of the three tables (`absolute`/
 * `relative`/`catchAll`) this route belongs in, since a cache hit skips the `PARAM_PATTERN`/
 * `isCatchAllRoute` branching that would otherwise redetermine it. `relativeRegex` is only ever
 * set for `relative`/`catchAll` — the extra `pathToRegex(fullPath)` entry those two buckets (and
 * only those two) push onto `acc.routePaths.relative`.
 */
type CachedProcessedRoute =
  | { bucket: 'absolute'; route: string; fullPath: string; value: ProcessedRoutes[0] }
  | {
    bucket: 'relative' | 'catchAll'
    route: string
    fullPath: string
    value: ProcessedRoutes[0]
    relativeRegex: RegExp
  }

/**
 * Per-route-record memoization for `routeProcessor`, keyed by the route record's own OBJECT
 * IDENTITY (never by path/method string). This is what makes a `WebServerManager.refreshRoutes()`
 * rebuild cheap for every route that didn't actually change: `RouteContainer.defineRoute`
 * (`modules/program/metadata/routes.ts`) only ever writes a BRAND-NEW object at a route's storage
 * key when that route is (re)registered — an unchanged route (e.g. `@zanix/space`'s dev-mode
 * `loadRoutes()` skipping `defineRoute` entirely for a page whose reimported class didn't change)
 * keeps the exact same record reference across rebuilds, while a genuinely changed route's record
 * is a new object that simply never has a cache entry yet. A `WeakMap` (rather than a plain `Map`)
 * lets a superseded record's cache entry die naturally with GC once nothing else references it —
 * no manual invalidation needed, and nothing to clear on `resetContainer()`/
 * `resetExceptApplications()` either, since those drop every reference to the record itself.
 *
 * Keyed a second level deep, per record, by a small context string (`application:globalPrefix:
 * mountPrefix`) — NOT because a route record ordinarily gets reprocessed under more than one
 * context, but because it genuinely can: `WebServerManager.create()`'s rotation window builds a
 * second handler for the SAME Application, from the SAME registry, under the previous
 * `routeHandlerPrefix` (`previousDispatchKey`/`previousRouteHandlerPrefix`), so the identical
 * record object is processed twice, for two different `fullPath`s, in that case. `mountPrefix` is
 * included too since `registerApplicationMount` documents itself as idempotent last-write-wins —
 * an Application's mount prefix is not guaranteed immutable for the life of the process.
 */
const routeCache = new WeakMap<RouteEntry, Map<string, CachedProcessedRoute>>()

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
    const record = allRoutes[storageKey]

    // See `routeCache`'s own doc — a cache hit means this EXACT record object was already
    // processed (and logged) under this EXACT context before, so everything below (recomputing
    // `mountedPath`/`fullPath`/`regex`/param extraction, and `logger.info`) is skipped entirely;
    // only the already-computed result is re-inserted into this call's own `acc`.
    const contextKey = `${application}:${globalPrefix}:${mountPrefix}`
    const cached = routeCache.get(record)?.get(contextKey)

    if (cached) {
      if (cached.bucket === 'absolute') {
        acc.absolutePaths[cached.route] = cached.value
        acc.routePaths.absolute.add(cached.fullPath)
      } else {
        const table = cached.bucket === 'relative' ? acc.relativePaths : acc.catchAllPaths
        table[cached.route] = cached.value
        acc.routePaths.relative.push(cached.relativeRegex)
      }
      return acc
    }

    const { handler, path, interceptors, pipes, httpMethod, guards } = record
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
    // Only about the param's own NAME, at route-DEFINITION time — a `:paramName`'s VALUE (the
    // actual URL segment a caller sends) is a separate, per-REQUEST concern: `getMainHandler`
    // builds its own case-preserved mirror of the REQUEST path, which
    // `payloadAccessorDefinition` (`utils/context.ts`) uses to recover every param's value
    // case-preserved, uniformly across ordinary and catch-all params alike.
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

    let cacheEntry: CachedProcessedRoute

    if (PARAM_PATTERN.test(route)) {
      // Filed into a SEPARATE bucket from an ordinary `:param` route — never together — so
      // `getMainHandler` can try them in a fixed, deterministic order (exact → `:param` →
      // catch-all) regardless of which was registered first. `isCatchAllRoute` checks `fullPath`
      // (no method suffix) — simpler than checking `route`, and equivalent here since a method
      // suffix can never itself introduce or remove a catch-all shape.
      const relativeRegex = pathToRegex(fullPath)
      if (isCatchAllRoute(fullPath)) {
        // Guaranteed to exist and be `params`'s own last entry — `assertValidCatchAllPosition`
        // (registration time, `RouteContainer`) already rejects any route where a catch-all isn't
        // the final segment, so there is no case here where this is undefined.
        const catchAllParam = baseRoute.params[baseRoute.params.length - 1]
        const value = { ...baseRoute, catchAllParam, regex: pathToRegex(route) }
        acc.catchAllPaths[route] = value
        cacheEntry = { bucket: 'catchAll', route, fullPath, value, relativeRegex }
      } else {
        const value = { ...baseRoute, regex: pathToRegex(route) }
        acc.relativePaths[route] = value
        cacheEntry = { bucket: 'relative', route, fullPath, value, relativeRegex }
      }
      acc.routePaths.relative.push(relativeRegex)
    } else {
      acc.absolutePaths[route] = baseRoute
      acc.routePaths.absolute.add(fullPath)
      cacheEntry = { bucket: 'absolute', route, fullPath, value: baseRoute }
    }

    let recordCache = routeCache.get(record)
    if (!recordCache) routeCache.set(record, recordCache = new Map())
    recordCache.set(contextKey, cacheEntry)

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
