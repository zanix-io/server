import type { ConnectorOptions } from 'typings/targets.ts'

import { ContextualBaseClass } from '../base/contextual.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'
import logger from '@zanix/logger'

/**
 * Abstract base class for implementing service connectors in the Zanix framework.
 *
 * `ZanixConnector` provides a standardized lifecycle for managing connections to external services
 * such as databases, APIs, queues, etc.
 *
 * This class is intended to be extended by concrete connector implementations.
 *
 * @abstract
 * @extends ContextualBaseClass
 */
export abstract class ZanixConnector extends ContextualBaseClass {
  /** The maximum time (in milliseconds) to wait for the connection to be established during auto-initialization. */
  protected timeoutConnection: number
  /** The interval (in milliseconds) between each retry when attempting to auto-initialize. */
  protected retryInterval: number

  /** Constructor with initialization logic where the connector might be auto-initialized. */
  constructor(options: string | ConnectorOptions = {}) {
    const { contextId, autoInitialize } = typeof options === 'string'
      ? { contextId: options }
      : options

    super(contextId)

    const { data, startMode } = this[ZANIX_PROPS]

    // Auto-initialization settings
    const autoInitializeOpts = data?.autoInitialize ?? autoInitialize
    const { autoInit, timeoutConnection = 10000, retryInterval = 500 } =
      typeof autoInitializeOpts === 'object'
        ? { autoInit: true, ...autoInitializeOpts }
        : { autoInit: autoInitializeOpts ?? true }

    this.timeoutConnection = timeoutConnection
    this.retryInterval = retryInterval

    // Start connection (queueMicrotask ensures private fields are ready before execution)
    if (autoInit) {
      this.isReady = new Promise((resolve, reject) =>
        queueMicrotask(async () => {
          try {
            const initialize = this.initialize()

            // Resolve the promise based on the initialization result
            if (initialize instanceof Promise) {
              await initialize // Ensure that the promise resolves before resolving isReady
            }

            // Mark as initialized successfully
            resolve(true)
          } catch (error) {
            logger.error(
              `Failed to initialize connector '${this.constructor.name}' during '${startMode}' startup mode.`,
              error,
              {
                code: 'CONNECTOR_ERROR',
                meta: {
                  connectorName: this.constructor.name,
                  startMode,
                  method: 'initialize',
                  source: 'zanix',
                },
              },
            )
            // Handle initialization failure if needed
            reject(error)
          }
        })
      )
    }
  }

  /**
   * Indicates whether the connector has been successfully auto-initialized.
   *
   * This property is a `Promise<boolean>` that resolves to `true` once the connector has been
   * successfully initialized automatically. If the auto-initialization process completes
   * successfully without requiring manual intervention, the promise resolves to `true`.
   * If the initialization fails, the promise resolves to `false`.
   *
   * If **auto-initialization** is disabled, this promise will resolve to `true` by default,
   * as no auto-initialization is required, and the connector is considered ready immediately.
   *
   * This property allows you to track the status of the initialization process:
   * - If auto-initialization is enabled, it reflects whether the process completed successfully.
   * - If auto-initialization is disabled, it resolves to `true` since no initialization process is triggered.
   *
   * @type {Promise<boolean>} A promise that resolves to `true` if the connector is ready,
   *                          or `false` if auto-initialization failed or is still in progress.
   */
  public readonly isReady: Promise<boolean> = Promise.resolve(true)

  /**
   * Initializes the connector process to the external service.
   *
   * This method is responsible for initiating the connector process with the external service, which could include establishing
   * a connection, setting up necessary configurations, or performing any other setup tasks required. It may be synchronous or
   * asynchronous, depending on the implementation. If asynchronous, it returns a `Promise<void>` to indicate when the initialization
   * process is complete.
   *
   * @abstract
   * @returns {Promise<void> | void} Whether the connector process was successfully initialized.
   */
  protected abstract initialize(): Promise<void> | void

  /**
   * Terminates the connector process to the external service.
   *
   * This method is responsible for gracefully closing or shutting down the connector process with the external service. It may be
   * synchronous or asynchronous, depending on the implementation. If asynchronous, it returns a `Promise<void>` to indicate when
   * the termination process is complete.
   *
   * @abstract
   * @returns {unknown} Whether the connector process was successfully terminated.
   */
  protected abstract close(): unknown

  /**
   * Checks the health status of the external service.
   *
   * This method is essential for ensuring the system can verify whether the external service is healthy and ready to operate.
   *
   * When the `startMode` is not set to `lazy` (i.e., when using `onSetup` or `onBoot` setup modes) and `autoInitialize` is `true`,
   * the system will wait for `isHealthy()` to return `true` before proceeding with the initialization process.
   * This ensures that the external service is healthy and ready before the system continues its startup.
   *
   * If `initialize()` has not been called, or if the health check fails (i.e., `isHealthy()` returns `false`), the system will halt
   * the startup process to prevent potential issues from unready services.
   *
   * It is essential to correctly implement `isHealthy()`. Failure to do so may result in inaccurate health checks
   * and prevent the system from starting up properly.
   *
   * @abstract
   * @returns {Promise<boolean> | boolean} A method that indicates whether the external service is healthy.
   *   - Returns `true` if the service is healthy and ready for operation.
   *   - Returns `false` if the service is unhealthy or unavailable.
   *   - Returns a `boolean` if the health check is synchronous, or a `Promise<boolean>` if the health check is asynchronous.
   *
   * @throws {Error} If called before the system has been initialized properly (i.e., if `initialize()` hasn't been executed).
   *
   * @example
   * // Example usage of `isHealthy` in a setup process
   * const isHealthy = await myService.isHealthy();
   * if (isHealthy) {
   *   console.log('Service is healthy, proceeding with startup...');
   * } else {
   *   console.error('Service is not healthy, aborting startup...');
   * }
   */
  public abstract isHealthy(): Promise<boolean> | boolean
}
