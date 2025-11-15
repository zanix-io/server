import type { ZanixAsyncmqConnector } from 'connectors/core/asyncmq.ts'
import type { ZanixDatabaseConnector } from 'connectors/core/database.ts'
import type { ZanixWorkerProvider } from 'providers/core/worker.ts'
import type { ZanixCacheProvider } from 'providers/core/cache.ts'
import type {
  CoreConnectorTemplates,
  ZanixConnectorsGetter,
  ZanixProvidersGetter,
} from 'typings/targets.ts'

import { getConnectors, getProviders } from 'utils/targets.ts'
import ConnectorCoreModules from 'connectors/core/all.ts'
import ProviderCoreModules from 'providers/core/all.ts'
import { ContextualBaseClass } from './contextual.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * Abstract base class that provides access to core connectors such as worker, asyncmq, cache, and database.
 *
 * This class extends from `ContextualBaseClass` and adds functionality to retrieve and interact with
 * core system connectors. It is designed to be extended by more specific implementations that will
 * leverage these connectors in a modular system.
 *
 * The class retrieves the connectors based on the type of the generic parameter `T`, which represents
 * the core connector templates. If the connector types in `T` are compatible with the core connector modules
 * (like worker, asyncmq, cache, and database), they will be returned as the appropriate types.
 *
 * **Note:** This class should only be used as a base class for concrete implementations and not instantiated directly.
 *
 * @abstract
 * @extends ContextualBaseClass
 * @template T - The type representing the core connectors used in the current implementation. Defaults to `object`.
 */
export abstract class CoreBaseClass<T extends CoreConnectorTemplates = object>
  extends ContextualBaseClass {
  #contextId

  /**
   * Creates an instance of `CoreBaseClass`.
   *
   * @param {string} [contextId] - Optional context ID for the instance. If not provided, the context ID will be retrieved from Async Local Storage (ALS) if available.
   */
  constructor(contextId?: string) {
    super(contextId)
    this.#contextId = contextId
  }

  // TODO: process public instance properties to restrict it for security issues

  /**
   * Retrieves the asyncmq connector associated with the instance.
   * Connectors to message brokers such as RabbitMQ, Kafka, MQTT, etc.
   *
   * If the `asyncmq` connector is specified in the generic type `T`, it will return that specific connector type.
   * Otherwise, it defaults to returning a `ZanixAsyncmqConnector`.
   *
   * @protected
   * @returns {T['asyncmq'] extends ZanixAsyncmqConnector ? T['asyncmq'] : ZanixAsyncmqConnector} The asyncmq connector instance associated with the current context.
   */
  protected get asyncmq(): T['asyncmq'] extends ZanixAsyncmqConnector ? T['asyncmq']
    : ZanixAsyncmqConnector {
    return ProgramModule.targets.getConnector<
      T['asyncmq'] extends ZanixAsyncmqConnector ? T['asyncmq'] : ZanixAsyncmqConnector
    >(ConnectorCoreModules.asyncmq.key, { contextId: this.#contextId })
  }

  /**
   * Retrieves the database connector associated with the instance.
   * Connectors to relational or non-relational databases, such as
   * PostgreSQL, MySQL, MongoDB, or SQLite.
   *
   * If the `database` connector is specified in the generic type `T`, it will return that specific connector type.
   * Otherwise, it defaults to returning a `ZanixDatabaseConnector`.
   *
   * @protected
   * @returns {T['database'] extends ZanixDatabaseConnector ? T['database'] : ZanixDatabaseConnector} The database connector instance associated with the current context.
   */
  protected get database(): T['database'] extends ZanixDatabaseConnector ? T['database']
    : ZanixDatabaseConnector {
    return ProgramModule.targets.getConnector<
      T['database'] extends ZanixDatabaseConnector ? T['database'] : ZanixDatabaseConnector
    >(ConnectorCoreModules.database.key, { contextId: this.#contextId })
  }

  /**
   * Retrieves the cache `provider` associated with the instance.
   * Target to caching backends such as Redis, Memcached, or in-memory stores.
   *
   * If the `cache` provider is specified in the generic type `T`, it will return that specific provider type.
   * Otherwise, it defaults to returning a `ZanixCacheProvider`.
   *
   * @protected
   * @returns {T['cache'] extends ZanixCacheProvider ? T['cache'] : ZanixCacheProvider} The cache provider instance associated with the current context.
   */
  protected get cache(): T['cache'] extends ZanixCacheProvider ? T['cache'] : ZanixCacheProvider {
    return ProgramModule.targets.getProvider<
      T['cache'] extends ZanixCacheProvider ? T['cache'] : ZanixCacheProvider
    >(ProviderCoreModules.cache.key, { contextId: this.#contextId })
  }

  /**
   * Retrieves the worker provider associated with the instance,
   * Target to interact with connectors as BullMQ, Agenda, Temporal, or custom job queues.
   *
   * If the `worker` provider is specified in the generic type `T`, it will return that specific provider type.
   * Otherwise, it defaults to returning a `ZanixWorkerProvider`.
   *
   * @protected
   * @returns {T['worker'] extends ZanixWorkerProvider ? T['worker'] : ZanixWorkerProvider} The worker provider instance associated with the current context.
   */
  protected get worker(): T['worker'] extends ZanixWorkerProvider ? T['worker']
    : ZanixWorkerProvider {
    return ProgramModule.targets.getProvider<
      T['worker'] extends ZanixWorkerProvider ? T['worker'] : ZanixWorkerProvider
    >(ProviderCoreModules.worker.key, { contextId: this.#contextId })
  }

  /**
   * Accesses the connectors registered within the system.
   *
   * This getter provides a utility to dynamically retrieve and interact with different connectors, facilitating
   * modular and reusable logic. It supports seamless communication between providers and their
   * associated connectors.
   *
   * Use this utility when you need to access specific connectors within your provider's logic or orchestration layer.
   *
   * @protected
   * @returns {ZanixConnectorsGetter} A utility for retrieving and interacting with other connectors.
   */
  protected get connectors(): ZanixConnectorsGetter {
    return getConnectors(this.#contextId)
  }

  /**
   * Accesses the providers registered within the system.
   *
   * This getter exposes a utility that allows this provider to retrieve and communicate with other providers,
   * enabling the orchestration of more complex infrastructure logic.
   * Use this method for composing features that are already implemented in other providers, helping to build
   * layered and reusable system components.
   *
   * Use this utility when you need combining or reusing existing provider functionality
   * that is already implemented elsewhere in the system.
   *
   * @protected
   * @returns {ZanixProvidersGetter} A utility for retrieving and interacting with other providers.
   */
  protected get providers(): ZanixProvidersGetter {
    return getProviders(this.#contextId)
  }
}
