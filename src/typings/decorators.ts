// deno-lint-ignore-file ban-types
import type { RtoTypes } from '@zanix/types'
import type { ClassConstructor, ConnectorAutoInitOptions, ZanixInteractorClass } from './targets.ts'
import type {
  MiddlewareGuard,
  MiddlewareInterceptor,
  MiddlewarePipe,
  MiddlewareTypes,
} from './middlewares.ts'
import type { ConnectorTypes, HandlerTypes, Lifetime, ProviderTypes, StartMode } from './program.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { ZanixProvider } from 'providers/base.ts'
import type { HttpMethod } from './router.ts'

/**
 * A decorator type for classes.
 *
 * This type represents a decorator function that can be applied to a class constructor.
 * Optionally, it can also receive a `context` that provides additional information about the class being decorated.
 *
 * @param {ClassConstructor} Target - The class constructor that is being decorated.
 * @param {ClassDecoratorContext} [context] - An optional context object providing metadata or additional information about the class.
 *
 * @example
 * const MyClassDecorator: ZanixClassDecorator = (Target, context) => {
 *   console.log(`Class ${Target.name} decorated!`);
 * };
 */
export type ZanixClassDecorator = (
  Target: ClassConstructor,
  context?: ClassDecoratorContext,
) => void

/**
 * A decorator type for functions (methods).
 *
 * This type represents a decorator function that can be applied to class methods or standalone functions.
 * Optionally, it can also receive a `context` that provides additional information about the function being decorated.
 *
 * @param {Function} method - The method (function) that is being decorated.
 * @param {DecoratorContext} [context] - An optional context object providing metadata or additional information about the function.
 *
 * @example
 * const MyFunctionDecorator: ZanixFunctionDecorator = (method, context) => {
 *   console.log(`Function ${method.name} decorated!`);
 * };
 */
export type ZanixFunctionDecorator = (
  method: Function,
  context?: DecoratorContext,
) => void

/**
 * A decorator type for class methods.
 *
 * This type represents a decorator function that can be applied to class methods.
 * Optionally, it can also receive a `context` object that provides additional information about the method being decorated.
 *
 * @param {Function} method - The class method that is being decorated.
 * @param {ClassMethodDecoratorContext} [context] - An optional context object providing metadata or additional information about the method.
 *
 * @example
 * const MyMethodDecorator: ZanixMethodDecorator = (method, context) => {
 *   console.log(`Method ${method.name} decorated!`);
 * };
 */
export type ZanixMethodDecorator = (
  method: Function,
  context?: ClassMethodDecoratorContext,
) => void

/**
 * A generic decorator type that can be applied to both classes and functions.
 *
 * This type represents a decorator function that can be applied to a class constructor or a method (function).
 * It can also receive an optional `context` that provides additional information about the class or method being decorated.
 *
 * @param {ClassConstructor | Function} Target - The target of the decorator, which can be a class constructor or a function (method).
 * @param {ClassDecoratorContext | ClassMethodDecoratorContext} [context] - An optional context object providing metadata or additional information about the target.
 *
 * @example
 * const MyGenericDecorator: ZanixGenericDecorator = (Target, context) => {
 *   if (typeof Target === 'function') {
 *     console.log(`Function ${Target.name} decorated!`);
 *   } else {
 *     console.log(`Class ${Target.name} decorated!`);
 *   }
 * };
 */
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
     *
     * ⚠️ Enabling this feature may increase overload by managing multiple contexts simultaneously,
     * especially if many data points are associated with each request, potentially adding more
     * processing overhead.
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
     *
     * ⚠️ Enabling this feature may increase overload by managing multiple contexts simultaneously,
     * especially if many data points are associated with each request, potentially adding more
     * processing overhead.
     */
    enableALS?: boolean
    Interactor?: ZanixInteractorClass
  }

type StartModeOnTransient<L extends Lifetime> = L extends 'TRANSIENT'
  ? { startMode: Exclude<StartMode, 'lazy'> }
  : { startMode?: StartMode }

export type InteractorDecoratorOptions<
  C extends typeof ZanixConnector,
  P extends typeof ZanixProvider,
  L extends Lifetime,
> = {
  Connector?: C
  Provider?: P
  lifetime?: L
} & StartModeOnTransient<L>

export type ConnectorDecoratorOptions<L extends Lifetime> = {
  type?: ConnectorTypes
  lifetime?: L
  /**
   * Indicates whether the connector should automatically initialize.
   *
   * - If set to `true`, the connector will automatically initialize on instantiation.
   * - If set to `false`, the connector will not automatically initialize and will require manual initialization.
   * - If set to an object, it allows configuring the auto-initialization behavior with the following properties:
   *    - `timeoutConnection`: The maximum time (in milliseconds) to wait for the connection to be established during auto-initialization. Defaults to **10000ms (10 seconds)**.
   *    - `retryInterval`: The interval (in milliseconds) between each retry when attempting to auto-initialize. Defaults to **500ms**.
   */
  autoInitialize?: ConnectorAutoInitOptions
} & StartModeOnTransient<L>

export type ProviderDecoratorOptions<L extends Exclude<Lifetime, 'TRANSIENT'>> = {
  type?: ProviderTypes
  lifetime?: L
  startMode?: StartMode
}

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
  ? { handler: string; endpoint?: string; httpMethod: HttpMethod }
  : T extends 'resolver' ? {
      handler: Function
      name: string
      request: ResolverTypes
    } & Omit<ResolverRequestOptions, 'name'>
  : T extends 'socket' ? { handler: string; endpoint: string }
  : T extends 'guard' ? { handler: string; mid: MiddlewareGuard }
  : T extends 'pipe' ? { handler: string; mid: MiddlewarePipe }
  : T extends 'interceptor' ? { handler: string; mid: MiddlewareInterceptor }
  : object
