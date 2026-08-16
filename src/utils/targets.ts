import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { ModuleTypes, StartMode } from 'typings/program.ts'

import { INSTANCE_KEY_SEPARATOR, ZANIX_PROPS } from './constants.ts'
import ProgramModule from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'

// WeakMap to associate each class constructor with its unique ID.
// WeakMap ensures that once the class is no longer referenced, its entry is GC'ed.
const classIds = new WeakMap<{ name: string }, string>()
let counter = 1

const types: ModuleTypes[] = ['connector', 'provider', 'interactor']

/** Target module setup startup initialization */
const targetModuleInit = (key: string) => {
  const [type, id] = key.split(INSTANCE_KEY_SEPARATOR) as [ModuleTypes, string]
  const instance = ProgramModule.targets['getInstance']<ZanixConnector>(
    id,
    type,
  )

  if (type !== 'connector') return

  return connectorModuleInitialization(instance)
}

/**
 * Returns a unique internal key associated with a given class-like target object.
 *
 * If the target was previously assigned a key, the existing key is returned.
 * Otherwise, a new unique key is generated and stored. Keys are scoped to the
 * identity of the object (via a `WeakMap`), not just its name—meaning two different
 * classes that happen to share the same `name` will still receive distinct keys.
 *
 * @param {{ name: string }} [target] - The target object (typically a class constructor)
 * for which to obtain or generate a unique key. If omitted, an empty string is returned.
 *
 * @returns {string} A unique identifier of the form `Z$<name>$<counter>` associated with
 * the given target, or an empty string if no target was provided.
 *
 * @example
 * ```ts
 * class A {}
 * class B {}
 * getTargetKey(A) // e.g. "Z$A$1"
 * getTargetKey(B) // e.g. "Z$B$2"
 * getTargetKey(A) // "Z$A$1" (same reference, same key returned)
 * ```
 */
export const getTargetKey = (target?: { name: string }): string => {
  // If no target provided, return empty string
  if (!target) return ''

  const { name } = target

  // Check if this class already has an assigned key.
  const existing = classIds.get(target)
  if (existing) return existing

  // Otherwise, create a new unique key for this specific class reference.
  // Even if another class has the same `name`, it will receive a different key.
  const newId = `Z$${name}$${counter++}`
  classIds.set(target, newId)

  return newId
}

/**
 * Resolves the DI target key a `@Connector`-decorated class was actually registered under —
 * `'database'` for a class aliased to a core slot (regardless of subclassing, since the alias is
 * keyed by the slot's string, not the concrete class), or the class's own auto-generated
 * `getTargetKey` key otherwise. Reads the metadata `@Connector` already wrote to `Target.prototype`
 * at decoration time (`defineConnectorDecorator`/`BaseInstancesContainer.toBeInstantiated`) — no new
 * computation, just exposing an already-resolved value.
 *
 * Useful to identify a connector class *before* any instance exists — e.g. `@zanix/datamaster`'s
 * `registerModel(model, type, ConnectorClass)` uses this to bind a model to a specific connector
 * without requiring an explicit `slot` (two different connector classes always resolve to two
 * different keys, decorated with a slot or not).
 *
 * @param {Function} Target - The connector class to resolve. Must already be `@Connector`-decorated.
 * @returns {string | undefined} The resolved key, or `undefined` if `Target` hasn't been decorated yet.
 *
 * @example
 * ```ts
 * @Connector({ slot: 'otrabd' })
 * class OtraBD extends ZanixConnector { ... }
 *
 * getConnectorKey(OtraBD) // "otrabd" if pre-registered via registerCoreConnectorSlot, else "Z$OtraBD$n"
 * ```
 */
// deno-lint-ignore ban-types
export function getConnectorKey(Target: Function): string | undefined {
  return (Target.prototype as { [ZANIX_PROPS]?: { key?: string } })
    ?.[ZANIX_PROPS]?.key
}

