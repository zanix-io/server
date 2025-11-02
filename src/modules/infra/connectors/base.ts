import type {
  ConnectorOptions,
  CoreConnectorTemplates,
  ZanixConnectorClass,
  ZanixConnectorsGetter,
} from 'typings/targets.ts'

import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { BaseConnectionClass } from './connection.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

/**
 * Abstract base class for implementing service connectors in the Zanix framework.
 *
 * `ZanixConnector` provides a standardized lifecycle for managing connections to external services
 * such as databases, APIs, queues, etc. It handles safe and idempotent execution of
 * `startConnection()` and `stopConnection()` methods, ensuring that connection states are tracked
 * and that multiple simultaneous calls are avoided.
 *
 * This class is intended to be extended by concrete connector implementations.
 *
 * @abstract
 * @extends BaseConnectionClass
 *
 * @template T - A generic type representing the type of core connectors used by the current connector.
 *               By default, it is set to `object`, meaning the base core connector types are provided unless explicitly specified.
 */
export abstract class ZanixConnector<
  T extends CoreConnectorTemplates = object,
> extends BaseConnectionClass<T> {
  #key
  #contextId

  /**
   * Constructor that wraps the `startConnection` and `stopConnection` methods
   * to add automatic connection lifecycle handling.
   *
   * If the connector's `startMode` is set to `'lazy'`, the connection is started automatically on instantiation.
   */
  constructor(
    options: string | ConnectorOptions = {},
  ) {
    const args = typeof options === 'string' ? { contextId: options } : options
    super(args)

    const { key, data, startMode } = this[ZANIX_PROPS]
    this.#contextId = args.contextId
    this.#key = key

    // Start lazy connection after the child instance is fully initialized
    // (queueMicrotask ensures private fields are ready before execution)
    if (startMode === 'lazy' && data?.autoConnectOnLazy !== false) {
      queueMicrotask(() => this.startConnection())
    }
  }

  /**
   * Provides access to other connectors registered within the system.
   *
   * This getter exposes a dynamic utility that allows the current connector to retrieve and
   * communicate with other connectors, supporting modular and reusable business logic.
   *
   * @protected
   * @returns {ZanixConnectorsGetter} A utility for retrieving other connectors.
   */
  protected get connectors(): ZanixConnectorsGetter {
    return {
      get: <D extends ZanixConnector<T>>(
        Connector: ZanixConnectorClass<D>,
      ): D => {
        const key = getTargetKey(Connector)
        // Check if the connector is not circular, in which case return the same instance
        if (this.#key === key) return this as unknown as D
        return ProgramModule.targets.getConnector<D>(key, { contextId: this.#contextId })
      },
    }
  }
}
