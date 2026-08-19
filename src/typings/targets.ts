// deno-lint-ignore-file no-explicit-any
import type { CoreCacheConnectors, CoreConnectors, CoreProviders } from './program.ts'
import type { ZanixCacheConnector } from 'modules/infra/connectors/core/cache.ts'
import type { ZanixDatabaseConnector } from 'connectors/core/database.ts'
import type { ZanixAsyncMQProvider } from 'providers/core/asyncmq.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { ZanixCacheProvider } from 'providers/core/cache.ts'
import type { ZanixKVConnector } from 'connectors/core/kv.ts'
import type { ZanixSearchConnector } from 'connectors/core/search.ts'
import type { ZanixWorkerProvider } from 'providers/core/worker.ts'
import type { ZanixInteractor } from 'interactors/base.ts'
import type { ZanixConnector } from 'connectors/base.ts'
import type { HandlerBaseClass } from 'handlers/base.ts'
import type { ZanixProvider } from 'providers/base.ts'
import type { HandlerFunction } from './router.ts'
import type { HandlerContext } from './context.ts'
import type { BaseRTO } from '@zanix/validator'
import type { RtoTypes } from '@zanix/types'

/** The constructor shape of any Zanix target class (connector, provider, interactor, handler). */
export type ClassConstructor<T extends TargetBaseClass = TargetBaseClass> = {
  new (...args: any[]): T
  /** The class's prototype, i.e., the instance shape produced by `new`. */
  prototype: T
}

export type CallerArguments<Type extends ClassConstructor = ClassConstructor> =
  ConstructorParameters<
    Type
  >

/** The union of members the framework may attach to a handler instance's prototype at runtime. */
export type HandlerPrototype<
  Interactor extends ZanixInteractorGeneric,
  Extensions = never,
> =
  | never
  | TargetBaseClass['_znx_props_']
  | TargetBaseClass['onDestroy']
  | HandlerFunction
  | Interactor
  | (<
    B extends BaseRTO = BaseRTO,
    P extends BaseRTO = BaseRTO,
    S extends BaseRTO = BaseRTO,
  >(rtos: RtoTypes<B, P, S>, ctx: HandlerContext) => Promise<{
    body: B
    search: S
    params: P
  }>)
  | Extensions

/** The extra shape available on a `ZanixWebSocket` prototype: event handlers and socket state. */
export type SocketPrototype =
  | ((...args: any[]) => unknown)
  | Partial<WebSocket>

/** The shape of a GraphQL resolver method: a payload/context pair returning any value. */
export type GQLPrototype = (payload: any, ctx: HandlerContext) => unknown

/** Represents any Zanix handler (controller, resolver, or WebSocket) instance. */
export type ZanixHandlerGeneric = HandlerBaseClass<any, any>

/** Represents any Zanix connector instance. */
export type ZanixConnectorGeneric = ZanixConnector

/** Represents any Zanix provider instance. */
export type ZanixProviderGeneric = ZanixProvider<any>

/** Represents any Zanix cache connector instance for a given `CoreCacheConnectors` type. */
export type ZanixCacheConnectorGeneric<P extends CoreCacheConnectors> = ZanixCacheConnector<
  any,
  any,
  P
>

/** Represent the generic Zanix Interactor */
export type ZanixInteractorGeneric = ZanixInteractor<any>

/**
 * Represents an accessor for retrieving instantiated Zanix Interactors.
 *
 * The `get` method receives an Interactor class (constructor) and returns
 * its corresponding instantiated Interactor, ensuring correct typing through
 * the generic parameter.
 *
 * @property {<D extends ZanixInteractorGeneric>(Interactor: ZanixInteractorClass<D>) => D} get
 *   Retrieves an instance of the given Interactor class.
 */
export type ZanixInteractorsGetter = {
  /** Retrieves an instance of the given Interactor class. */
  get: <D extends ZanixInteractorGeneric>(
    Interactor: ZanixInteractorClass<D>,
  ) => D
}

