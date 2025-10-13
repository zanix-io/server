import type { LIFETIME_MODE } from 'utils/constants.ts'

declare global {
  type HandlerTypes =
    | 'controller'
    | 'socket'
    | 'resolver'

  type GeneralTargetTypes =
    | 'connector'
    | 'interactor'
    | 'subscriber'
    | 'job'

  type ModuleTypes =
    | HandlerTypes
    | GeneralTargetTypes

  type CoreConnectors = 'cache' | 'worker' | 'asyncmq' | 'database'
  type GenericConnectors = 'custom'

  type ConnectorTypes = CoreConnectors | GenericConnectors

  type Lifetime = (typeof LIFETIME_MODE)[keyof typeof LIFETIME_MODE]

  /**
   * Defines the initialization mode for a service.
   *
   * - `onSetup`: Initialized before the server starts. If the initialization fails, the server will not start.
   * - `onBoot`: Initialized right after `onSetup`. The server waits for the initialization to complete before proceeding.
   * - `postBoot`: Initialized after the server has started. This initialization happens in the background and does not block the startup.
   * - `lazy`: Initialized only when needed. Does not affect the server startup time and does not block the flow.
   */
  type StartMode = 'onSetup' | 'onBoot' | 'postBoot' | 'lazy'

  type MetadataTypes = 'data' | 'target'

  type MetadataTypesKey = `${MetadataTypes}:${string}`

  type MetadataObjects = object | string | number | boolean

  type MetadataProps = { Target?: ClassConstructor; propertyKey?: string }

  type MetadataInstances<
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

  interface MetadataTargetsProps<T extends ClassConstructor = ClassConstructor>
    extends MetadataInstances<T> {
    type: GeneralTargetTypes
  }

  interface MetadataHandlerProps<T extends ClassConstructor = ClassConstructor>
    extends MetadataInstances<T> {
    interactor?: string
    type: HandlerTypes
  }

  type ZanixGlobalExports<T> = { exports: T }
}
