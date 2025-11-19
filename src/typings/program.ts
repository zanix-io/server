import type { RedisClientType } from 'npm:redis@^5.9.0'
import type { ClassConstructor } from './targets.ts'

/**
 * Represents the types of request or event handlers in the system.
 * ℹ️ These are **instantiated** modules
 *
 * - `'controller'`: Handles HTTP requests in a typical MVC pattern.
 * - `'socket'`: Handles WebSocket events or messages.
 * - `'resolver'`: Handles GraphQL resolvers or similar query-based operations.
 */
export type HandlerTypes =
  | 'controller'
  | 'socket'
  | 'resolver'

/**
 * Represents general module target types that are part of backend architecture.
 * ℹ️ These are **instantiated** modules
 *
 * - `'connector'`: Used for external service or database integrations.
 * - `'interactor'`: Contains business logic, often called use-cases.
 */
export type GeneralTargetTypes =
  | 'connector'
  | 'interactor'
  | 'provider'

/**
 * Union type of all module types in the system, including both handler-specific
 * and general backend roles.
 * ℹ️ These are **instantiated** modules
 *
 * Can be any of:
 * - `HandlerTypes`: `'controller'`, `'socket'`, `'resolver'`, `'subscriber'`,
 * - `GeneralTargetTypes`: `'connector'`, `'interactor'`
 */
export type ModuleTypes =
  | HandlerTypes
  | GeneralTargetTypes

export type GenericTargets = 'custom'

/**
 * Defines the available connectors for cache systems.
 *
 * These connectors represent different types of cache systems that can be used with the application.
 *
 * - `'local'`: Represents a local in-memory cache.
 * - `'memcached'`: Represents the Memcached caching system.
 * - `'redis'`: Represents the Redis caching system.
 * - `GenericTargets`: Allows the inclusion of other generic cache connectors.
 */
export type CoreCacheConnectors = 'local' | 'memcached' | 'redis' | GenericTargets

export type CoreCacheTypes<K> = {
  redis: Promise<RedisClientType>
  // deno-lint-ignore no-explicit-any
  local: Map<K, any>
  memcached: object
  // deno-lint-ignore no-explicit-any
  custom: any
}

/**
 * Defines the available connectors for worker systems.
 *
 * These connectors represent different types of worker systems that can be used for background jobs or task processing.
 *
 * - `'local'`: Represents a local worker system for task execution.
 * - `'bull'`: Represents the Bull queue system for job management.
 * - `GenericTargets`: Allows the inclusion of other generic worker connectors.
 */
export type CoreWorkerConnectors = 'local' | 'bull' | GenericTargets

/**
 * Defines the available connectors in the system, including cache, worker, async message queues, and database systems.
 *
 * This type includes connectors for different system components:
 * - `cache:{CoreCacheConnectors}`: Represents cache connectors, such as Redis or Memcached.
 * - `worker:{CoreWorkerConnectors}`: Represents worker connectors, such as Bull or local worker systems.
 * - `'asyncmq'`: Represents an asynchronous message queue system.
 * - `'database'`: Represents a generic database connector.
 * - `'kvLocal'`: Represents a generic key-value store connector.
 */
export type CoreConnectors =
  | `cache:${CoreCacheConnectors}`
  | `worker:${CoreWorkerConnectors}`
  | 'asyncmq'
  | 'database'
  | 'kvLocal'

export type CoreProviders = 'cache' | 'worker'

export type ConnectorTypes = CoreConnectors | GenericTargets
export type ProviderTypes = CoreProviders | GenericTargets

/**
 * **SINGLETON**: Guarantees a single instance throughout the entire application lifecycle.
 * The same instance is reused across the application's entire execution.
 *
 * **SCOPED**: Creates a single instance per server request.
 * A new instance is created for each request, but it is reused throughout the duration of that request.
 *
 * **TRANSIENT**: Creates a new instance for each call or invocation.
 * No instance is reused, and each call receives a fresh, independent instance.
 */
export type Lifetime = 'SINGLETON' | 'SCOPED' | 'TRANSIENT'

/**
 * Defines the initialization mode for a service.
 *
 * - `onSetup`: Initialized before the server starts. If the initialization fails, the server will not start.
 * - `onBoot`: Initialized right after `onSetup`. The server waits for the initialization to complete before proceeding.
 * - `postBoot`: Initialized after the server has started. This initialization happens in the background and does not block the startup.
 * - `lazy`: Initialized only when needed. Does not affect the server startup time and does not block the flow.
 */
export type StartMode = 'onSetup' | 'onBoot' | 'postBoot' | 'lazy'

export type MetadataTypes = 'data' | 'target'

export type MetadataTypesKey = `${MetadataTypes}:${string}`

export type MetadataObjects = object | string | number | boolean

export type MetadataTargetSymbols = {
  Target?: ClassConstructor
  propertyKey?: string // property or class symbol
  type?: 'handler' | 'general'
}

export type MetadataInstances<
  T extends ClassConstructor = ClassConstructor,
> = {
  /** The class that will be instantiated */
  Target: T
  /** Defines the lifetime strategy for the instance (e.g., SINGLETON, TRANSIENT, SCOPED) */
  lifetime: Lifetime
  /** Specifies how the instance should be initialized at startup */
  startMode: StartMode
  /** The classification or category of the target class within the module */
  type: ModuleTypes
  /** The data to be injected to the target prototype */
  dataProps?: Record<string, MetadataObjects | undefined>
}

export type ZanixGlobalExports<T> = { exports?: T }
