// deno-lint-ignore-file no-explicit-any
import type { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { BaseRTO } from '@zanix/validator'
import type { RtoTypes } from '@zanix/types'
import type { HandlerFunction } from './router.ts'
import type { HandlerContext } from './context.ts'

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
  | TargetBaseClass['_znxProps']
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

export type ZanixInteractorGeneric = ZanixInteractor<any>

export type ZanixInteractorClass<T extends ZanixInteractorGeneric = ZanixInteractorGeneric> = new (
  contextId: string,
) => T

export type ZanixConnectorClass<T extends ZanixConnector = ZanixConnector> = new (
  contextId: string,
) => T

export type ZanixConnectors<T extends ZanixConnector = ZanixConnector> = ZanixConnectorClass<T>

export type ZanixInteractorsGetter = {
  get: <T extends ZanixInteractorGeneric>(Interactor: ZanixInteractorClass<T>) => T
}

export type ZanixConnectorsGetter = {
  get: <T extends ZanixConnector>(Connector: ZanixConnectorClass<T>) => T
}
