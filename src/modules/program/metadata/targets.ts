import { BaseInstancesContainer } from './abstracts/instances.ts'

/**
 * A container for holding and managing generic classes or targets
 */
export class TargetContainer extends BaseInstancesContainer {
  #propertiesKey = 'properties'

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
   * Function to add a property to a specified target container
   */
  public addProperty({ Target, propertyKey }: MetadataProps) {
    const properties = this.getProperties({ Target })
    const propertiesSet = new Set<string>(properties)

    if (propertyKey && !propertiesSet.has(propertyKey)) propertiesSet.add(propertyKey)

    this.setData<string[]>(this.#propertiesKey, Array.from(propertiesSet), Target)
  }

  /**
   * Retrieves all properties with a specific target container
   */
  public getProperties({ Target }: MetadataProps): string[] {
    return this.getData<string[] | undefined>(this.#propertiesKey, Target) || []
  }
}
