import type { BaseContext } from 'typings/context.ts'
import type {
  ClassConstructor,
  ZanixConnectorGeneric,
  ZanixHandlerGeneric,
  ZanixInteractorGeneric,
} from 'typings/targets.ts'
import type {
  HandlerTypes,
  MetadataInstances,
  MetadataTargetSymbols,
  ModuleTypes,
  StartMode,
} from 'typings/program.ts'

import { HANDLER_METADATA_PROPERTY_KEY } from 'utils/constants.ts'
import { asyncContext } from 'modules/program/public.ts'
import { BaseInstancesContainer } from './instances.ts'

/**
 * Container for holding and managing generic instantiable targets such as classes,
 * handlers, interactors, and connectors.
 *
 * @remarks
 * Targets can include:
 * - **Handlers**: controllers, sockets, resolvers, etc.
 * - **Interactors**: logic units that perform specific tasks.
 * - **Connectors**: objects that handle integration with external systems.
 *
 * This container provides a centralized way to register, manage, and access these targets.
 */
export class TargetContainer extends BaseInstancesContainer {
  #properties = {
    handler: HANDLER_METADATA_PROPERTY_KEY,
    general: 'properties',
  }

  /**
   * Defines a general target type, either `handlers`, `connectors` or `interactors`.
   *
   * @remarks
   * Use this method to specify a target you want to instantiate.
   */
  public defineTarget<T extends ClassConstructor = ClassConstructor>(
    baseKey: string,
    opts: Omit<MetadataInstances<T>, 'startMode'> & { startMode?: StartMode },
  ) {
    const { startMode = 'lazy', type, Target } = opts
    const { key } = this.toBeInstantiated(baseKey, { ...opts, startMode })

    this.setTargetByStartMode(key, startMode)
    this.setTargetByType(baseKey, type)
    this.setTarget(key, Target)
  }

  /**
   * Registers a key under a specific start mode.
   * @param key The key to register.
   * @param startMode The start mode identifier.
   * @param container Optional container object (defaults to `this`).
   * @protected
   */
  protected setTargetByStartMode(
    key: string,
    startMode: StartMode,
    container: object = this,
  ): void {
    if (startMode === 'lazy') return // exclude, it is not necessary to save (yet)

    const targets = this.getTargetsByStartMode(startMode)

    if (!targets.includes(key)) targets.push(key)
    this.setData(`startMode:${startMode}`, targets, container)
  }

  /**
   * Registers a key under a specific module type.
   * @param key The key to register.
   * @param type The module type identifier.
   * @param container Optional container object (defaults to `this`).
   * @protected
   */
  protected setTargetByType(
    key: string,
    type: ModuleTypes,
    container: object = this,
  ) {
    if (!(type === 'connector' || type === 'resolver')) return // is not neccesary (yet) to save other types

    const targets = this.getTargetsByType(type)

    if (!targets.includes(key)) targets.push(key)
    this.setData(`type:${type}`, targets, container)
  }

  /**
   * Gets all registered keys for a specific start mode.
   * @param startMode The start mode identifier.
   * @param container Optional container object (defaults to `this`).
   * @returns An array of registered keys.
   */
  public getTargetsByStartMode(
    startMode: Exclude<StartMode, 'lazy'>,
    container: object = this,
  ): string[] {
    return this.getData<string[]>(`startMode:${startMode}`, container) || []
  }

  /**
   * Gets all registered keys for a specific module type.
   * @param type The module type identifier.
   * @param container Optional container object (defaults to `this`).
   * @returns An array of registered keys.
   */
  public getTargetsByType(
    type: Extract<ModuleTypes, 'connector' | 'resolver'>,
    container: object = this,
  ): string[] {
    return this.getData<string[]>(`type:${type}`, container) || []
  }

  /**
   * Function to add a `property` or `symbol` to a specified target class
   */
  public addProperty({ Target, propertyKey, type = 'handler' }: MetadataTargetSymbols) {
    const properties = this.getProperties({ Target })
    const propertiesSet = new Set<string>(properties)

    if (propertyKey && !propertiesSet.has(propertyKey)) propertiesSet.add(propertyKey)

    this.setData<string[]>(this.#properties[type], Array.from(propertiesSet), Target)
  }

  /**
   * Retrieves all `properties` or `symbol` with a specific target class
   */
  public getProperties({ Target, type = 'handler' }: MetadataTargetSymbols): string[] {
    return this.getData<string[] | undefined>(this.#properties[type], Target) || []
  }

  /**
   * Getting a handler instance
   */
  public getHandler<T extends ZanixHandlerGeneric>(
    key: string,
    type: HandlerTypes,
    ctx: BaseContext,
  ): T {
    return this.getInstance<T>(key, type, { params: ctx, keyId: ctx.id })
  }

  /**
   * Getting a connector instance
   */
  public getConnector<T extends ZanixConnectorGeneric>(
    key: string,
    options?: { contextId?: string },
  ): T
  public getConnector<T extends ZanixConnectorGeneric>(
    key: string,
    options: { useExistingInstance?: true },
  ): T | undefined
  public getConnector<T extends ZanixConnectorGeneric>(
    key: string,
    options: { contextId?: string; useExistingInstance?: boolean } = {},
  ): T | undefined {
    const { contextId, useExistingInstance } = options

    return this.getInstance<T>(key, 'connector', {
      params: contextId || asyncContext.getId(),
      keyId: contextId,
      useExistingInstance,
    })
  }

  /**
   * Getting an interactor instance
   */
  public getInteractor<T extends ZanixInteractorGeneric>(
    key: string,
    options: { contextId?: string; useExistingInstance?: boolean } = {},
  ): T {
    const { contextId, useExistingInstance } = options

    return this.getInstance<T>(key, 'interactor', {
      params: contextId || asyncContext.getId(),
      keyId: contextId,
      useExistingInstance,
    })
  }
}
