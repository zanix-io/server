import type { HandlerContext } from './context.ts'
import type { Middlewares } from './middlewares.ts'
import type { MetadataTargetSymbols } from './program.ts'
import type { WebServerTypes } from './server.ts'
import type { ClassConstructor } from './targets.ts'
import type { RtoTypes } from '@zanix/types'

/** Any value a route handler may return: raw data, an array, a string, or a full `Response`. */
export type HandlerResponse =
  | Record<string, unknown>[]
  | Record<string, unknown>
  | string[]
  | number[]
  | boolean[]
  | string
  | Response

/**
 * Represents the allowed HTTP request methods.
 *
 * This type restricts the HTTP methods to commonly used verbs in RESTful APIs.
 *
 * Allowed values:
 * - `'GET'` — Retrieve data from the server.
 * - `'POST'` — Send data to the server to create a resource.
 * - `'PUT'` — Update a resource by replacing it entirely.
 * - `'DELETE'` — Remove a resource from the server.
 * - `'PATCH'` — Partially update a resource.
 * - `'OPTIONS'` — Describe the communication options for the target resource.
 * - `'HEAD'` — Same as GET but only retrieves the headers.
 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'OPTIONS'
  | 'HEAD'

/** The signature every registered route handler is normalized to before being invoked. */
export type HandlerFunction = (
  ctx: HandlerContext,
  // deno-lint-ignore no-explicit-any
  args?: any,
) => Promise<HandlerResponse> | HandlerResponse

export type RouteDefinition = {
  handler:
    | HandlerFunction
    | Required<Omit<MetadataTargetSymbols, 'type'>> & {
      type?: MetadataTargetSymbols['type']
    }
  enableALS?: boolean
  httpMethod?: HttpMethod
} & Partial<Middlewares>

export type ProcessedRouteDefinition =
  & {
    /**
     * The regular expression used to match or filter routes
     */
    regex: RegExp
    /**
     * An array of strings representing the route parameters.
     */
    params: string[]
    /**
     * The name of `params`' own trailing catch-all entry (`:name*`), if this route declares one —
     * always `params`'s own last entry when present (registration-time validation guarantees a
     * catch-all can only ever be the last segment). `undefined` for an ordinary route (no catch-all
     * at all). Used by `routeProcessor`/`getMainHandler` to file this route into the catch-all
     * bucket, tried only after every ordinary `:param` route. `payloadAccessorDefinition` treats
     * every entry in `params` identically regardless of this field — catch-all or not, each reads
     * its value from the request's original, case-preserved pathname the same way.
     */
    catchAllParam?: string
    /**
     * A function that processes or handles route logic.
     */
    handler: HandlerFunction
  }
  & Omit<Required<RouteDefinition>, 'handler'>

export type ProcessedRoutes = Record<string, ProcessedRouteDefinition>

/**
 * The static, serializable subset of a registered REST route's metadata — `path`, `httpMethod`,
 * `application`, and the RTO(s) it validates against, when declared. Everything a build-time
 * consumer (e.g. an OpenAPI generator) can actually introspect from
 * `ProgramModule.routes.getRoutes('rest')` without needing, or being able, to invoke anything —
 * `RouteEntry` (below) is this same shape plus the internal, non-serializable pieces (`handler`,
 * the middleware arrays) that make it the full registration record.
 *
 * @example
 * ```ts
 * const routes = ProgramModule.routes.getRoutes('rest') as Record<string, RestRouteEntry> | undefined
 * for (const [key, route] of Object.entries(routes ?? {})) {
 *   // key is `${application}:${path}/${httpMethod}`
 *   console.log(route.path, route.httpMethod, route.rto)
 * }
 * ```
 *
 * @category routing
 */
export type RestRouteEntry = {
  httpMethod: HttpMethod
  path: string
  /**
   * The Application this route was registered under — persisted, static metadata captured
   * once at registration time from whichever `ApplicationContainer.define(...)` composition
   * scope was active (or `DEFAULT_APPLICATION` if none was). Never re-derived afterward.
   */
  application: string
  /**
   * The RTO(s) this route validates against (`Body`/`Params`/`Search`), when declared via
   * the method decorator's `rto` option — `undefined` for a route with none. Persisted here
   * purely for static introspection (e.g. an OpenAPI generator); the runtime validation
   * pipeline never reads this field — it already captured `rto` directly in its own
   * validation-pipe closure at decoration time
   * (`defineControllerMethodDecorator`/`requestValidationPipe`), unaffected by this field.
   */
  rto?: RtoTypes
}

/** One registered route's persisted metadata — `RoutesObject`'s own entry shape, keyed there by
 * `` `${application}:${path}/${httpMethod}` ``. Internal — `handler` (a live function reference)
 * and the middleware arrays are never part of `RestRouteEntry`'s public, serializable subset. */
export type RouteEntry = RestRouteEntry & {
  handler: RouteDefinition['handler']
} & Middlewares

export type RoutesObject = Partial<
  Record<
    WebServerTypes,
    Record<string, RouteEntry>
  >
>

export type RouteDefinitionProps = RouteDefinition & { path?: string }

/**
 * `ProgramModule.routes`'s own accessor shape — read-only introspection over persisted route
 * metadata, never mutation (unlike `RouteContainer` itself, which also owns `defineRoute`/
 * `removeRoutesForTarget`/etc. — framework-internal composition primitives this accessor
 * deliberately does not expose). See {@link RestRouteEntry}'s own doc/example for the full
 * contract of what a resolved entry looks like.
 */
export interface ZanixRoutesGetter {
  /**
   * Returns the persisted route metadata for one {@link WebServerTypes}, keyed by
   * `` `${application}:${path}/${httpMethod}` `` — `undefined` if nothing has been registered for
   * that type yet. See {@link RestRouteEntry}'s own doc/example for the full contract of what a
   * resolved entry looks like.
   */
  getRoutes(type: WebServerTypes): Record<string, RestRouteEntry> | undefined
  /**
   * Whether `Target` currently owns at least one live route entry — a plain, read-only existence
   * check. Lets a caller that tracks its own "did I already register this class" bookkeeping (a
   * dev-server's re-import cache, for instance) tell a still-correct registration apart from one
   * that was removed by something else since (e.g. a hot-uninstall the caller has no other way to
   * observe).
   *
   * @param type - Restricts the check to one {@link WebServerTypes}; every type is checked when
   * omitted.
   * @returns `false` for a `Target` with no routes registered at all — never throws.
   */
  hasRoutesForTarget(Target: ClassConstructor, type?: WebServerTypes): boolean
}
