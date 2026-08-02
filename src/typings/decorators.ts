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
import type { HttpMethod } from './router.ts'
import type { VersionProtocolOption } from 'middlewares/protocol-version.ts'

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

/**
 * Options shared by every handler class decorator (`@Controller`, `@Resolver`, `@Socket`) —
 * `prefix` (Controller/Resolver) and `route`/`rto` (Socket) are the only fields that differ per
 * decorator, so they're kept out of this type and added on top of it instead.
 */
export type GenericHandlerOptions = {
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
  /** Interactor class injected and made available as `this.interactor`. */
  Interactor?: ZanixInteractorClass
  /**
   * Negotiates a protocol version on every request/response this handler serves: rejects an
   * incoming request that declares an unsupported version (via a `Guard`), and stamps the
   * negotiated version on every response (via an `Interceptor`). `true` (or omitting the
   * option) enables it with sensible defaults (`PROTOCOL_VERSION_HEADER`,
   * `DEFAULT_PROTOCOL_VERSION`); pass an object to override the header name, current version,
   * or which older versions are still accepted; pass `false` to disable it entirely.
   * Defaults to `true` — **on by default** for every `@Controller`/`@Resolver`/`@Socket`. On a
   * `@Socket`, this negotiates once per connection handshake, not per message.
   */
  versionProtocol?: VersionProtocolOption
}

export type HandlerDecoratorOptions =
  | string
  | (GenericHandlerOptions & { prefix?: string })

export type SocketDecoratorOptions =
  | string
  | (GenericHandlerOptions & {
    route: string
    /** Rto to validate socket event data on message (Body) and request search or params */
    rto?: RtoTypes | RtoTypes['Body']
  })

/** Requires a non-`'lazy'` `startMode` when `L` is `'TRANSIENT'`; otherwise it stays optional. */
export type StartModeOnTransient<L extends Lifetime> = L extends 'TRANSIENT'
  ? { startMode: Exclude<StartMode, 'lazy'> }
  : { startMode?: StartMode }

/**
 * Options accepted by the `@Interactor` class decorator. There is deliberately no `Connector`/
 * `Provider` single-slot option here — reach any dependency (including a class-based provider or
 * connector) via `this.providers.get(X)`/`this.connectors.get(X)`, inherited from `CoreBaseClass`.
 */
export type InteractorDecoratorOptions<L extends Lifetime> = {
  lifetime?: L
} & StartModeOnTransient<L>

/** Options accepted by the object-argument overload of the `@Connector` class decorator. */
export type ConnectorDecoratorOptions<L extends Lifetime> = {
  /**
   * Which core connector slot this class registers under (e.g. `'database'`, `'cache:redis'`),
   * or omitted/`'custom'` for a plain connector resolved only by class reference. Named `slot`,
   * not `type`, because it's only ever a real registration key for a core slot — for a custom
   * connector there's no key here at all (the actual lookup key is derived from the class itself).
   */
  slot?: ConnectorTypes
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

/** Options accepted by the object-argument overload of the `@Provider` class decorator. */
export type ProviderDecoratorOptions<L extends Exclude<Lifetime, 'TRANSIENT'>> = {
  /**
   * Which core provider slot this class registers under (e.g. `'cache'`, `'auth'`), or
   * omitted/`'custom'` for a plain provider resolved only by class reference. Named `slot`, not
   * `type`, because it's only ever a real registration key for a core slot — for a custom
   * provider there's no key here at all (the actual lookup key is derived from the class itself).
   */
  slot?: ProviderTypes
  /** The instance lifetime strategy (`'SINGLETON'` or `'SCOPED'`). */
  lifetime?: L
  /** The initialization mode for the provider's instance. */
  startMode?: StartMode
}

/** Internal shape shared by REST/socket method decorators for their `(path?, rto?)` overloads. */
export type HandlerDecoratorMethodOptions = {
  /** Either the route path or, when omitted, the RTO passed as the first positional argument. */
  pathOrRTO?: string | RtoTypes
  /** The RTO used to validate the request/event data, when a path is also given. */
  rto?: RtoTypes
}

export type ResolverTypes = 'Query' | 'Mutation'

/** Options accepted by the `@Query`/`@Mutation` method decorators. */
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
