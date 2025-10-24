import type { CoreConnectorTemplates } from 'typings/targets.ts'

import { CoreBaseClass } from '../base/core.ts'
import { validateURI } from 'utils/uri.ts'
import { DEFAULT_URI_CONNECTOR } from 'utils/constants.ts'

/**
 * Abstract base class for implementing and manage connector connections.
 *
 * This class is intended to be extended by concrete connector implementations.
 *
 * @abstract
 * @extends CoreBaseClass
 *
 * @template T - A generic type representing the type of core connectors used by the current connector.
 *               By default, it is set to `object`, meaning the base core connector types are provided unless explicitly specified.
 */
export abstract class BaseConnectionClass<
  T extends CoreConnectorTemplates = object,
> extends CoreBaseClass<T> {
  #connected: boolean = false
  private accessor startCalled: boolean = false
  private accessor stopCalled: boolean = false
  /**
   * A `Promise` that resolves when the connector instance is fully initialized.
   *
   * Consumers should await this promise before calling the `start` and `stop` connection methods
   * to ensure they are properly defined and ready to use.
   *
   * Example usage:
   * ```ts
   * const conn = new ExampleConnector(contextId);
   * await conn.connectorReady; // wait until all connector methods are initialized
   * await conn.startConnection(); // now safe to call
   * ```
   *
   * @type {Promise<boolean>}
   */
  public connectorReady: Promise<boolean> = Promise.resolve(false)

  /**
   * Partial URL without sensible data.
   */
  protected accessor url: URL = new URL('znx://' + DEFAULT_URI_CONNECTOR)

  /**
   * Constructor that wraps the `startConnection` and `stopConnection` methods
   * to add automatic connection lifecycle handling.
   *
   * If the connector's `startMode` is set to `'lazy'`, the connection is started automatically on instantiation.
   */
  constructor(contextId: string, uri: string) {
    super(contextId)
    // (queueMicrotask ensures private fields are ready before execution)
    this.connectorReady = new Promise<boolean>((resolve) => {
      queueMicrotask(() => {
        // Wrapper startConnection method
        const originalStartConnection = this.startConnection.bind(this)
        this.startConnection = (_uri: string = uri) => {
          if (this.connected || this.startCalled) return true
          const validURI = this.preStartConnection(_uri)
          const connection = originalStartConnection(validURI)
          return this.postStartStopConnection(connection, 'startCalled')
        }
        // Wrapper stopConnection method
        const originalStopConnection = this.stopConnection.bind(this)
        this.stopConnection = () => {
          if (!this.connected || this.stopCalled) return true
          this.stopCalled = true
          const connection = originalStopConnection()
          return this.postStartStopConnection(connection, 'stopCalled')
        }

        resolve(true)
      })
    })
  }

  private preStartConnection(uri: string) {
    //TODO: validate protocol, only for zanix cloud projects
    const url = validateURI(uri)

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

    return validURI
  }

  private postStartStopConnection(
    connection: Promise<boolean> | boolean,
    type: 'startCalled' | 'stopCalled',
  ) {
    const setConnectionStatus = (result: boolean) => {
      this.connected = type === 'startCalled' ? result : !result
    }

    if (connection instanceof Promise) {
      connection.then((result: boolean) => {
        setConnectionStatus(result)
        this[type] = false
      })
    } else {
      setConnectionStatus(connection)
      this[type] = false
    }

    return connection
  }

  /**
   * Indicates whether the connector is currently connected.
   * @type {boolean}
   * @readonly
   */
  protected get connected(): boolean {
    return this.#connected
  }

  protected set connected(value: boolean) {
    this.#connected = value
  }

  /**
   * Starts the connection to the external service.
   *
   * This method is overridden internally to prevent multiple simultaneous or redundant
   * connection attempts. If already connected or a start is in progress, it exits early.
   *
   * If the original implementation returns a `Promise`, the connection state is updated once it resolves.
   *
   * @remarks
   * Consumers **must await `connectorReady`** before calling this method to ensure
   * that `startConnection` connector method has been properly initialized.
   *
   * @param {unknown[]} uri - URI needed for connection
   * @abstract
   * @returns {Promise<boolean> | boolean} A boolean that indicates whether the connection was successful.
   */
  protected abstract startConnection(uri?: string): Promise<boolean> | boolean

  /**
   * Stops the connection to the external service.
   *
   * Like `startConnection()`, this method is wrapped to ensure that it runs safely,
   * preventing duplicate stop attempts. If the connector is already disconnected or stopping, it exits early.
   *
   * @remarks
   * Consumers **must await `connectorReady`** before calling this method to ensure
   * that `stopConnection` connector method has been properly initialized.
   *
   * @abstract
   * @returns {Promise<boolean> | boolean} A boolean that indicates whether the disconnection was successful.
   */
  protected abstract stopConnection(): Promise<boolean> | boolean
}
