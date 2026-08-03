import type { MiddlewaresContainer } from './middlewares.ts'
import type { TargetContainer } from './targets/main.ts'
import type { ApplicationContainer } from './application.ts'
import type { BootSessionContainer } from './session.ts'
import type { MetadataTargetSymbols } from 'typings/program.ts'
import type { HttpMethod, RouteDefinitionProps, RoutesObject } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import { BaseContainer } from './base.ts'
import { InternalError } from '@zanix/errors'
import { join } from '@std/path'
import { cleanRoute } from '@zanix/helpers'

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
      const { endpoint, httpMethod = 'GET' } = this.getEndpoint({ Target, propertyKey })

      const path = prefix === '' && endpoint === '' ? '' : cleanRoute(join(prefix, endpoint))
      const fullPath = `${path}/${httpMethod}`

      const { interceptors, pipes, guards } = this.middlewares.getMiddlewares(type, {
        Target,
        propertyKey,
      })

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
      : definition as RouteDefinitionProps & { Target: MetadataTargetSymbols['Target'] }

    const application = applicationOverride ?? this.applications.getCurrent()
    this.sessions.recordApplication(application)

    const routes = this.getData<RoutesObject>(this.#routesKey) || []

    routes[type] = { ...routes[type] }

    if (Target) this.defineTargetRoutes(routes[type], Target, type, application)
    if (path && handler) {
      const cleanPath = cleanRoute(path)
      const fullPath = `${cleanPath}/${httpMethod}`
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
   * Retreives all Routes Object associated with a specific server type
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
        if (!preserve.has(byPath[fullPath].application)) delete byPath[fullPath]
      }
    }

    this.setData<RoutesObject>(this.#routesKey, routes)
  }

  /**
   *  Function to set an endpoint to a specified target or property
   */
  public setEndpoint(
    { Target, propertyKey, endpoint, httpMethod }: MetadataTargetSymbols & {
      endpoint?: string
      httpMethod?: HttpMethod
    },
  ) {
    const data = { endpoint: endpoint ?? propertyKey ?? '', httpMethod }

    this.setData<{ endpoint: string; httpMethod?: HttpMethod }>(
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
  ): { endpoint: string; httpMethod?: HttpMethod } {
    return this.getData<{ endpoint: string; httpMethod?: HttpMethod }>(
      this.#endpointsKey(propertyKey),
      Target,
    ) || { endpoint: '' }
  }
}