/**
 * Represents an accessor for retrieving instantiated Zanix Connectors.
 *
 * Three ways to call `get`, tried in this order:
 * 1. A string key that's also a key of `T` (the same `CoreModules` map passed to the calling
 *    class, e.g. `ZanixProvider<{ asyncmq: ZanixAsyncMQProvider }>`) — returns that key's declared
 *    type. This is the only way to get a precisely-typed result from a string key; it requires the
 *    consumer to explicitly declare `T`, since ambient/global type augmentation doesn't reliably
 *    carry a real per-key type across package boundaries (see `CoreConnectors`' own doc,
 *    `typings/program.ts`).
 * 2. A Connector class — returns that exact class's instance type, same as always.
 * 3. Any other string — a loosely-typed fallback (`ZanixConnectorGeneric`), for a core slot key
 *    the calling class didn't declare in its own `T`. Still resolves correctly at runtime (or
 *    throws the explicit "missing core slot" error) — this overload only affects the *type* you
 *    get back, not whether the call itself succeeds.
 */
export interface ZanixConnectorsGetter<T extends CoreModules = object> {
  /** Retrieves the connector declared under `key` in `T`, precisely typed as `T[K]`. */
  get<K extends Extract<keyof T, string>>(
    key: K,
  ): NonNullable<T[K]> extends ZanixConnectorGeneric ? NonNullable<T[K]>
    : ZanixConnectorGeneric
  /** Retrieves an instance of the given Connector class. */
  get<D extends ZanixConnectorGeneric>(Connector: ZanixConnectorClass<D>): D
  /** Retrieves an instance by a string key not declared in `T`, loosely typed. */
  get<T extends ZanixConnectorGeneric>(key: CoreConnectors): T
}

/**
 * Represents an accessor for retrieving instantiated Zanix Providers — same three-overload
 * mechanism as {@link ZanixConnectorsGetter}, provider side.
 */
export interface ZanixProvidersGetter<T extends CoreModules = object> {
  /** Retrieves the provider declared under `key` in `T`, precisely typed as `T[K]`. */
  get<K extends Extract<keyof T, string>>(
    key: K,
  ): NonNullable<T[K]> extends ZanixProviderGeneric ? NonNullable<T[K]>
    : ZanixProviderGeneric
  /** Retrieves an instance of the given Provider class. */
  get<D extends ZanixProviderGeneric>(Provider: ZanixProviderClass<D>): D
  /** Retrieves an instance by a string key not declared in `T`, loosely typed. */
  get<T extends ZanixProviderGeneric>(key: CoreProviders): T
}

/**
 * Represents a constructor type for a Zanix Interactor class.
 *
 * The class receives an optional `contextId` and must return an instance
 * of a type extending `ZanixInteractorGeneric`.
 *
 * @template T extends ZanixInteractorGeneric
 */
export type ZanixInteractorClass<
  T extends ZanixInteractorGeneric = ZanixInteractorGeneric,
> = new (contextId?: string) => T

/**
 * Represents a constructor type for a Zanix Provider class.
 *
 * The class receives an optional `contextId` and must return an instance
 * of a type extending `ZanixProvider`.
 *
 * @template T extends ZanixProvider
 */
export type ZanixProviderClass<
  T extends ZanixProvider = ZanixProvider,
> = new (contextId?: string) => T

/**
 * Represents a constructor type for a Zanix Connector class.
 *
 * The class receives an optional `contextId` and must return an instance
 * of a type extending `ZanixConnector`.
 *
 * @template T extends ZanixConnector
 */
export type ZanixConnectorClass<
  T extends ZanixConnector = ZanixConnector,
> = new (contextId?: string) => T

