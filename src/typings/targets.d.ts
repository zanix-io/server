// deno-lint-ignore-file no-explicit-any
import type { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { BaseRTO } from '@zanix/validator'
import type { RtoTypes } from '@zanix/types'

declare global {
  type ClassConstructor<T extends TargetBaseClass = TargetBaseClass> = {
    new (...args: any[]): T
    prototype: T
  }

  type CallerArguments<Type extends ClassConstructor = ClassConstructor> = ConstructorParameters<
    Type
  >

  type HandlerPrototype<Interactor extends ZanixInteractorGeneric, Extensions = never> =
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

  type SocketPrototype =
    | ((ev: Event | ErrorEvent) => unknown)
    | ((ev: CloseEvent) => unknown)
    | ((ev: MessageEvent<any>) => unknown)
    | Partial<WebSocket>

  type GQLPrototype = (payload: any, ctx: HandlerContext) => unknown

  type ZanixInteractorGeneric = ZanixInteractor<any>

  type ZanixInteractorClass<T extends ZanixInteractorGeneric = ZanixInteractorGeneric> = new (
    contextId: string,
  ) => T

  type ZanixConnectorClass<T extends ZanixConnector = ZanixConnector> = new (
    context: BaseContext,
  ) => T

  type ZanixConnectors<T extends ZanixConnector = ZanixConnector> = ZanixConnectorClass<T>

  type ZanixInteractorsGetter = {
    get: <T extends ZanixInteractorGeneric>(Interactor: ZanixInteractorClass<T>) => T
  }
}
