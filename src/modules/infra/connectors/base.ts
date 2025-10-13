import { TargetBaseClass } from 'modules/infra/base/target.ts'

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
 * @extends TargetBaseClass
 */
export abstract class ZanixConnector extends TargetBaseClass {
  #connected: boolean = false
  #startCalled: boolean = false
  #stopCalled: boolean = false

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

  private get startCalled() {
    return this.#startCalled
  }

  private set startCalled(value: boolean) {
    this.#startCalled = value
  }

  private get stopCalled() {
    return this.#stopCalled
  }

  private set stopCalled(value: boolean) {
    this.#stopCalled = value
  }

  /**
   * Constructor that wraps the `startConnection` and `stopConnection` methods
   * to add automatic connection lifecycle handling.
   *
   * If the connector's `startMode` is set to `'lazy'`, the connection is started automatically on instantiation.
   */
  constructor() {
    super()

    const originalStartConnection = this.startConnection.bind(this)
    this.startConnection = function () {
      if (this.connected || this.startCalled) return
      this.startCalled = true
      const connection = originalStartConnection()

      if (connection instanceof Promise) {
        connection.then(() => {
          this.connected = true
        }).finally(() => {
          this.startCalled = false
        })
      } else {
        this.connected = true
        this.startCalled = false
      }

      return connection
    }

    const originalStopConnection = this.stopConnection.bind(this)
    this.stopConnection = function () {
      if (!this.connected || this.stopCalled) return
      this.stopCalled = true
      const connection = originalStopConnection()
      if (connection instanceof Promise) {
        connection.then(() => {
          this.connected = false
        }).finally(() => {
          this.stopCalled = false
        })
      } else {
        this.connected = false
        this.stopCalled = false
      }

      return connection
    }

    // Starting connection on lazy instanciation
    if (this['_znxProps'].startMode === 'lazy') this.startConnection()
  }

  /**
   * Starts the connection to the external service.
   *
   * This method is overridden internally to prevent multiple simultaneous or redundant
   * connection attempts. If already connected or a start is in progress, it exits early.
   *
   * If the original implementation returns a `Promise`, connection state is updated once it resolves.
   *
   * @abstract
   * @returns {Promise<void> | void} A promise or void, depending on the implementation.
   */
  public abstract startConnection(): Promise<void> | void

  /**
   * Stops the connection to the external service.
   *
   * Like `startConnection()`, this method is wrapped to ensure that it runs safely,
   * preventing duplicate stop attempts. If the connector is already disconnected or stopping, it exits early.
   *
   * @abstract
   * @returns {Promise<void> | void} A promise or void, depending on the implementation.
   */
  public abstract stopConnection(): Promise<void> | void
}
