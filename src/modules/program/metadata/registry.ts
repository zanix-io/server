import type { MetadataObjects } from 'typings/program.ts'

import { BaseContainer } from './base.ts'

/**
 * A container for storing arbitrary registries.
 *
 * A registry is identified by an `id` and can hold any metadata object.
 * In addition to replacing the whole registry with {@link set}, this
 * container provides helpers for treating a registry as an array or
 * object map without each feature reimplementing the same logic.
 */
export class RegistryContainer extends BaseContainer {
  #key = (id: string) => `registry:${id}`

  /**
   * Replaces the registry stored under the given identifier.
   *
   * @param id The registry identifier.
   * @param registry The registry value to store.
   */
  public set<D extends MetadataObjects>(id: string, registry: D): void {
    this.setData(this.#key(id), registry, this)
  }

  /**
   * Returns the registry stored under the given identifier.
   *
   * @param id The registry identifier.
   * @returns The stored registry, or `undefined` if it does not exist.
   */
  public get<D extends MetadataObjects>(id: string): D | undefined {
    return this.getData<D>(this.#key(id), this)
  }

  /**
   * Removes a registry.
   *
   * @param id The registry identifier.
   */
  public delete(id: string): void {
    this.deleteData(this.#key(id), this)
  }

  /**
   * Appends a value to an array registry.
   *
   * If the registry does not exist yet, it is created automatically.
   *
   * @param id The registry identifier.
   * @param value The value to append.
   */
  public push<T>(id: string, value: T): void {
    const values = this.get<T[]>(id) ?? []
    values.push(value)
    this.set(id, values)
  }

  /**
   * Returns an array registry.
   *
   * If the registry does not exist, an empty array is returned.
   *
   * @param id The registry identifier.
   * @returns The stored array or an empty array.
   */
  public array<T>(id: string): T[] {
    return this.get<T[]>(id) ?? []
  }

  /**
   * Adds or replaces an entry in an object registry.
   *
   * If the registry does not exist yet, it is created automatically.
   *
   * @param id The registry identifier.
   * @param key The entry key.
   * @param value The entry value.
   */
  public setEntry<T>(id: string, key: string, value: T): void {
    const registry = this.get<Record<string, T>>(id) ?? {}
    registry[key] = value
    this.set(id, registry)
  }

  /**
   * Returns an entry from an object registry.
   *
   * @param id The registry identifier.
   * @param key The entry key.
   * @returns The stored value, or `undefined` if it does not exist.
   */
  public getEntry<T>(id: string, key: string): T | undefined {
    return this.get<Record<string, T>>(id)?.[key]
  }

  /**
   * Removes an entry from an object registry.
   *
   * If the registry does not exist, this method does nothing.
   *
   * @param id The registry identifier.
   * @param key The entry key.
   */
  public deleteEntry(id: string, key: string): void {
    const registry = this.get<Record<string, unknown>>(id)
    if (!registry) return

    delete registry[key]
    this.set(id, registry)
  }
}
