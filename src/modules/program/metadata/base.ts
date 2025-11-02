import type { MetadataObjects, MetadataTypes, MetadataTypesKey } from 'typings/program.ts'
import type { ClassConstructor } from 'typings/targets.ts'

/**
 * Abstract base class for managing metadata containers.
 *
 * Provides utility methods for storing, retrieving, and managing metadata and target references
 * using `Reflect` and custom keys. Supports grouping by data type, start mode, or module type.
 */
export abstract class BaseContainer {
  #metadata = 'metadata'

  /**
   * Registers a container object to track metadata keys.
   * @param container The target object to register.
   * @private
   */
  private registerMetadataContainer(container: object) {
    const metadata = new Set(Reflect.get(this.constructor, this.#metadata) || [])
    if (!metadata.has(container)) metadata.add(container)
    Reflect.set(this.constructor, this.#metadata, Array.from(metadata))
  }

  /**
   * Constructs a unique metadata key based on type, class name, and property key.
   * @param key The property key.
   * @param type The metadata type (e.g., 'data', 'target').
   * @returns A string key to use for metadata storage.
   * @private
   */
  private key(key: string, type: MetadataTypes): MetadataTypesKey {
    return `${type}:${this.constructor.name}:${key}`
  }

  /**
   * Stores metadata data under the specified key.
   * @param key The key to associate the data with.
   * @param data Optional data to store.
   * @param container Optional container object (defaults to `this`).
   * @protected
   */
  protected setData<T extends MetadataObjects>(key: string, data?: T, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.set(container, this.key(key, 'data'), data || key)
  }

  /**
   * Retrieves metadata data by key.
   * @param key The key to retrieve.
   * @param container Optional container object (defaults to `this`).
   * @returns The stored data or undefined.
   * @protected
   */
  protected getData<T extends MetadataObjects | undefined>(
    key: string,
    container: object = this,
  ): T {
    this.registerMetadataContainer(container)
    return Reflect.get(container, this.key(key, 'data')) as T
  }

  /**
   * Stores a target (e.g., class constructor) under the specified key.
   * @param key The key to associate the target with.
   * @param data Optional target data.
   * @param container Optional container object (defaults to `this`).
   * @protected
   */
  protected setTarget<T extends ClassConstructor>(key: string, data?: T, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.set(container, this.key(key, 'target'), data || key)
  }

  /**
   * Retrieves a registered target by key.
   * @param key The key to retrieve.
   * @param container Optional container object (defaults to `this`).
   * @returns The stored class constructor.
   * @protected
   */
  protected getTarget<T extends ClassConstructor>(key: string, container: object = this): T {
    this.registerMetadataContainer(container)
    return Reflect.get(container, this.key(key, 'target')) as T
  }

  /**
   * Checks whether a key of a specific type exists in the metadata.
   * @param key The key to check.
   * @param type The metadata type.
   * @param container Optional container object (defaults to `this`).
   * @returns True if key exists; otherwise false.
   * @protected
   */
  protected has(key: string, type: MetadataTypes, container: object = this): boolean {
    this.registerMetadataContainer(container)
    return !!Reflect.has(container, this.key(key, type))
  }

  /**
   * Deletes stored metadata data by key.
   * @param key The key to delete.
   * @param container Optional container object (defaults to `this`).
   * @protected
   */
  protected deleteData(key: string, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.deleteProperty(container, this.key(key, 'data'))
  }

  /**
   * Deletes stored target reference by key.
   * @param key The key to delete.
   * @param container Optional container object (defaults to `this`).
   * @protected
   */
  protected deleteTarget(key: string, container: object = this) {
    this.registerMetadataContainer(container)
    Reflect.deleteProperty(container, this.key(key, 'target'))
  }

  /**
   * Retrieves all own metadata keys from a container.
   * @param container Optional container object (defaults to `this`).
   * @returns An array of metadata keys.
   * @protected
   */
  protected getContainerKeys(container: object = this): (string | symbol)[] {
    return Reflect.ownKeys(container)
  }

  /**
   * Resets (deletes) metadata from registered containers.
   *
   * Can filter by specific keys and metadata types.
   *
   * @param keys Specific keys to delete (string or array). Defaults to [''] (all).
   * @param props Metadata types to delete (e.g., 'data', 'target'). Defaults to all.
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
