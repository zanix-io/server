// deno-lint-ignore-file no-explicit-any
import type { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { ZanixWorkerConnector } from 'modules/infra/connectors/worker.ts'
import type { ZanixAsyncmqConnector } from 'modules/infra/connectors/asyncmq.ts'
import type { ZanixCacheConnector } from 'modules/infra/connectors/cache.ts'
import type { ZanixDatabaseConnector } from 'modules/infra/connectors/database.ts'
import type { HandlerBaseClass } from 'modules/infra/handlers/base.ts'
import type { BaseRTO } from '@zanix/validator'
import type { RtoTypes } from '@zanix/types'
import type { HandlerFunction } from './router.ts'
import type { HandlerContext } from './context.ts'
import type { ConnectionStatusHandler } from './general.ts'
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

export type ZanixInteractorGeneric = ZanixInteractor<any, any>

export type ZanixInteractorClass<T extends ZanixInteractorGeneric = ZanixInteractorGeneric> = new (
  contextId: string,
) => T

export type ZanixConnectorGeneric = ZanixConnector<any>
export type ZanixConnectorClass<T extends ZanixConnector = ZanixConnector> = new (
  contextId: string,
) => T

export type ZanixInteractorsGetter = {
  get: <D extends ZanixInteractorGeneric>(Interactor: ZanixInteractorClass<D>) => D
}

export type ZanixConnectorsGetter = {
  get: <D extends ZanixConnectorGeneric>(Connector: ZanixConnectorClass<D>) => D
}

/**
 * Defines the available types for the different connectors in the Zanix system.
 *
 * This type can be used to specify which connectors are required for an instance
 * of the system, allowing flexible options depending on the specific use case.
 *
 * @property {ZanixWorkerConnector} worker - Optional connector for the worker part of the system.
 * @property {ZanixAsyncmqConnector|} asyncmq - Optional connector for the asynchronous message queue.
 * @property {ZanixCacheConnector} cache - Optional connector for the cache.
 * @property {ZanixDatabaseConnector} database - Optional connector for the database.
 */
export type CoreConnectorTemplates = {
  worker?: ZanixWorkerConnector
  asyncmq?: ZanixAsyncmqConnector
  cache?: ZanixCacheConnector
  database?: ZanixDatabaseConnector
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
   * The URI used to establish the external connection.
   */
  uri?: string
  /**
   * Called when the connector successfully establishes a connection or encounters an error during the connection attempt.
   */
  onConnected?: ConnectionStatusHandler
  /**
   * Called when the connector disconnects, either normally or due to an unexpected error.
   */
  onDisconnected?: ConnectionStatusHandler
}