/**
 * Waits for a connector instance to become fully ready and healthy: first `instance.isReady`,
 * then polls `instance.isHealthy()` (using the instance's own `timeoutConnection`/`retryInterval`
 * options) until it reports healthy or the timeout elapses.
 *
 * Exported publicly so a caller composing connectors OUTSIDE the `@Connector`/`TargetContainer`
 * decorator path (which normally runs this automatically via `targetInitializations`) can still
 * reuse the exact same health-gating instead of re-implementing it.
 *
 * @param instance An already-constructed `ZanixConnector` instance.
 * @returns A promise that resolves to `true` once the instance is ready and healthy.
 * @throws {InternalError} if the health check does not report healthy before `timeoutConnection`
 * elapses.
 */
export const connectorModuleInitialization = (
  instance: ZanixConnector,
): Promise<boolean> => {
  const timeout = instance['timeoutConnection']
  const retryInterval = instance['retryInterval']

  // Check for healthy
  const waitForHealthWithTimeout = (): Promise<boolean> => {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const checkHealth = async () => {
        const healthy = await instance.isHealthy()

        if (healthy) return resolve(true)

        if (Date.now() - startTime > timeout) {
          reject(
            new InternalError('Health check failed: Timeout reached', {
              meta: {
                connectorName: instance.constructor.name,
                method: 'isHealthy',
                timeoutDuration: timeout,
                retryInterval: retryInterval,
                source: 'zanix',
              },
            }),
          )
        } else {
          setTimeout(checkHealth, retryInterval)
        }
      }

      checkHealth()
    })
  }

  // Wait for healthy
  return new Promise((resolve, reject) => {
    instance.isReady
      .then(async () => {
        try {
          const healthy = await waitForHealthWithTimeout()
          resolve(healthy)
        } catch (error) {
          reject(error)
        }
      })
      .catch(reject)
  })
}

/**
 * Initializes the targets based on the specified start mode.
 * Prioritizes connectors first, then providers, and finally the interactor.
 *
 * @param {Exclude<StartMode, 'lazy'>} startMode - The start mode for initialization.
 *     The 'lazy' mode is excluded from the possible start modes.
 *     It can be one of the values defined in `StartMode`.
 *
 * @returns {Promise<void>} A promise that resolves when all targets
 *     have been initialized successfully. The targets are initialized in parallel using `Promise.all()`.
 *
 * @async
 *
 * @example
 * // Example usage:
 * const startMode: StartMode = 'immediate';
 * await targetInitializations(startMode);
 */
export const targetInitializations = async (
  startMode: Exclude<StartMode, 'lazy'>,
): Promise<void> => {
  for await (const type of types) {
    await Promise.all(
      ProgramModule.targets.getTargetsByStartMode(startMode, type).map(
        targetModuleInit,
      ),
    )
  }
}

/**
 * Closes all 'connector' type connections defined in `ProgramModule`.
 * It uses the `close` method of each connector to close them concurrently.
 *
 * Also clears the `type:connector` registry once done with it — this is the only reader of that
 * registry after boot, so process shutdown (not boot completion) is its true end of life; see
 * `InternalProgram.cleanupInitializationsMetadata`'s doc for why it's never purged there instead.
 *
 * @async
 * @function closeAllConnections
 * @returns {Promise<void>} A promise that resolves when all connections have been closed.
 *
 * @throws {Error} If an error occurs while closing any connection, the promise will be rejected.
 */
export const closeAllConnections = async (): Promise<void> => {
  const keys = ProgramModule.targets.getTargetsByType('connector')

  await Promise.all(
    keys.map((key) => {
      return ProgramModule.targets.getConnector<ZanixConnector>(key, {
        useExistingInstance: true,
      })
        ?.['close']()
    }),
  )

  ProgramModule.targets.resetContainer(['type:connector'])
}

/**
 * Cleans up and resets any metadata managed by `ProgramModule` initializations.
 * This is typically used to free resources or reset internal state.
 *
 * @function cleanupInitializationsMetadata
 * @returns {void}
 */
export const cleanupInitializationsMetadata = (): void => {
  ProgramModule.cleanupInitializationsMetadata('onBoot')
  ProgramModule.cleanupInitializationsMetadata('postBoot')
}
