import type { ClassConstructor } from './targets.ts'

/**
 * Represents the types of request or event handlers in the system.
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
 *
 * - `'connector'`: Used for external service or database integrations.
 * - `'interactor'`: Contains business logic, often called use-cases.
 * - `'subscriber'`: Reacts to events/messages in an event-driven system.
 * - `'job'`: Performs background tasks or cron jobs.
 */
export type GeneralTargetTypes =
  | 'connector'
  | 'interactor'
  | 'subscriber'
  | 'job'

/**
 * Union type of all module types in the system, including both handler-specific
 * and general backend roles.
 *
 * Can be any of:
 * - `HandlerTypes`: `'controller'`, `'socket'`, `'resolver'`
 * - `GeneralTargetTypes`: `'connector'`, `'interactor'`, `'subscriber'`, `'job'`
 */
export type ModuleTypes =
  | HandlerTypes
  | GeneralTargetTypes

export type CoreConnectors = 'cache' | 'worker' | 'asyncmq' | 'database'
export type GenericConnectors = 'custom'

export type ConnectorTypes = CoreConnectors | GenericConnectors

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

export type MetadataProps = { Target?: ClassConstructor; propertyKey?: string }

export type MetadataInstances<
  T extends ClassConstructor = ClassConstructor,
> = {
  /** The class that will be instantiated */
  Target: T
  /** Defines the lifetime strategy for the instance (e.g., SINGLETON, TRANSIENT, SCOPED) */
  lifetime?: Lifetime
  /** Specifies how the instance should be initialized at startup */
  startMode?: StartMode
  /** The classification or category of the target class within the module */
  type: ModuleTypes
  /** The data to be injected to the target prototype */
  dataProps?: Record<string, MetadataObjects | undefined>
}

export interface MetadataTargetsProps<T extends ClassConstructor = ClassConstructor>
  extends MetadataInstances<T> {
  type: GeneralTargetTypes
}

export interface MetadataHandlerProps<T extends ClassConstructor = ClassConstructor>
  extends MetadataInstances<T> {
  interactor?: string
  type: HandlerTypes
}

export type ZanixGlobalExports<T> = { exports: T }
