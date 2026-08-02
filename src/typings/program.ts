import type { RedisClientType } from 'npm:redis@^5.9.0'
import type { ClassConstructor } from './targets.ts'

/**
 * Represents the types of request or event handlers in the system.
 * ℹ️ These are **instantiated** modules
 *
 * - `'controller'`: Handles HTTP requests in a typical MVC pattern.
 * - `'socket'`: Handles WebSocket events or messages.
 * - `'resolver'`: Handles GraphQL resolvers or similar query-based operations.
 * - `'subscriber'`: Handles AsyncMQ jobs.
 */
export type HandlerTypes =
  | 'controller'
  | 'socket'
  | 'resolver'
  | 'subscriber'

/**
 * Represents general module target types that are part of backend architecture.
 * ℹ️ These are **instantiated** modules
 *
 * - `'connector'`: Used for external service or database integrations.
 * - `'interactor'`: Contains business logic, often called use-cases.
 * - `'provider'`: Technical orchestration layer bridging interactors and connectors.
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
 * - `HandlerTypes`: `'controller'`, `'socket'`, `'resolver'`, `'subscriber'`
 * - `GeneralTargetTypes`: `'connector'`, `'interactor'`, `'provider'`
 */
export type ModuleTypes =
  | HandlerTypes
  | GeneralTargetTypes

/** Marker for a user-defined ("custom") connector/provider type, as opposed to a core one. */
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

/** Maps each `CoreCacheConnectors` value to the concrete client type it resolves to. */
export type CoreCacheTypes<K> = {
  /** The connected Redis client, resolved once the connector finishes initializing. */
  redis: Promise<RedisClientType>
  /** An in-process `Map` used as the local cache store. */
  // deno-lint-ignore no-explicit-any
  local: Map<K, any>
  /** The Memcached client instance. */
  memcached: object
  /** The client instance for a custom, user-defined cache connector. */
  // deno-lint-ignore no-explicit-any
  custom: any
}

/**
 * Any core-connector slot key registered via `registerCoreConnectorSlot`
 * (`modules/infra/connectors/core/all.ts`). Deliberately just `string`, not a closed union or an
 * ambiently-augmented type: an earlier design tried making this `keyof` a `declare module`
 * -augmented registry interface, but that ambient-global-augmentation approach doesn't reliably
 * carry through to a real per-key return type anyway (TypeScript never mapped the string argument
 * to a specific return type from it — only validated that the string was "known"), and ambient
 * module augmentation is explicitly unsupported by JSR's `no-slow-types` publish check when it's
 * reachable from a package's public export surface. Real compile-time typing for
 * `this.providers.get(key)`/`this.connectors.get(key)` now comes from the `CoreModules` generic
 * each consumer can explicitly pass to `ZanixInteractor`/`ZanixProvider`/`ZanixConnector`
 * (`typings/targets.ts`) — this type exists only to document intent and give `@Connector`/
 * `@Provider`'s `type` option something narrower than a bare `string` to point at. Validity of a
 * given key is enforced entirely at runtime by `registerCoreConnectorSlot`/`getCoreConnectorSlot`,
 * with an explicit "missing core slot" error naming the slot and the package expected to own it.
 */
// deno-lint-ignore ban-types
export type CoreConnectors = KnownCoreConnectors | (string & {})

/**
 * The connector slot keys `@zanix/server` itself pre-seeds (`ConnectorCoreModules`,
 * `modules/infra/connectors/core/all.ts`) — editor-autocomplete hints only, not an exhaustive or
 * enforced list. `CoreConnectors` still accepts any other string (a slot registered by a package
 * this type doesn't know about), via the `string & {}` widening trick: it's structurally identical
 * to `string` so nothing is rejected, but nominally distinct enough that TypeScript doesn't
 * collapse the union down to plain `string` and drop the literal suggestions.
 */
export type KnownCoreConnectors =
  | 'cache:redis'
  | 'cache:memcached'
  | 'cache:custom'
  | 'cache:local'
  | 'kvLocal'
  | 'asyncmq'
  | 'database'
  | 'search'

/**
 * Any core-provider slot key registered via `registerCoreProviderSlot`
 * (`modules/infra/providers/core/all.ts`) — same reasoning as {@link CoreConnectors}.
 */
// deno-lint-ignore ban-types -- same deliberate widening trick as `CoreConnectors` above.
export type CoreProviders = KnownCoreProviders | (string & {})

/** The provider slot keys `@zanix/server` itself pre-seeds — see {@link KnownCoreConnectors}. */
export type KnownCoreProviders = 'cache' | 'asyncmq' | 'worker' | 'auth' | 'notifications'
/** Any valid connector type: a core connector, or a `GenericTargets` (`'custom'`) one. */
export type ConnectorTypes = CoreConnectors | GenericTargets
/** Any valid provider type: a core provider, or a `GenericTargets` (`'custom'`) one. */
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

/** The two metadata namespaces tracked internally by `BaseContainer` implementations. */
export type MetadataTypes = 'data' | 'target'

export type MetadataTypesKey = `${MetadataTypes}:${string}`

/** Any value storable as raw metadata: an object, string, number, or boolean. */
export type MetadataObjects = object | string | number | boolean

/** Identifies a class target (and, optionally, one of its properties) within the metadata registry. */
export type MetadataTargetSymbols = {
  /** The class constructor the metadata is registered against. */
  Target?: ClassConstructor
  /** The property or class symbol the metadata refers to. */
  propertyKey?: string
  /** Whether the metadata is scoped to a handler or to the class in general. */
  type?: 'handler' | 'general'
}

/** Registration data used to define and instantiate a target class. */
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

/** Wraps a global middleware definition's scoping data under an optional `exports` field. */
export type ZanixGlobalExports<T> = {
  /** The scoping data exported by the global middleware definition. */
  exports?: T
}
