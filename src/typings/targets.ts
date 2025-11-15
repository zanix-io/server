// deno-lint-ignore-file no-explicit-any
import type { ZanixAsyncmqConnector } from 'connectors/core/asyncmq.ts'
import type { ZanixDatabaseConnector } from 'connectors/core/database.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { CoreCacheConnectors, CoreConnectors, CoreProviders } from './program.ts'
import type { ZanixCacheProvider } from 'providers/core/cache.ts'
import type { ZanixWorkerProvider } from 'providers/core/worker.ts'
import type { ZanixInteractor } from 'interactors/base.ts'
import type { ZanixConnector } from 'connectors/base.ts'
import type { HandlerBaseClass } from 'handlers/base.ts'
import type { ZanixCacheConnector } from '@zanix/server'
import type { ZanixProvider } from 'providers/base.ts'
import type { HandlerFunction } from './router.ts'
import type { HandlerContext } from './context.ts'
import type { BaseRTO } from '@zanix/validator'
import type { RtoTypes } from '@zanix/types'

export type ClassConstructor<T extends TargetBaseClass = TargetBaseClass> = {
  new (...args: any[]): T
  prototype: T
}

export type CallerArguments<Type extends ClassConstructor = ClassConstructor> =
  ConstructorParameters<
    Type
  >

export type HandlerPrototype<Interactor extends ZanixInteractorGeneric, Extensions = never> =
  | never
  | TargetBaseClass['_znx_props_']
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

export type SocketPrototype =
  | ((ev: Event | ErrorEvent) => unknown)
  | ((ev: CloseEvent) => unknown)
  | ((ev: MessageEvent<any>) => unknown)
  | Partial<WebSocket>

export type GQLPrototype = (payload: any, ctx: HandlerContext) => unknown

export type ZanixHandlerGeneric = HandlerBaseClass<any, any>

export type ZanixInteractorGeneric = ZanixInteractor<any>

export type ZanixInteractorClass<T extends ZanixInteractorGeneric = ZanixInteractorGeneric> = new (
  contextId: string,
) => T

export type ZanixConnectorGeneric = ZanixConnector

export type ZanixProviderGeneric = ZanixProvider<any>

export type ZanixCacheConnectorGeneric<P extends CoreCacheConnectors> = ZanixCacheConnector<
  any,
  any,
  P
>
export type ZanixProviderClass<T extends ZanixProvider = ZanixProvider> = new (
  contextId: string,
) => T
export type ZanixConnectorClass<T extends ZanixConnector = ZanixConnector> = new (
  contextId: string,
) => T

export type ZanixInteractorsGetter = {
  get: <D extends ZanixInteractorGeneric>(Interactor: ZanixInteractorClass<D>) => D
}

export type ZanixConnectorsGetter = {
  get: <D extends ZanixConnectorGeneric>(Connector: ZanixConnectorClass<D> | CoreConnectors) => D
}

export type ZanixProvidersGetter = {
  get: <D extends ZanixProviderGeneric>(Provider: ZanixProviderClass<D> | CoreProviders) => D
}
/**
 * Defines the available types for the different connectors in the Zanix system.
 *
 * This type can be used to specify which connectors are required for an instance
 * of the system, allowing flexible options depending on the specific use case.
 *
 * @property {ZanixWorkerProvider} worker - Optional provider for the worker part of the system.
 * @property {ZanixAsyncmqConnector|} asyncmq - Optional connector for the asynchronous message queue.
 * @property {ZanixCacheProvider} cache - Optional provider for the cache.
 * @property {ZanixDatabaseConnector} database - Optional connector for the database.
 */
export type CoreConnectorTemplates = {
  worker?: ZanixWorkerProvider
  asyncmq?: ZanixAsyncmqConnector
  cache?: ZanixCacheProvider
  database?: ZanixDatabaseConnector
}
/**
 * Indicates whether the connector should automatically initialize.
 *
 * - If set to `true`, the connector will automatically initialize on instantiation.
 * - If set to `false`, the connector will not automatically initialize and will require manual initialization.
 * - If set to an object, it allows configuring the auto-initialization behavior with the following properties:
 *    - `timeoutConnection`: The maximum time (in milliseconds) to wait for the connection to be established during auto-initialization. Defaults to **10000ms (10 seconds)**.
 *    - `retryInterval`: The interval (in milliseconds) between each retry when attempting to auto-initialize. Defaults to **500ms**.
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
     * The interval (in milliseconds) between each retry when attempting to auto-initialize. Defaults to **500ms**.
     */
    retryInterval?: number
  }

/**
 * Configuration options for general connector lifecycle event handlers.
 *
 * These callbacks allow consumers to respond to connection and disconnection events,
 * providing a consistent way to track the connector’s lifecycle.
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
   *    - `retryInterval`: The interval (in milliseconds) between each retry when attempting to auto-initialize. Defaults to **500ms**.
   */
  autoInitialize?: ConnectorAutoInitOptions
}
