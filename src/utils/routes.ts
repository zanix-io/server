import type { ProcessedRoutes } from 'typings/router.ts'
import {
  DEFAULT_MAX_BODY_BYTES,
  HTTPMETHODS_WITHOUT_BODY,
  JSON_CONTENT_HEADER,
} from './constants.ts'
import { assertContentLengthWithinLimit, cleanRoute, readBoundedStream } from '@zanix/helpers'
import { ApplicationError, HttpError, InternalError } from '@zanix/errors'

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

/** The two size-limit codes {@linkcode assertContentLengthWithinLimit}/{@linkcode readBoundedStream}
 * (`@zanix/helpers`) throw as `ApplicationError` — the only ones this module converts into its own
 * `HttpError('PAYLOAD_TOO_LARGE')`. Any other error (a genuinely unexpected failure, not a size-limit
 * rejection) propagates unmodified instead of being mislabeled as one. */
const BODY_SIZE_LIMIT_CODES = new Set([
  'UTILS_NETWORK_CONTENT_LENGTH_TOO_LARGE',
  'UTILS_NETWORK_BODY_TOO_LARGE',
])

function payloadTooLargeError(maxBytes: number, id?: string): HttpError {
  return new HttpError('PAYLOAD_TOO_LARGE', {
    id,
    message: `Request body exceeds the ${maxBytes}-byte limit`,
  })
}

/**
 * Reads `req`'s body into raw text, rejecting (`HttpError('PAYLOAD_TOO_LARGE')`) once it exceeds
 * `maxBytes` — enforced by counting REAL bytes as the stream itself arrives
 * ({@linkcode readBoundedStream}, `@zanix/helpers`), not by trusting `Content-Length` alone: a
 * client can omit that header, lie about it, or send more than it declared under
 * `Transfer-Encoding: chunked`. The {@linkcode assertContentLengthWithinLimit} check still runs
 * FIRST though — it rejects an honest oversized request without reading a single byte of it.
 *
 * Both helpers throw a plain, framework-neutral `ApplicationError` (`@zanix/errors`), never this
 * package's own `HttpError` — only the two size-limit codes they can actually produce
 * ({@linkcode BODY_SIZE_LIMIT_CODES}) are converted into `HttpError('PAYLOAD_TOO_LARGE')` here; any
 * other error propagates unmodified rather than being mislabeled as a size-limit rejection.
 */
async function readBodyText(req: Request, maxBytes: number, id?: string): Promise<string> {
  if (!req.body) return ''

  try {
    assertContentLengthWithinLimit(req.headers.get('Content-Length'), maxBytes)
    const bytes = await readBoundedStream(req.body, maxBytes)
    return new TextDecoder().decode(bytes)
  } catch (error) {
    if (error instanceof ApplicationError && error.code && BODY_SIZE_LIMIT_CODES.has(error.code)) {
      // `readBoundedStream` already cancels its own reader the instant it rejects for an
      // over-limit BODY (UTILS_NETWORK_BODY_TOO_LARGE) — but an over-limit CONTENT-LENGTH
      // (UTILS_NETWORK_CONTENT_LENGTH_TOO_LARGE) is rejected by `assertContentLengthWithinLimit`
      // BEFORE `readBoundedStream` ever acquires a reader, so `req.body` itself is still open at
      // that point. Cancel it here — best-effort, same as every other cleanup on this path — so an
      // honest-Content-Length rejection releases the underlying stream just as reliably as an
      // actual-bytes rejection does, instead of leaving it dangling.
      await req.body?.cancel().catch(() => {})
      throw payloadTooLargeError(maxBytes, id)
    }
    throw error
  }
}

/**
 * Body payload property.
 *
 * @param req The incoming request.
 * @param id Request id, attached to a size-limit `HttpError` the same way every other
 *   framework-owned rejection in this pipeline carries one.
 * @param maxBodyBytes Rejects the request (413) once its body exceeds this many bytes — see
 *   {@linkcode readBodyText}. Defaults to {@linkcode DEFAULT_MAX_BODY_BYTES}.
 */
