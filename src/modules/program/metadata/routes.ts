import type { MiddlewaresContainer } from './middlewares.ts'
import type { TargetContainer } from './targets/main.ts'
import type { ApplicationContainer } from './application.ts'
import type { BootSessionContainer } from './session.ts'
import type { MetadataTargetSymbols } from 'typings/program.ts'
import type { HttpMethod, RouteDefinitionProps, RoutesObject } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { ClassConstructor } from 'typings/targets.ts'
import type { RtoTypes } from '@zanix/types'

import { BaseContainer } from './base.ts'
import { InternalError } from '@zanix/errors'
import { join } from '@std/path'
import { cleanRoute } from '@zanix/helpers'
import { assertValidCatchAllPosition } from 'utils/routes.ts'

export class RouteContainer extends BaseContainer {
  #endpointsKey = (key = '') => `endpoints:${key}`
  #routesKey = 'routes'

  constructor(
    private middlewares: MiddlewaresContainer,
    private targets: TargetContainer,
    private applications: ApplicationContainer,
    private sessions: BootSessionContainer,
  ) {
    super()
  }

  private defineTargetRoutes(
    route: Exclude<RoutesObject[keyof RoutesObject], undefined>,
    Target: ClassConstructor,
    type: WebServerTypes,
    application: string,
  ) {
    const propertyKeys = this.targets.getProperties({ Target })
    const { endpoint: prefix } = this.getEndpoint({ Target })

    for (const propertyKey of propertyKeys) {
      const { endpoint, httpMethod = 'GET', rto } = this.getEndpoint({
        Target,
        propertyKey,
      })

      // Case-PRESERVED (`keepCase: true`) — a `:paramName` placeholder's own casing must survive
      // all the way to `routeProcessor` (`helpers/routes.ts`), which is the one place that
      // extracts param NAMES for `ctx.payload.params` — losing it here (as `cleanRoute`'s own
      // default lowercasing would) means a `:serviceId` param can only ever be read back under the
      // key `serviceid`. `fullPath` below still does case-INsensitive collision detection via its
      // own explicit `.toLowerCase()`, so two literally-different-cased paths still correctly
      // collide exactly as before this change — only the STORED `path` itself changed.
      const path = prefix === '' && endpoint === '' ? '' : cleanRoute(join(prefix, endpoint), true)
      // Fail fast, at registration time — never the first time a request happens to reach this
      // route. See `assertValidCatchAllPosition`'s own doc for exactly what's rejected.
      assertValidCatchAllPosition(path)
      // `application` participates in the uniqueness key (not just as stored metadata) — two
      // different Applications registering the same path/method no longer collide.
      // `routeProcessor` (`helpers/routes.ts`) strips this prefix back out before it ever reaches
      // a dispatch path, and resolves the Application's own mount prefix separately.
      const fullPath = `${application}:${path.toLowerCase()}/${httpMethod}`

      const { interceptors, pipes, guards } = this.middlewares.getMiddlewares(
        type,
        {
          Target,
          propertyKey,
        },
      )

      if (route[fullPath]) {
        const target: object['constructor'] = route[fullPath].handler['Target' as never]
        const methodMessage = type === 'rest' ? ` for HTTP "${httpMethod}"` : ''
        const targetMessage = target ? ` in "${target.name}"${methodMessage}` : `${methodMessage}`
        throw new InternalError(
          `Route path "${type}=>${path}" is already defined${targetMessage} (Application ` +
            `"${
              route[fullPath].application
            }"). Please ensure that each route is assigned a unique path.`,
          {
            meta: {
              source: 'zanix',
              serverType: type,
              path,
              target: target?.name,
              httpMethod,
              application: route[fullPath].application,
            },
          },
        )
      }

      route[fullPath] = {
        path,
        httpMethod,
        handler: { Target, propertyKey },
        interceptors: Array.from(interceptors),
        pipes: Array.from(pipes),
        guards: Array.from(guards),
        application,
        rto,
      }
    }
  }

