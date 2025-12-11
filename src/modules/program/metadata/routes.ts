import type { MiddlewaresContainer } from './middlewares.ts'
import type { TargetContainer } from './targets/main.ts'
import type { MetadataTargetSymbols } from 'typings/program.ts'
import type { HttpMethod, RouteDefinitionProps, RoutesObject } from 'typings/router.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import { BaseContainer } from './base.ts'
import { cleanRoute } from 'utils/routes.ts'
import { InternalError } from '@zanix/errors'
import { join } from '@std/path'

export class RouteContainer extends BaseContainer {
  #endpointsKey = (key = '') => `endpoints:${key}`
  #routesKey = 'routes'

  constructor(private middlewares: MiddlewaresContainer, private targets: TargetContainer) {
    super()
  }

  private defineTargetRoutes(
    route: Exclude<RoutesObject[keyof RoutesObject], undefined>,
    Target: ClassConstructor,
    type: WebServerTypes,
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
          `Route path "${type}=>${path}" is already defined${targetMessage}. Please ensure that each route is assigned a unique path.`,
          { meta: { source: 'zanix', serverType: type, path, target: target?.name, httpMethod } },
        )
      }

      route[fullPath] = {
        path,
        httpMethod,
        handler: { Target, propertyKey },
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
    const { path, handler, httpMethod = 'GET', pipes = [], interceptors = [], Target } =
      typeof definition === 'function'
        ? { Target: definition }
        : definition as RouteDefinitionProps & { Target: MetadataTargetSymbols['Target'] }

    const routes = this.getData<RoutesObject>(this.#routesKey) || []

    routes[type] = { ...routes[type] }

    if (Target) this.defineTargetRoutes(routes[type], Target, type)
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
   *  Function to set an endpoint to a specified target or property
   */
  public setEndpoint(
    { Target, propertyKey, endpoint, httpMethod }: MetadataTargetSymbols & {
      endpoint?: string
      httpMethod?: HttpMethod
    },
  ) {
    const data = { endpoint: endpoint ?? propertyKey ?? '', httpMethod }
    if (!data) return

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
