import type {
  MetadataObjects,
  MetadataTypes,
  MetadataTypesKey,
  ModuleTypes,
  StartMode,
} from 'typings/program.ts'
import type { ClassConstructor } from 'typings/targets.ts'

/**
 * Base Metadata Container
 */
export abstract class BaseContainer {
  #metadata = 'metadata'

  private registerMetadataContainer(container: object) {
    // register targets
    const targets = new Set(Reflect.get(this.constructor, this.#metadata) || [])
    if (!targets.has(container)) targets.add(container)
    Reflect.set(this.constructor, this.#metadata, Array.from(targets))
  }

  private key(key: string, type: MetadataTypes): MetadataTypesKey {
    return `${type}:${this.constructor.name}:${key}`
  }

  /**
   * Set data
   * @param key
   * @param data
   * @param container
   */
  protected setData<T extends MetadataObjects>(key: string, data?: T, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.set(container, this.key(key, 'data'), data || key)
  }

  /**
   * Get data
   * @param key
   * @param container
   */
  protected getData<T extends MetadataObjects | undefined>(
    key: string,
    container: object = this,
  ): T {
    this.registerMetadataContainer(container)
    return Reflect.get(container, this.key(key, 'data')) as T
  }

  /**
   * Set a target object
   * @param key
   * @param data
   * @param container
   */
  protected setTarget<T extends ClassConstructor>(key: string, data?: T, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.set(container, this.key(key, 'target'), data || key)
  }

  /**
   * Set a target by startMode
   * @param key
   * @param startMode
   * @param container
   */
  protected setTargetByStartMode(
    key: string,
    startMode: StartMode,
    container: object = this,
  ) {
    this.registerMetadataContainer(container)
    const targets = this.getTargetsByStartMode(startMode)

    if (!targets.includes(key)) targets.push(key)
    Reflect.set(container, this.key(startMode, 'data'), targets)
  }

  /**
   * Set a target by type
   * @param key
   * @param startMode
   * @param container
   */
  protected setTargetByType(
    key: string,
    type: ModuleTypes,
    container: object = this,
  ) {
    this.registerMetadataContainer(container)
    const targets = this.getTargetsByType(type)

    if (!targets.includes(key)) targets.push(key)
    Reflect.set(container, this.key(type, 'data'), targets)
  }

  /**
   * Function to get a target
   * @param key
   * @param container
   * @returns
   */
  protected getTarget<T extends ClassConstructor>(key: string, container: object = this): T {
    this.registerMetadataContainer(container)
    return Reflect.get(container, this.key(key, 'target')) as T
  }

  /**
   * get all targets by start mode
   * @param startMode
   * @param container
   * @returns
   */
  public getTargetsByStartMode(startMode: StartMode, container: object = this): string[] {
    this.registerMetadataContainer(container)
    return Reflect.get(container, this.key(startMode, 'data')) || []
  }

  /**
   * get all targets by type
   * @param type
   * @param container
   * @returns
   */
  public getTargetsByType(type: ModuleTypes, container: object = this): string[] {
    this.registerMetadataContainer(container)
    return Reflect.get(container, this.key(type, 'data')) || []
  }

  /**
   * Check for a target
   * @param key
   * @param type
   * @returns
   */
  protected has(key: string, type: MetadataTypes, container: object = this): boolean {
    this.registerMetadataContainer(container)
    return !!Reflect.has(container, this.key(key, type))
  }

  /**
   * Delete data key
   * @param key
   * @param container
   */
  protected deleteData(key: string, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.deleteProperty(container, this.key(key, 'data'))
  }

  /**
   * Delete target key
   * @param key
   * @param container
   */
  protected deleteTarget(key: string, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.deleteProperty(container, this.key(key, 'target'))
  }

  /**
   * get container Metadata Keys
   * @returns
   */
  protected getContainerKeys(container: object = this): (string | symbol)[] {
    return Reflect.ownKeys(container)
  }

  /**
   * Reset all container data. Defaults to current container
   * @param keys Specific keys to delete. By default all keys are deleted. Can be string regex,
   * @param props Sepecify data type to delete
   */
  public resetContainer(
    keys: string | string[] = [''],
    props: MetadataTypes[] = ['data', 'target'],
  ) {
    const metadata: object[] = Reflect.get(this.constructor, this.#metadata) || []

    if (typeof keys === 'string') keys = [keys]

    const containerKey = props.map((prop) => {
      return keys.map((k) => this.key(k, prop)).join('|')
    }).join('|')

    const regexKey = new RegExp(`^(${containerKey})`)

    metadata.forEach((data) => {
      const filteredKeys = this.getContainerKeys(data).filter((key) =>
        regexKey.test(key.toString())
      )
      filteredKeys.forEach((k) => Reflect.deleteProperty(data, k))
    })
  }
}