/**
 * Maps a core module's slot key to its type — the generic every `CoreBaseClass` subclass
 * (`ZanixProvider`, `ZanixConnector`, `ZanixInteractor`) accepts to get precise compile-time typing
 * out of `this.providers.get(key)`/`this.connectors.get(key)` for a `string` key, and to override
 * the 6 named getters' (`this.cache`, `this.database`, ...) default return type. The 6 properties
 * below are optional and pre-typed as a convenience; add your own keys for anything else
 * (`this.providers.get('auth')`, a custom slot, ...) — e.g.
 * `class MyInteractor extends ZanixInteractor<{ asyncmq: ZanixAsyncMQProvider }> {}`. This is the
 * *only* reliable way to get a real per-key return type: unlike an earlier design, this framework
 * does not rely on ambient/global `declare module` augmentation for this, since that doesn't carry
 * a per-key return type at all (only validates the key), and is unsupported by JSR's
 * `no-slow-types` check once reachable from a package's public surface — see `CoreConnectors`'
 * own doc (`typings/program.ts`) for the full reasoning.
 *
 * @property {ZanixWorkerProvider} worker - Optional provider for the worker part of the system.
 * @property {ZanixAsyncMQProvider|} asyncmq - Optional provider for the asynchronous message queue.
 * @property {ZanixCacheProvider} cache - Optional provider for the cache.
 * @property {ZanixDatabaseConnector} database - Optional connector for the database.
 * @property {ZanixKVConnector} kvLocal - Optional connector for the local key-value store.
 * @property {ZanixSearchConnector} search - Optional connector for a search/indexing engine.
 */
export type CoreModules<
  T extends ZanixConnector | ZanixProvider = ZanixConnector | ZanixProvider,
> =
  & {
    /** Optional provider for the worker part of the system. */
    worker?: ZanixWorkerProvider
    /** Optional provider for the asynchronous message queue. */
    asyncmq?: ZanixAsyncMQProvider
    /** Optional provider for the cache. */
    cache?: ZanixCacheProvider
    /** Optional connector for the database. */
    database?: ZanixDatabaseConnector
    /** Optional connector for the local key-value store. */
    kvLocal?: ZanixKVConnector
    /** Optional connector for a search/indexing engine. */
    search?: ZanixSearchConnector
  }
  & Partial<{ [key: string]: T }>

/**
 * Indicates whether the connector should automatically initialize.
 *
 * - If set to `true`, the connector will automatically initialize on instantiation.
 * - If set to `false`, the connector will not automatically initialize and will require manual initialization.
 * - If set to an object, it allows configuring the auto-initialization behavior with the following properties:
 *    - `timeoutConnection`: The maximum time (in milliseconds) to wait for the connection to be established during auto-initialization. Defaults to **10000ms (10 seconds)**.
 *    - `retryInterval`: The interval (in milliseconds) between each retry. Defaults to **500ms**. Governs two separate things: retrying a failed `initialize()` call itself — only for `startMode: 'postBoot'`/`'lazy'`; `onSetup`/`onBoot` never retry `initialize()`, so boot stays fail-fast — and the interval between post-ready `isHealthy()` checks, for every `startMode`.
 *
 * @type {boolean | { timeoutConnection?: number; retryInterval?: number }}
 */
export type ConnectorAutoInitOptions =
  | boolean
  | {
    /**
     * The maximum time (in milliseconds) to wait for the connection to be established during auto-initialization. Defaults to **10000ms (10 seconds)**.
     */
    timeoutConnection?: number
    /**
     * The interval (in milliseconds) between each retry. Defaults to **500ms**. Governs two separate things: retrying a failed `initialize()` call itself — only for `startMode: 'postBoot'`/`'lazy'`; `onSetup`/`onBoot` never retry `initialize()`, so boot stays fail-fast — and the interval between post-ready `isHealthy()` checks, for every `startMode`.
     */
    retryInterval?: number
  }

/**
 * General configuration options accepted by a connector's constructor.
 */
export type ConnectorOptions = {
  /**
   * The optional contextId if ALS is not used
   */
  contextId?: string
  /**
   * Indicates whether the connector should automatically initialize.
   *
   * - If set to `true`, the connector will automatically initialize on instantiation.
   * - If set to `false`, the connector will not automatically initialize and will require manual initialization.
   * - If set to an object, it allows configuring the auto-initialization behavior with the following properties:
   *    - `timeoutConnection`: The maximum time (in milliseconds) to wait for the connection to be established during auto-initialization. Defaults to **10000ms (10 seconds)**.
   *    - `retryInterval`: The interval (in milliseconds) between each retry. Defaults to **500ms**. Governs two separate things: retrying a failed `initialize()` call itself — only for `startMode: 'postBoot'`/`'lazy'`; `onSetup`/`onBoot` never retry `initialize()`, so boot stays fail-fast — and the interval between post-ready `isHealthy()` checks, for every `startMode`.
   */
  autoInitialize?: ConnectorAutoInitOptions
}