export const bodyPayloadProperty = async (
  req: Request,
  id?: string,
  maxBodyBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> => {
  let computedBody: unknown
  const method = req.method
  if (HTTPMETHODS_WITHOUT_BODY.has(method)) return computedBody

  const contentType = req.headers.get('Content-Type')

  try {
    if (
      contentType && contentType.includes(JSON_CONTENT_HEADER['Content-Type'])
    ) {
      const text = await readBodyText(req, maxBodyBytes, id)
      computedBody = text ? JSON.parse(text) : undefined
    } else if (
      contentType && contentType.includes('application/x-www-form-urlencoded')
    ) {
      const text = await readBodyText(req, maxBodyBytes, id)
      const formData = new FormData()
      for (const [key, value] of new URLSearchParams(text)) {
        formData.append(key, value)
      }
      computedBody = formData
    }
  } catch (error) {
    // A real size-limit rejection must reach the client as a 413 — only a malformed body (bad
    // JSON, etc.) is swallowed to `undefined`, same as before this function enforced any limit.
    if (error instanceof HttpError) throw error
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
 * Compares two route keys (a `fullPath` — or a `fullPath` plus its `/METHOD` suffix, both compare
 * identically — split on `/`) segment by segment, from the root, and reports which one is more
 * SPECIFIC — the same "static sibling beats dynamic sibling" precedence every mature router
 * resolves this way, independent of registration order.
 *
 * At the first segment index where the two routes disagree on shape, a literal segment (doesn't
 * start with `:`) always outranks a `:param`/`:name*` segment — that one difference decides the
 * whole comparison, regardless of anything before or after it. Two routes that never disagree in
 * shape over their shared-length prefix (both literal-vs-literal at every differing text, or both
 * `:param`-shaped at every differing position) fall through to preferring the route with MORE
 * segments — a longer, more deeply literal path is a reasonable default tie-break, and matters in
 * practice once a catch-all (`:name*`) is involved: `/:lang/blog/:slug*` has a longer literal
 * prefix than `/:x*` and must be tried first even though neither disagrees in shape before the
 * shorter one runs out of segments.
 *
 * Returns a standard `Array.prototype.sort` comparator value: negative when `a` is more specific
 * (sorts first), positive when `b` is (sorts first), `0` for a genuine tie — in which case
 * {@linkcode sortBySpecificity}'s caller relies on `Array.prototype.sort`'s guaranteed stability to
 * preserve original registration order, exactly like today's behavior for two routes this
 * comparator truly cannot distinguish.
 *
 * @param a One route key.
 * @param b The other route key.
 */
export function compareRouteSpecificity(a: string, b: string): number {
  const segmentsA = a.split('/')
  const segmentsB = b.split('/')
  const sharedLength = Math.min(segmentsA.length, segmentsB.length)

  for (let i = 0; i < sharedLength; i++) {
    const isParamA = segmentsA[i].startsWith(':')
    const isParamB = segmentsB[i].startsWith(':')
    if (isParamA !== isParamB) return isParamA ? 1 : -1
  }

  return segmentsB.length - segmentsA.length
}

/**
 * Reinserts every entry of `routes` in specificity order (most specific first — see
 * {@linkcode compareRouteSpecificity}), so the naive `for...in` scan {@linkcode findMatchingRoute}
 * performs (and, before it, {@linkcode bucketRoutesByMethod}'s own re-bucketing, which itself
 * preserves whatever order it's handed) tries a literal sibling before a `:param` sibling at the
 * same depth — regardless of which was registered/discovered first.
 *
 * A plain-object rebuild rather than an in-place mutation: iteration order for a plain object's
 * string keys follows insertion order, so a fresh object built by inserting keys in the already-
 * sorted sequence is what actually changes iteration order — reassigning keys on the existing
 * object would not reorder anything already present.
 *
 * `routeProcessor` calls this once per bucket (`relativePaths`/`catchAllPaths`), only on its
 * return path — the `routeCache`/`WeakMap` memoization that skips recomputing a route's own regex/
 * params on an unchanged rebuild is untouched by this: it caches per-record processing results, not
 * final bucket order, so this reordering step runs fresh every call, cheaply, over however many
 * routes ended up in that bucket.
 */
export function sortBySpecificity(routes: ProcessedRoutes): ProcessedRoutes {
  const sortedKeys = Object.keys(routes).sort(compareRouteSpecificity)
  const sorted: ProcessedRoutes = {}
  for (const key of sortedKeys) sorted[key] = routes[key]
  return sorted
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
