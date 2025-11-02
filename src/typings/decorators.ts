// deno-lint-ignore-file ban-types
import type { RtoTypes } from '@zanix/types'
import type { ClassConstructor, ZanixInteractorClass } from './targets.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { MiddlewareInterceptor, MiddlewarePipe, MiddlewareTypes } from './middlewares.ts'
import type { ConnectorTypes, HandlerTypes, Lifetime, StartMode } from './program.ts'
import type { HttpMethods } from './router.ts'

export type ZanixClassDecorator = (
  Target: ClassConstructor,
  context?: ClassDecoratorContext,
) => void

export type ZanixFunctionDecorator = (
  method: Function,
  context?: DecoratorContext,
) => void

export type ZanixMethodDecorator = (
  method: Function,
  context?: ClassMethodDecoratorContext,
) => void

export type ZanixGenericDecorator = (
  Target: ClassConstructor | Function,
  context?: ClassDecoratorContext | ClassMethodDecoratorContext,
) => void

export type HandlerDecoratorOptions =
  | string
  | {
    prefix?: string
    /**
     * Enables `AsyncLocalStorage` to extend context per request, even in singleton instances.
     * This ensures each request gets its own context, preventing shared state in singleton scenarios.
     * Defaults to `false`
     */
    enableALS?: boolean
    Interactor?: ZanixInteractorClass
  }

export type SocketDecoratorOptions =
  | string
  | {
    route: string
    /** Rto to validate socket event data on message (Body) and request search or params */
    rto?: RtoTypes | RtoTypes['Body']
    /**
     * Enables `AsyncLocalStorage` to extend context per request, even in singleton instances.
     * This ensures each request gets its own context, preventing shared state in singleton scenarios.
     * Defaults to `false`
     */
    enableALS?: boolean
    Interactor?: ZanixInteractorClass
  }

type StartModeOnTransient<L extends Lifetime> = L extends 'TRANSIENT'
  ? { startMode: Exclude<StartMode, 'lazy'> }
  : { startMode?: StartMode }

export type InteractorDecoratorOptions<
  C extends typeof ZanixConnector,
  L extends Lifetime,
> = {
  Connector?: C
  lifetime?: L
} & StartModeOnTransient<L>

export type ConnectorDecoratorOptions<L extends Lifetime> = {
  type?: ConnectorTypes
  lifetime?: L
  autoConnectOnLazy?: boolean
} & StartModeOnTransient<L>

export type HandlerDecoratorMethodOptions = {
  pathOrRTO?: string | RtoTypes
  rto?: RtoTypes
}

export type ResolverTypes = 'Query' | 'Mutation'

export type ResolverRequestOptions = {
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

export type DecoratorTypes = HandlerTypes | MiddlewareTypes | 'generic'

export type DecoratorsData<T extends DecoratorTypes> = T extends 'controller'
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
