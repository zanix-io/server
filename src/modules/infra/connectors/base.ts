import type { ConnectorOptions } from 'typings/targets.ts'

import { logAppError } from 'utils/errors/helper.ts'
import { ContextualBaseClass } from '../base/contextual.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

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
  /**
   * The DI target key this connector class was actually registered under — `'database'` for a
   * class aliased to that core slot (regardless of subclassing), or an auto-generated key otherwise.
   * Same value {@link getConnectorKey} (`utils/targets.ts`) resolves from the class itself, exposed
   * here on the instance for convenience. Stable per connector *class*, not per instance — the
   * correct dimension to namespace per-connector state by (e.g. `@zanix/datamaster`'s model/seeder
   * registries), since unlike `this.constructor`, it doesn't change when a consumer subclasses a
   * core connector.
   */
  protected readonly connectorKey: string

  /** Constructor with initialization logic where the connector might be auto-initialized. */
  constructor(options: string | ConnectorOptions = {}) {
    const { contextId, autoInitialize } = typeof options === 'string'
      ? { contextId: options }
      : options

    super(contextId)

    const { data, startMode, key } = this[ZANIX_PROPS]

    this.connectorKey = key

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
      // `onSetup`/`onBoot` run BEFORE the server starts serving (`bootstrapServersImpl`,
      // `webserver/mod.ts`) — a failure there already aborts boot, and whatever's meant to keep
      // this process alive across a real failure (an orchestrator's restart policy — k8s's
      // `restartPolicy: Always`, Docker's `restart: on-failure`, PM2, systemd — where configured)
      // already retries at the process level, typically with its own backoff. Retrying in-process
      // here too would only delay that fail-fast signal without adding any protection it doesn't
      // already get from a single attempt. `postBoot` (and `lazy`, resolved on demand rather than
      // gating boot at all) get no such external safety net — nothing else is going to retry a
      // connector that fails after the server already reported started, which is exactly the
      // "have to restart the service by hand" case retrying here actually fixes.
      const shouldRetry = startMode !== 'onSetup' && startMode !== 'onBoot'

      this.isReady = new Promise((resolve, reject) => {
        const deadline = Date.now() + this.timeoutConnection
        let attempts = 0

        // Retry `initialize()` at `retryInterval` until it succeeds or `timeoutConnection`
        // elapses (only when `shouldRetry` — see above) — a connector whose backing service isn't
        // reachable yet at the exact instant of boot (e.g. a container startup race) gets the
        // same retry budget `isHealthy()` polling already gets post-ready
        // (`connectorModuleInitialization`, `utils/targets.ts`), instead of failing permanently
        // after a single attempt. Recurses via `setTimeout` rather than an `await`ing loop,
        // matching `waitForHealthWithTimeout`'s own `checkHealth` (same file).
        const attemptInitialize = async () => {
          attempts++
          try {
            const initialize = this.initialize()

            // Resolve the promise based on the initialization result
            if (initialize instanceof Promise) {
              await initialize // Ensure that the promise resolves before resolving isReady
            }

            // Mark as initialized successfully
            return resolve(true)
          } catch (error) {
            if (shouldRetry && Date.now() < deadline) {
              setTimeout(attemptInitialize, this.retryInterval)
              return
            }

            await logAppError(error, {
              message: `Failed to initialize connector '${
                this.coreDisplayName('from core')
              }' during '${startMode}' startup mode, after ${attempts} attempt(s).`,
              code: 'CONNECTOR_ERROR',
              meta: {
                connectorName: this.coreDisplayName(),
                startMode,
                method: 'initialize',
                attempts,
              },
            })
            // Handle initialization failure if needed
            reject(error)
          }
        }

        queueMicrotask(attemptInitialize)
      })
    }
  }

  /**
   * Human-friendly, log-safe name for this connector instance.
   *
   * A core connector auto-registered via the `@Connector({ slot: ... })` DSL (e.g.
   * `@zanix/asyncmq`'s own `registerConnector`) does so through a locally-declared, decorator-only
   * subclass named `_Zanix<Something>` — an internal implementation detail, never meant to reach a
   * log line. This resolves to `label` (or, if omitted, `` `${this.connectorKey} core` ``) whenever
   * `this.constructor.name` starts with that `_Zanix` prefix, and to the real class name otherwise
   * — i.e. it's a no-op for any ordinary, consumer-authored connector subclass.
   *
   * Centralizes a pattern every core connector package (`@zanix/asyncmq`, `@zanix/datamaster`, ...)
   * previously had to reimplement itself (`this.constructor.name.startsWith('_Zanix') ? '<label>' :
   * this.constructor.name`) just to keep that internal name out of ITS OWN log lines — it did
   * nothing for `ZanixConnector`'s own logging, which always logged the raw, unresolved class name
   * regardless. `ZanixConnector`'s own two call sites now go through it too: the
   * "Failed to initialize connector" error message above passes the explicit `'from core'` label,
   * while its own `meta.connectorName` and the health-check-timeout error's `meta.connectorName`
   * (`connectorModuleInitialization`, `utils/targets.ts`) call it with no label at all, falling
   * back to `` `${this.connectorKey} core` ``.
   *
   * @param {string} [label] - Display name to use for a `_Zanix`-prefixed synthetic subclass.
   * Defaults to `` `${this.connectorKey} core` ``.
   * @returns {string} The resolved display name.
   *
   * @example
   * ```ts
   * // Inside a concrete connector's own constructor/logging:
   * this.name = this.coreDisplayName('asyncmq core')
   * ```
   */
  protected coreDisplayName(label?: string): string {
    const name = this.constructor.name
    if (!name.startsWith('_Zanix')) return name
    return label ?? `${this.connectorKey} core`
  }

  /**
   * Indicates whether the connector has been successfully auto-initialized.
   *
   * This property is a `Promise<boolean>` that resolves to `true` once the connector has been
   * successfully initialized automatically. For `startMode: 'postBoot'` and `'lazy'`,
   * `initialize()` is retried every `retryInterval` until it succeeds or `timeoutConnection`
   * elapses (see the constructor) — nothing else is positioned to retry a connector that fails
   * once the server has already reported started (or that's resolved on demand, well after boot).
   * For `'onSetup'`/`'onBoot'`, there is NO retry: both run before the server starts serving, so a
   * failure there already aborts boot, and whatever's meant to keep the process alive across a
   * real failure (a container/process orchestrator's own restart policy, where configured) already
   * retries at that level — retrying in-process here too would only delay that fail-fast signal.
   * Either way, if every attempt fails, the failure is logged once (`CONNECTOR_ERROR`) and this
   * promise **rejects** with the last error — it does NOT resolve to `false`. Any code awaiting it
   * must handle that rejection explicitly (`connectorModuleInitialization`, `utils/targets.ts`, and
   * `buildReadinessHandler`, `webserver/health.ts`, are the two framework-internal examples).
   *
   * If **auto-initialization** is disabled, this promise resolves to `true` by default, as no
   * auto-initialization is required, and the connector is considered ready immediately.
   *
   * @type {Promise<boolean>} A promise that resolves to `true` once ready, or rejects if every
   * initialization attempt failed within `timeoutConnection`.
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
   * When the `startMode` is not set to `lazy` (i.e., `onSetup`, `onBoot`, or `postBoot`) and `autoInitialize` is `true`,
   * the system will wait for `isHealthy()` to return `true` (`connectorModuleInitialization`, `utils/targets.ts`) —
   * for `onSetup`/`onBoot` this blocks the server from starting; for `postBoot` it runs the same
   * wait, but after the server has already started serving, so nothing is blocked by it.
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
