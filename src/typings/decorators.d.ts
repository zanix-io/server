// deno-lint-ignore-file ban-types
import type { RtoTypes } from '@zanix/types'

declare global {
  type ZanixClassDecorator = (Target: ClassConstructor, context?: ClassDecoratorContext) => void

  type ZanixFunctionDecorator = (
    method: Function,
    context?: DecoratorContext,
  ) => void

  type ZanixMethodDecorator = (
    method: Function,
    context?: ClassMethodDecoratorContext,
  ) => void

  type ZanixGenericDecorator = (
    Target: ClassConstructor | Function,
    context?: ClassDecoratorContext | ClassMethodDecoratorContext,
  ) => void

  type HandlerDecoratorOptions =
    | string
    | {
      prefix?: string
      Interactor?: ZanixInteractorClass
    }

  type SocketDecoratorOptions =
    | string
    | {
      route: string
      /** Rto to validate socket event data on message (Body) and request search or params */
      rto?: RtoTypes | RtoTypes['Body']
      Interactor?: ZanixInteractorClass
    }

  type InteractorDecoratorOptions<C extends ZanixConnectors> = {
    Connector?: C
    lifetime?: Exclude<Lifetime, 'SINGLETON'>
  }

  type ConnectorDecoratorOptions = ConnectorTypes | {
    type: ConnectorTypes
    startMode?: StartMode
    lifetime?: Lifetime
  }

  type HandlerDecoratorMethodOptions = {
    pathOrRTO?: string | (Omit<RtoTypes, 'Body'> | RtoTypes['Search'])
    rto?: Omit<RtoTypes, 'Body'> | RtoTypes['Search']
  }

  type ResolverTypes = 'Query' | 'Mutation'

  type ResolverRequestOptions = {
    /**
     * Request name
     */
    name?: string
    /**
     * Input type
     */
    input?: string | Record<string, string>
    /**
     * Input type
     */
    output?: string
    /**
     * Description for documentation info
     */
    description?: string
  }

  type DecoratorTypes = HandlerTypes | MiddlewareTypes | 'generic'

  type DecoratorsData<T extends DecoratorTypes> = T extends 'controller'
    ? { handler: string; endpoint: string; httpMethod: HttpMethods }
    : T extends 'resolver' ? {
        handler: Function
        name: string
        request: ResolverTypes
      } & Omit<ResolverRequestOptions, 'name'>
    : T extends 'socket' ? { handler: string; endpoint: string }
    : T extends 'pipe' ? { handler: string; mid: MiddlewarePipe }
    : T extends 'interceptor' ? { handler: string; mid: MiddlewareInterceptor }
    : object
}
