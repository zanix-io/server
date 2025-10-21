import type { ZanixConnectorClass, ZanixConnectorsGetter } from 'typings/targets.ts'

import Program from '../../program/main.ts'
import { getTargetKey } from 'utils/targets.ts'
import { CoreBaseClass } from '../base/core.ts'
import { validateURI } from 'utils/uri.ts'
import { DEFAULT_URI_CONNECTOR } from 'utils/constants.ts'

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
 * @extends CoreBaseClass
 */
export abstract class ZanixConnector extends CoreBaseClass {
  #connected = false
  #key
  #contextId
  private accessor startCalled: boolean = false
  private accessor stopCalled: boolean = false
  /**
   * Partial URL without sensible data.
   */
  protected url: URL = new URL('znx://' + DEFAULT_URI_CONNECTOR)

  /**
   * Indicates whether the connector is currently connected.
   * @type {boolean}
   * @readonly
   */
  public get connected(): boolean {
    return this.#connected
  }

  protected set connected(value: boolean) {
    this.#connected = value
  }

  /**
   * Constructor that wraps the `startConnection` and `stopConnection` methods
   * to add automatic connection lifecycle handling.
   *
   * If the connector's `startMode` is set to `'lazy'`, the connection is started automatically on instantiation.
   */
  constructor(contextId: string, uri: string = DEFAULT_URI_CONNECTOR) {
    super(contextId)

    const { key, data, startMode } = this['_znxProps']
    this.#contextId = contextId
    this.#key = key

    const originalStartConnection = this.startConnection.bind(this)
    this.startConnection = function (_uri: string = uri) {
      if (this.connected || this.startCalled) return true

      //TODO: validate protocol, only for zanix cloud projects
      const url = validateURI(_uri)
      if (!url) {
        throw new Deno.errors.InvalidData(
          `The URI provided for the connector '${this.constructor.name}' not a valid or supported`,
        )
      }

      const validURI = url.toString()

      //assign and remove sensible data
      this.url = url
      this.url.password = ''
      this.url.username = ''

      this.startCalled = true
      const connection = originalStartConnection(validURI)

      if (connection instanceof Promise) {
        connection.then((result: boolean) => {
          this.connected = result
        }).finally(() => {
          this.startCalled = false
        })
      } else {
        this.connected = connection
        this.startCalled = false
      }

      return connection
    }

    const originalStopConnection = this.stopConnection.bind(this)
    this.stopConnection = function () {
      if (!this.connected || this.stopCalled) return true
      this.stopCalled = true
      const connection = originalStopConnection()
      if (connection instanceof Promise) {
        connection.then((result) => {
          this.connected = !result
        }).finally(() => {
          this.stopCalled = false
        })
      } else {
        this.connected = !connection
        this.stopCalled = false
      }

      return connection
    }

    // Starting connection on lazy instances
    if (startMode === 'lazy' && data?.autoConnectOnLazy !== false) this.startConnection(uri)
  }

  /**
   * Starts the connection to the external service.
   *
   * This method is overridden internally to prevent multiple simultaneous or redundant
   * connection attempts. If already connected or a start is in progress, it exits early.
   *
   * If the original implementation returns a `Promise`, connection state is updated once it resolves.
   *
   * @param {unknown[]} uri - URI needed for connection
   * @abstract
   * @returns {Promise<boolean> | boolean} A boolean that indicates whether the connection was successful.
   */
  public abstract startConnection(uri?: string): Promise<boolean> | boolean

  /**
   * Stops the connection to the external service.
   *
   * Like `startConnection()`, this method is wrapped to ensure that it runs safely,
   * preventing duplicate stop attempts. If the connector is already disconnected or stopping, it exits early.
   *
   * @abstract
   * @returns {Promise<boolean> | boolean} A boolean that indicates whether the disconnection was successful.
   */
  public abstract stopConnection(): Promise<boolean> | boolean

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
      get: <T extends ZanixConnector>(
        Connector: ZanixConnectorClass<T>,
      ): T => {
        const key = getTargetKey(Connector)
        // Check if the connector is not circular, in which case return the same instance
        if (this.#key === key) return this as unknown as T
        return Program.targets.getInstance<T>(key, 'connector', { ctx: this.#contextId })
      },
    }
  }
}
