import type { Lifetime, MetadataObjects, ModuleTypes, StartMode } from 'typings/program.ts'

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
