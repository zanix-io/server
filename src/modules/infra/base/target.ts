import type { Lifetime, MetadataObjects, ModuleTypes, StartMode } from 'typings/program.ts'

/**
 * Abstract base class for all core Zanix components, such as **handlers**, **providers**, **connectors**, and other targets.
 *
 * This class provides fundamental internal operations for all components in the Zanix framework. It manages key aspects like
 * lifecycle management, startup modes, injected properties, and module metadata. All Zanix modules extend this class to ensure
 * consistency across the system in terms of initialization, state management, and configuration.
 *
 * **Key Responsibilities**:
 * - **Data Injection**: Stores injected data properties used for internal Zanix operations (e.g., metadata, configuration).
 * - **Lifecycle Management**: Defines the module's lifecycle state (e.g., `TRANSIENT`, `SINGLETON`).
 * - **Startup Mode**: Configures the module's startup mode (e.g., `lazy`, `onBoot`, `onSetup`).
 * - **Module Metadata**: Stores internal metadata related to the module's type and key for tracking and processing.
 *
 * This class is not intended to be instantiated directly. It is meant to be extended by all core components of Zanix,
 * which can then make use of these shared properties and functionalities.
 *
 * @abstract
 */
export abstract class TargetBaseClass {
  constructor() {
    Object.assign(this, this.constructor.prototype)
  }
  /** Stores injected data props for internal Zanix operations */
  private _znx_props_: {
    /** general data */
    data: Record<string, MetadataObjects | undefined>
    /** Defines the startup mode for the internal Zanix module */
    startMode: StartMode
    /** Specifies the lifecycle management mode for the Zanix module */
    lifetime: Lifetime
    /** Represents the target module type for internal Zanix processing */
    type: ModuleTypes
    /** Represents the target module key for internal Zanix processing */
    key: string
  } = {
    data: {},
    startMode: 'lazy',
    lifetime: 'TRANSIENT',
    type: '' as never,
    key: '',
  }
}
