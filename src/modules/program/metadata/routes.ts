import type { MiddlewaresContainer } from './middlewares.ts'
import type { TargetContainer } from './targets/main.ts'
import type { MetadataTargetSymbols } from 'typings/program.ts'
import type { HttpMethods, RouteDefinitionProps, RoutesObject } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import { BaseContainer } from './base.ts'
import { cleanRoute } from 'utils/routes.ts'
import { InternalError } from '@zanix/errors'
import { join } from '@std/path'

export class RouteContainer extends BaseContainer {
  #endpointsKey = (key = '') => `endpoints:${key}`
  #methodsKey = (key = '') => `methods:${key}`
  #routesKey = 'routes'

  constructor(private middlewares: MiddlewaresContainer, private targets: TargetContainer) {
    super()
  }

  private getTargetRoutes(
    route: Exclude<RoutesObject[keyof RoutesObject], undefined>,
    Target: ClassConstructor,
    type: WebServerTypes,
  ) {
    const propertyKeys = this.targets.getProperties({ Target })
    const prefix = this.getEndpoint({ Target })

    for (const propertyKey of propertyKeys) {
      const endpoint = this.getEndpoint({ Target, propertyKey })

      const savedPath = cleanRoute(join(prefix, endpoint))

      const { interceptors, pipes, guards } = this.middlewares.getMiddlewares(type, {
        Target,
        propertyKey,
      })

      if (route[savedPath]) {
        const target: object['constructor'] = route[savedPath].handler['Target' as never]
        const targetMessage = target ? ` in "${target.name}"` : ''
        throw new InternalError(
          `Route path "${type}=>${savedPath}" is already defined${targetMessage}. Please ensure that each route has a unique path.`,
          { meta: { source: 'zanix', serverType: type, path: savedPath, target: target?.name } },
        )
      }

      route[savedPath] = {
        handler: { Target, propertyKey },
        methods: this.getHttpMethods({ Target, propertyKey }),
        interceptors: Array.from(interceptors),
        pipes: Array.from(pipes),
        guards: Array.from(guards),
      }
    }
  }

  /**
   * Function to define a route
   */
  public defineRoute(
    type: WebServerTypes,
    definition: RouteDefinitionProps | MetadataTargetSymbols['Target'],
  ) {
    const { path, handler, methods = [], pipes = [], interceptors = [], Target } =
      typeof definition === 'function'
        ? { Target: definition }
        : definition as RouteDefinitionProps & { Target: MetadataTargetSymbols['Target'] }

    const routes = this.getData<RoutesObject>(this.#routesKey) || []

    routes[type] = { ...routes[type] }

    if (Target) this.getTargetRoutes(routes[type], Target, type)

    if (path && handler) {
      routes[type][cleanRoute(path)] = {
        ...routes[type][path],
        handler,
        methods,
        pipes,
        interceptors,
      }
    }

    this.setData<RoutesObject>(this.#routesKey, routes)
  }

  /**
   * Retreives all Routes Object associated with a specific type
   */
  public getRoutes(type: WebServerTypes): RoutesObject[keyof RoutesObject] {
    return this.getData<RoutesObject>(this.#routesKey)?.[type]
  }

  /**
   *  Function to set an endpoint to a specified target or property
   */
  public setEndpoint(
    { Target, propertyKey, endpoint }: MetadataTargetSymbols & { endpoint?: string },
  ) {
    const data = endpoint || propertyKey
    if (!data) return
    this.setData<string>(this.#endpointsKey(propertyKey), data, Target)
  }

  /**
   * Retrieves an endpoint associated with a specific target or property
   */
  public getEndpoint({ Target, propertyKey }: MetadataTargetSymbols): string {
    return this.getData<string | undefined>(this.#endpointsKey(propertyKey), Target) || ''
  }

  /**
   * Function to add an HTTP method to a specified target or property
   */
  public addHttpMethod(method: HttpMethods, { Target, propertyKey }: MetadataTargetSymbols) {
    const methods = this.getHttpMethods({ Target, propertyKey })
    const methodsSet = new Set<HttpMethods>(methods)

    if (!methodsSet.has(method)) methodsSet.add(method)

    this.setData<HttpMethods[]>(this.#methodsKey(propertyKey), Array.from(methodsSet), Target)
  }

  /**
   * Retrieves all HTTP methods associated with a specific target or property
   */
  public getHttpMethods({ Target, propertyKey }: MetadataTargetSymbols): HttpMethods[] {
    return this.getData<HttpMethods[] | undefined>(this.#methodsKey(propertyKey), Target) || []
  }
}
