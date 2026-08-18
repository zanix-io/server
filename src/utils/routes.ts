import type { ProcessedRoutes } from 'typings/router.ts'
import { HTTPMETHODS_WITHOUT_BODY, JSON_CONTENT_HEADER } from './constants.ts'
import { cleanRoute } from '@zanix/helpers'
import { InternalError } from '@zanix/errors'

/** Function to get prefix */
export const getPrefix = (globalPrefix: string) => {
  const path = cleanRoute(globalPrefix)
  const end = path.indexOf('/', 1)
  return end === -1 ? path.slice(1) : path.slice(1, end)
}

/**
 * Matches a trailing catch-all segment (`:name` followed by a literal star) — a named param
 * immediately followed by that star, itself immediately followed by either another path separator
 * (the mechanically-appended method suffix `routeProcessor` adds — see its own doc) or the end of
 * the string. That lookahead, not a literal end-of-string anchor, is what lets this SAME pattern
 * match both the bare route path (e.g. `assets` + `:path` + star) and the method-suffixed storage
 * key (the same, plus a trailing `GET`/etc.) without this module needing to know anything about
 * HTTP method names — {@linkcode assertValidCatchAllPosition} is what actually guarantees, at
 * registration time, that nothing else could legitimately follow a catch-all segment.
 */
const CATCH_ALL_SEGMENT = /\/:([a-zA-Z0-9_-]+)\*(?=\/|$)/

/** Same shape as a real catch-all segment, but anchored to the end of a route SEGMENT (not the
 * whole string) — used by {@linkcode assertValidCatchAllPosition} to scan a route's own segments
 * one at a time, and by {@linkcode isCatchAllRoute} to classify an already-assembled route. */
const CATCH_ALL_SEGMENT_SHAPE = /^:[a-zA-Z0-9_-]+\*$/

/**
 * Throws if `path` uses the catch-all marker (`:name` plus a trailing star) anywhere other than
 * its own last segment — e.g. a catch-all followed by another literal segment is rejected, while
 * `assets` + `:path` + star (as the final segment) is not. Called at ROUTE REGISTRATION time
 * (`RouteContainer.defineTargetRoutes`/`defineRoute`), before this path ever reaches
 * {@linkcode pathToRegex}/`routeProcessor` — fail-fast, same posture this ecosystem's own
 * `validate()`/`normalize()` steps already take elsewhere, never a confusing failure the first
 * time a request happens to reach this route.
 *
 * @param path The route path exactly as assembled from the author's own route declaration (prefix
 * + endpoint), BEFORE any HTTP-method suffix is appended.
 * @throws {InternalError} If a catch-all-shaped segment exists anywhere but last.
 */
export function assertValidCatchAllPosition(path: string): void {
  const segments = path.split('/').filter(Boolean)
  for (let i = 0; i < segments.length; i++) {
    if (
      CATCH_ALL_SEGMENT_SHAPE.test(segments[i]) && i !== segments.length - 1
    ) {
      throw new InternalError(
        `Catch-all route parameter "${segments[i]}" must be the last segment of route path ` +
          `"${path}" — a catch-all (":name*") can only appear at the very end (e.g. ` +
          `"/assets/:path*"), never followed by additional segments.`,
        { meta: { source: 'zanix', path, segment: segments[i] } },
      )
    }
  }
}

/** Whether `path` (a route path, with or without a trailing `/METHOD` suffix) ends in a catch-all
 * segment — used by `routeProcessor` to file a route into the catch-all bucket instead of the
 * ordinary `:param` one (see that module's own doc for why the two are kept separate: deterministic
 * exact → param → catch-all precedence, independent of registration order). */
export function isCatchAllRoute(path: string): boolean {
  return CATCH_ALL_SEGMENT.test(path)
}