  /**
   * Registers a route. The Application it belongs to is never a caller-supplied option for
   * ordinary (decorator-driven) registration — it's resolved automatically from whichever
   * `ApplicationContainer.define(...)` composition scope is active right now (or
   * `DEFAULT_APPLICATION` if none is), and persisted onto the route's own record as ordinary
   * metadata the instant this call runs. See `ApplicationContainer`'s own doc.
   *
   * @param applicationOverride Internal-only escape hatch for the one legitimate case where a
   * route is registered *after* composition has finished, outside any `define(...)` scope (the
   * GraphQL POST endpoint itself, registered lazily at `bootstrapServers()`/Runtime-activation
   * time by `getMainHandler` — see its own comment). Never set this from decorator code.
   */
  public defineRoute(
    type: WebServerTypes,
    definition: RouteDefinitionProps | MetadataTargetSymbols['Target'],
    applicationOverride?: string,
  ) {
    const {
      path,
      handler,
      httpMethod = 'GET',
      pipes = [],
      interceptors = [],
      guards = [],
      Target,
    } = typeof definition === 'function'
      ? { Target: definition }
      : definition as RouteDefinitionProps & {
        Target: MetadataTargetSymbols['Target']
      }

    const application = applicationOverride ?? this.applications.getCurrent()
    this.sessions.recordApplication(application)

    const routes = this.getData<RoutesObject>(this.#routesKey) || []

    routes[type] = { ...routes[type] }

    if (Target) {
      this.defineTargetRoutes(routes[type], Target, type, application)
    }
    if (path && handler) {
      // Case-preserved, same reasoning as `defineTargetRoutes`'s own `path` above.
      const cleanPath = cleanRoute(path, true)
      // Fail fast, same reasoning as `defineTargetRoutes`'s own call.
      assertValidCatchAllPosition(cleanPath)
      // Same key-format change as `defineTargetRoutes` (see its own comment) — applied here too
      // for consistency: without this, a raw-object registration (this escape-hatch branch) and
      // a decorated-Target registration for the identical `application`+path+httpMethod would
      // silently occupy two UNRELATED keys instead of one, defeating collision detection between
      // the two registration styles. `.toLowerCase()` keeps that collision check case-insensitive,
      // same as before this change — only the STORED `cleanPath` itself is now case-preserved.
      const fullPath = `${application}:${cleanPath.toLowerCase()}/${httpMethod}`
      routes[type][fullPath] = {
        ...routes[type][fullPath],
        path: cleanPath,
        handler,
        httpMethod,
        pipes,
        interceptors,
        guards,
        application,
      }
    }

    this.setData<RoutesObject>(this.#routesKey, routes)
  }

  /**
   * Retrieves all Routes Object associated with a specific server type
   */
  public getRoutes(type: WebServerTypes): RoutesObject[keyof RoutesObject] {
    return this.getData<RoutesObject>(this.#routesKey)?.[type]
  }

  /**
   * Removes every route (of every server type) EXCEPT those whose `application` is in `preserve`
   * — unlike the inherited `resetContainer()`, which wipes the entire registry unconditionally.
   * Used by `finalize` cleanup, given the Applications a DIFFERENT, still-in-flight boot session
   * (see `BootSessionContainer.getForeignActiveApplications`) currently owns, so an independent,
   * temporally-overlapping session's not-yet-served routes survive. Deliberately still able to
   * remove routes for an Application THIS call never itself served — the existing multi-call
   * pattern (an `'admin'`-Application server followed by the default Application's, `finalize:false`
   * then `finalize:true`) depends on the LAST call sweeping every Application touched earlier in the
   * SAME sequence, not just its own; `preserve` only ever contains OTHER sessions' Applications.
   */
  public resetExceptApplications(preserve: Set<string>): void {
    const routes = this.getData<RoutesObject>(this.#routesKey)
    if (!routes) return

    for (const type of Object.keys(routes) as WebServerTypes[]) {
      const byPath = routes[type]
      if (!byPath) continue
      for (const fullPath of Object.keys(byPath)) {
        if (!preserve.has(byPath[fullPath].application)) {
          delete byPath[fullPath]
        }
      }
    }

    this.setData<RoutesObject>(this.#routesKey, routes)
  }

  /**
   * Removes every route entry registered for `Target` — across every server type, or only `type`
   * if given. Unlike `resetExceptApplications` (which sweeps by Application, for boot-cycle
   * cleanup), this targets a single decorated class, for lazy re-registration flows that run
   * OUTSIDE the ordinary boot cycle — e.g. a dev-server that reimports a decorated class as a
   * fresh module instance after a file change and must deregister the previous registration
   * first, since `defineTargetRoutes` throws on a path+method collision otherwise. Routes
   * registered through the raw `{path, handler}` escape hatch (no `Target`, see `defineRoute`'s
   * own doc) are never matched here — there's no class identity to filter by.
   *
   * Never call this from decorator code or ordinary request handling — it exists for
   * framework-internal/tooling use only.
   *
   * @returns The number of route entries removed (`0` if `Target` had none registered).
   */
  public removeRoutesForTarget(
    Target: ClassConstructor,
    type?: WebServerTypes,
  ): number {
    const routes = this.getData<RoutesObject>(this.#routesKey)
    if (!routes) return 0

    let removed = 0
    const types = type ? [type] : (Object.keys(routes) as WebServerTypes[])

    for (const t of types) {
      const byPath = routes[t]
      if (!byPath) continue
      for (const fullPath of Object.keys(byPath)) {
        const { handler } = byPath[fullPath]
        if (typeof handler !== 'function' && handler.Target === Target) {
          delete byPath[fullPath]
          removed++
        }
      }
    }

    if (removed) this.setData<RoutesObject>(this.#routesKey, routes)
    return removed
  }

  /**
   * Whether `Target` currently owns at least one live route entry — a plain, read-only existence
   * check, never mutating anything. Lets a caller that tracks its own "did I already register
   * this class" bookkeeping (a dev-server's re-import cache, for instance) tell a still-correct
   * registration apart from one that was removed by something ELSE since — e.g.
   * `removeRoutesForTarget`/`removeRoutesForApplication` above, called by an unrelated hot
   * uninstall/reinstall cycle the caller's own bookkeeping has no way to observe directly.
   *
   * @returns `false` for a `Target` with no routes registered at all (never registered, or fully
   * removed since) — never throws.
   */
  public hasRoutesForTarget(
    Target: ClassConstructor,
    type?: WebServerTypes,
  ): boolean {
    const routes = this.getData<RoutesObject>(this.#routesKey)
    if (!routes) return false

    const types = type ? [type] : (Object.keys(routes) as WebServerTypes[])
    for (const t of types) {
      const byPath = routes[t]
      if (!byPath) continue
      for (const fullPath of Object.keys(byPath)) {
        const { handler } = byPath[fullPath]
        if (typeof handler !== 'function' && handler.Target === Target) return true
      }
    }
    return false
  }

  /**
   * Removes every route entry (across every server type) whose `application` equals `application`
   * — the metadata-level half of hot-uninstalling one Zanix App while every other Application
   * (host or sibling app) keeps serving. Deliberately narrower than `resetExceptApplications`
   * (which needs the caller to enumerate every OTHER Application in the process to `preserve`, and
   * silently wipes anything it forgets to list) — this only ever touches `application`'s own
   * entries, so a caller that only tracks ONE app's own name can safely call it without knowing
   * about the host's own default/admin Application or any other sibling app.
   *
   * This alone does not stop an already-bound `Deno.serve()` listener from serving that
   * Application's routes — `getMainHandler` compiles its own route table once, at
   * `WebServerManager.create()` time, and never re-reads this registry afterward. Pair this with
   * `WebServerManager.unmount()` to also drop the live dispatch entry.
   *
   * @returns The number of route entries removed (`0` if `application` had none registered).
   */
  public removeRoutesForApplication(application: string): number {
    const routes = this.getData<RoutesObject>(this.#routesKey)
    if (!routes) return 0

    let removed = 0
    for (const type of Object.keys(routes) as WebServerTypes[]) {
      const byPath = routes[type]
      if (!byPath) continue
      for (const fullPath of Object.keys(byPath)) {
        if (byPath[fullPath].application === application) {
          delete byPath[fullPath]
          removed++
        }
      }
    }

    if (removed) this.setData<RoutesObject>(this.#routesKey, routes)
    return removed
  }

  /**
   *  Function to set an endpoint to a specified target or property
   */
  public setEndpoint(
    { Target, propertyKey, endpoint, httpMethod, rto }: MetadataTargetSymbols & {
      endpoint?: string
      httpMethod?: HttpMethod
      rto?: RtoTypes
    },
  ) {
    const data = { endpoint: endpoint ?? propertyKey ?? '', httpMethod, rto }

    this.setData<{ endpoint: string; httpMethod?: HttpMethod; rto?: RtoTypes }>(
      this.#endpointsKey(propertyKey),
      data,
      Target,
    )
  }

  /**
   * Retrieves an endpoint associated with a specific target or property
   */
  public getEndpoint(
    { Target, propertyKey }: MetadataTargetSymbols,
  ): { endpoint: string; httpMethod?: HttpMethod; rto?: RtoTypes } {
    return this.getData<{ endpoint: string; httpMethod?: HttpMethod; rto?: RtoTypes }>(
      this.#endpointsKey(propertyKey),
      Target,
    ) || { endpoint: '' }
  }
}
