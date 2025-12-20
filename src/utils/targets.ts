import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { ModuleTypes, StartMode } from 'typings/program.ts'

import { INSTANCE_KEY_SEPARATOR } from './constants.ts'
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
  const instance = ProgramModule.targets['getInstance']<ZanixConnector>(id, type)

  if (type !== 'connector') return

  return connectorModuleInitialization(instance)
}

/**
 * Returns a unique internal key associated with a given class-like target object.
 *
 * If the target was previously assigned a key, the existing key is returned.
 * Otherwise, a new unique key is generated and stored. Keys are scoped to the
 * identity of the object, not just its name—meaning two different objects with
 * the same `name` will still receive distinct keys.
 *
 * **Reserved names:**
 * Class names starting with `"_Zanix"` are forbidden. Attempting to use one
 * will throw an `InternalError`.
 *
 * @param {{ name: string }} [target] - The target object (typically a class constructor)
 * for which to obtain or generate a unique key. If omitted, an empty string is returned.
 *
 * @returns {string} A unique identifier associated with the given target, or an empty
 * string if no target was provided.
 *
 * @example
 * // Different classes with the same name get different keys:
 * class A {}
 * class B {}
 * A.name = "Shared";
 * B.name = "Shared";
 * getTargetKey(A); // e.g. "Z$Shared$1"
 * getTargetKey(B); // e.g. "Z$Shared$2"
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

/** Connector module setup init mode */
export const connectorModuleInitialization = (instance: ZanixConnector) => {
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
      ProgramModule.targets.getTargetsByStartMode(startMode, type).map(targetModuleInit),
    )
  }
}