/**
 * Function to convert dynamic routes into regular expressions.
 *
 * A trailing catch-all segment (`:name*`) becomes `(/.+)` — greedy, crosses `/` — instead of the
 * single-segment `(/[a-zA-Z0-9_.%-]+)` an ordinary `:name` becomes; this substitution runs BEFORE
 * the ordinary one so the ordinary pattern (which excludes `*` from its own character class) never
 * sees a dangling, unescaped `*` left over to misinterpret as a regex quantifier.
 *
 * The `'d'` flag is always added — it changes nothing about matching itself, only makes
 * `match.indices` available on a successful `.exec()` (per-capture-group `[start, end]` offsets),
 * which is what lets a catch-all's own captured value be re-sliced from the request's ORIGINAL,
 * case-preserved pathname elsewhere (`getMainHandler`), without matching case-insensitively itself
 * or affecting any other route.
 */
export const pathToRegex = (path: string) => {
  const withCatchAll = path.replace(CATCH_ALL_SEGMENT, '(/.+)')
  // Ensure all route paths are URL-encoded to prevent errors with special characters.
  return new RegExp(
    '^' +
      withCatchAll.replace(/\/:([a-zA-Z0-9_-]+)/g, '(\/[a-zA-Z0-9_\.%-]+)') +
      '$',
    'd',
  )
}

/** Function to get param names from string */
export const getParamNames = (route: string) => {
  const params: string[] = []
  let start = 0

  for (let i = 0; i <= route.length; i++) {
    if (i === route.length || route[i] === '/') {
      const segment = route.slice(start, i)
      if (segment.startsWith(':')) {
        // Remove leading ':', possible '?', and possible trailing '*' (catch-all marker).
        const param = segment.slice(1).replace('?', '').replace('*', '')
        params.push(param)
      }
      start = i + 1
    }
  }

  return params
}

/** Body payload property */
export const bodyPayloadProperty = async (
  req: Request,
): Promise<unknown> => {
  let computedBody: unknown
  const method = req.method
  if (HTTPMETHODS_WITHOUT_BODY.has(method)) return computedBody

  const contentType = req.headers.get('Content-Type')

  try {
    if (
      contentType && contentType.includes(JSON_CONTENT_HEADER['Content-Type'])
    ) {
      computedBody = await req.json()
    } else if (
      contentType && contentType.includes('application/x-www-form-urlencoded')
    ) {
      computedBody = await req.formData()
    }
  } catch {
    return computedBody
  }

  return computedBody
}

/** An empty route table, shared — what {@linkcode bucketRoutesByMethod} lookups fall back to for a
 * method no route was ever registered under. Frozen so a caller cannot accidentally populate the
 * shared instance. */
export const EMPTY_ROUTES: ProcessedRoutes = Object.freeze({}) as ProcessedRoutes

/**
 * Splits a processed route table into one bucket per HTTP method.
 *
 * `findMatchingRoute` is a linear scan: it runs every route's regex until one matches. Because a
 * route's storage key (and therefore its regex) ends in that route's own method suffix, a `GET`
 * request was previously running the regex of every `POST`, `PUT`, `PATCH` and `DELETE` route in
 * the application before reaching its own — work that could never match. Bucketing first makes the
 * scan cover only the routes whose method the request actually uses.
 *
 * Called ONCE, when `getMainHandler` builds its dispatch table, never per request. The buckets
 * hold the same route objects as the source table (no copies), and a request whose method has no
 * bucket at all resolves to {@linkcode EMPTY_ROUTES}, which scans nothing and reports no match —
 * exactly what scanning the full table and matching nothing already did, so 404/405 handling is
 * unchanged.
 *
 * Measured on the reference machine, comparing both variants interleaved in one process: 5-7x
 * faster matching for a 50- or 200-route table spread over five methods, and within noise (one
 * extra property lookup) for a single-method table, where every route lands in the same bucket.
 */
export const bucketRoutesByMethod = (
  routes: ProcessedRoutes,
): Record<string, ProcessedRoutes> => {
  const buckets: Record<string, ProcessedRoutes> = {}
  for (const key in routes) {
    const bucket = buckets[routes[key].httpMethod] ??= {} as ProcessedRoutes
    bucket[key] = routes[key]
  }
  return buckets
}

/**
 * A function to find a matching route by path
 * @param relativeRoutes
 * @param path
 * @returns
 */
export const findMatchingRoute = (
  relativeRoutes: ProcessedRoutes,
  path: string,
) => {
  for (const key in relativeRoutes) {
    const route = relativeRoutes[key]
    const match = route.regex.exec(path)

    if (match) return { route, match }
  }
}
