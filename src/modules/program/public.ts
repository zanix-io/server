import type { CoreConnectors, CoreProviders } from 'typings/program.ts'
import type { RegistryContainer } from './metadata/registry.ts'
import type { ZanixConnector } from 'connectors/base.ts'
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

import { type AsyncContext, asyncContext } from 'modules/infra/base/storage.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from './mod.ts'

/**
 * Represents the main program interface that can be exported and used by other libraries.
 *
 * This class is intended to provide reusable functionality and act as a shared program module.
 *
 * @exports Program
 */

class Program {
  /**
   * AsyncLocalStorage instance that manages a context shared across
   * asynchronous operations within the same request or logical scope.
   *
   * This allows you to store and retrieve contextual information
   * (such as request IDs, tenant info, or user session data)
   * without explicitly passing it through function parameters.
   *
   * @example
   * // Initialize context at the start of a request
   * asyncContext.run({ id: 'abc123' }, async () => {
   *   // Later, anywhere in async code:
   *   console.log(asyncContext.getStore()?.id); // 'abc123'
   * });
   *
   * @type {AsyncContext}
   */
  public asyncContext: AsyncContext = asyncContext

  /**
   * Retrieves a provider from the `ProgramModule` based on the provided context ID.
   *
   * This function creates an object with a `get` method that allows fetching a provider using either
   * a class type (`ZanixProviderClass<D>`) or a string identifier (`CoreProviders`). The `get` method
   * returns the provider associated with the provided key.
   * If a context ID (`ctxId`) is provided, it is passed to the `getProvider` method to scope the provider retrieval.
   *
   * @warning ⚠️ **Important: Use this accessor carefully.**
   * Misusing direct provider retrieval can break dependency injection patterns, bypass lifecycle rules,
   * or lead to unintended singleton/multi-instance behaviors.
   * Prefer relying on framework-managed injection whenever possible.
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
  public getProviders(ctxId?: string, verbose?: boolean): ZanixProvidersGetter {
    return {
      get: <D extends ZanixProviderGeneric>(
        Provider: ZanixProviderClass<D> | CoreProviders,
      ): D => {
        const key = typeof Provider === 'string' ? Provider : getTargetKey(Provider)
        return ProgramModule.targets.getProvider<D>(key, { contextId: ctxId, verbose })
      },
    }
  }

  /**
   * Retrieves a connector from the `ProgramModule` based on the provided context ID.
   *
   * This function creates an object with a `get` method that allows fetching a connector using either
   * a class type (`ZanixConnectorClass<D>`) or a string identifier (`CoreConnectors`). The `get` method
   * returns the connector associated with the provided key.
   * If a context ID (`ctxId`) is provided, it is passed to the `getConnector` method to scope the connector retrieval.
   *
   * @warning ⚠️ **Important: Use this accessor carefully.**
   * Misusing direct provider retrieval can break dependency injection patterns, bypass lifecycle rules,
   * or lead to unintended singleton/multi-instance behaviors.
   * Prefer relying on framework-managed injection whenever possible.
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
  public getConnectors(ctxId?: string, verbose?: boolean): ZanixConnectorsGetter {
    return {
      get: <D extends ZanixConnector>(
        Connector: ZanixConnectorClass<D> | CoreConnectors,
      ): D => {
        const key = typeof Connector === 'string' ? Connector : getTargetKey(Connector)
        return ProgramModule.targets.getConnector<D>(key, { contextId: ctxId, verbose })
      },
    }
  }

  /**
   * Provides access to the internal `RegistryContainer` used by the dependency
   * injection system.
   *
   * This getter exposes the metadata registry responsible for storing DI-related
   * information such as provider definitions, constructor metadata, parameter
   * injection tokens, lifecycle annotations, and other reflection-based data
   * required by the framework to resolve dependencies at runtime.
   *
   * The `RegistryContainer` acts as the backbone of the DI mechanism, allowing
   * the framework to:
   * - Resolve providers and their dependencies
   * - Track scoped or contextual instances
   * - Store metadata generated by decorators (@Inject, @Provider, etc.)
   * - Support advanced DI features such as multi-providers or contextual injection
   *
   * @protected
   * @returns {RegistryContainer} The DI metadata registry maintained by the `ProgramModule`.
   */
  public get registry(): RegistryContainer {
    return ProgramModule.registry
  }
}

/**
 * A frozen singleton instance of the `Program`,
 * to provide reusable functionality and act as a shared program module.
 *
 * @type {Readonly<Program>}
 */
const PublicProgramModule: Readonly<Program> = Object.freeze(new Program())

export const getConnectors = PublicProgramModule.getConnectors
export const getProviders = PublicProgramModule.getProviders
export const getInteractors: (ctxId: string) => ZanixInteractorsGetter = (ctxId) => ({
  get: <T extends ZanixInteractorGeneric>(
    Interactor: ZanixInteractorClass<T>,
  ): T => ProgramModule.targets.getInteractor<T>(getTargetKey(Interactor), { contextId: ctxId }),
})

export default PublicProgramModule
