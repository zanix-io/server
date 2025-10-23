import type { MetadataTargetsProps, MetadataTargetSymbols } from 'typings/program.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import { BaseInstancesContainer } from './abstracts/instances.ts'
import { HANDLER_METADATA_PROPERTY_KEY } from 'utils/constants.ts'

/**
 * A container for holding and managing generic classes or targets
 */
export class TargetContainer extends BaseInstancesContainer {
  #properties = {
    handler: HANDLER_METADATA_PROPERTY_KEY,
    general: 'properties',
  }

  /**
   * Set general target class
   */
  public defineTarget<T extends ClassConstructor>(
    key: string,
    opts: MetadataTargetsProps<T>,
  ) {
    this.toBeInstanced(key, opts)
  }

  /**
   * Function to add a `property` or `symbol` to a specified target class
   */
  public addProperty({ Target, propertyKey, type = 'handler' }: MetadataTargetSymbols) {
    const properties = this.getProperties({ Target })
    const propertiesSet = new Set<string>(properties)

    if (propertyKey && !propertiesSet.has(propertyKey)) propertiesSet.add(propertyKey)

    this.setData<string[]>(this.#properties[type], Array.from(propertiesSet), Target)
  }

  /**
   * Retrieves all `properties` or `symbol` with a specific target class
   */
  public getProperties({ Target, type = 'handler' }: MetadataTargetSymbols): string[] {
    return this.getData<string[] | undefined>(this.#properties[type], Target) || []
  }
}
