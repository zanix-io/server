import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import type { CoreConnectors, CoreProviders } from 'typings/program.ts'
import type {
  ZanixConnectorClass,
  ZanixConnectorsGetter,
  ZanixInteractorClass,
  ZanixInteractorGeneric,
  ZanixInteractorsGetter,
  ZanixProviderClass,
  ZanixProviderGeneric,
  ZanixProvidersGetter,
} from 'typings/targets.ts'

import ProgramModule from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'

// WeakMap to associate each class constructor with its unique ID.
// WeakMap ensures that once the class is no longer referenced, its entry is GC'ed.
const classIds = new WeakMap<{ name: string }, string>()
let counter = 1

export const getTargetKey = (target?: { name: string }) => {
  // If no target provided, return empty string
  if (!target) return ''

  const { name } = target

  // Prevent the use of reserved class name prefixes.
  if (name.startsWith('_Zanix')) {
    throw new InternalError(
      "Class names starting with '_Zanix' are reserved and cannot be used. Please choose a different class name.",
    )
  }

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

export const getInteractors: (ctxId: string) => ZanixInteractorsGetter = (ctxId) => ({
  get: <T extends ZanixInteractorGeneric>(
    Interactor: ZanixInteractorClass<T>,
  ): T => ProgramModule.targets.getInteractor<T>(getTargetKey(Interactor), { contextId: ctxId }),
})

/**
 * Retrieves a provider from the `ProgramModule` based on the provided context ID.
 *
 * This function creates an object with a `get` method that allows fetching a provider using either
 * a class type (`ZanixProviderClass<D>`) or a string identifier (`CoreProviders`). The `get` method
 * returns the provider associated with the provided key.
 * If a context ID (`ctxId`) is provided, it is passed to the `getProvider` method to scope the provider retrieval.
 *
 * @param {string} [ctxId] - An optional context ID to specify the scope or context of the provider. If not provided,
 *                            the provider is retrieved globally.
 * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `true`
 *
 * @returns {ZanixProvidersGetter} An object with a `get` method that retrieves the requested provider.
 *
 * @example
 * const providers = getProviders('myContextId');
 * const provider = providers.get(MyProviderClass);
 */
export const getProviders: (ctxId?: string, verbose?: boolean) => ZanixProvidersGetter = (
  ctxId,
  verbose,
) => ({
  get: <D extends ZanixProviderGeneric>(
    Provider: ZanixProviderClass<D> | CoreProviders,
  ): D => {
    const key = typeof Provider === 'string' ? Provider : getTargetKey(Provider)
    return ProgramModule.targets.getProvider<D>(key, { contextId: ctxId, verbose })
  },
})

/**
 * Retrieves a connector from the `ProgramModule` based on the provided context ID.
 *
 * This function creates an object with a `get` method that allows fetching a connector using either
 * a class type (`ZanixConnectorClass<D>`) or a string identifier (`CoreConnectors`). The `get` method
 * returns the connector associated with the provided key.
 * If a context ID (`ctxId`) is provided, it is passed to the `getConnector` method to scope the connector retrieval.
 *
 * @param {string} [ctxId] - An optional context ID to specify the scope or context of the connector. If not provided,
 *                            the connector is retrieved globally.
 * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `true`
 *
 * @returns {ZanixConnectorsGetter} An object with a `get` method that retrieves the requested connector.
 *
 * @example
 * const connectors = getConnectors('myContextId');
 * const connector = connectors.get(MyConnectorClass);
 */
export const getConnectors: (ctxId?: string, verbose?: boolean) => ZanixConnectorsGetter = (
  ctxId,
  verbose,
) => ({
  get: <D extends ZanixConnector>(
    Connector: ZanixConnectorClass<D> | CoreConnectors,
  ): D => {
    const key = typeof Connector === 'string' ? Connector : getTargetKey(Connector)
    return ProgramModule.targets.getConnector<D>(key, { contextId: ctxId, verbose })
  },
})
