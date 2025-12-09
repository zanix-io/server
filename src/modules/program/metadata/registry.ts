import type { MetadataObjects } from 'typings/program.ts'

import { BaseContainer } from './base.ts'

/**
 * A container for holding and managing custom Registry.
 */
export class RegistryContainer extends BaseContainer {
  #key = (id: string) => `registry:${id}`

  /**
   * Set registry
   */
  public set<D extends MetadataObjects>(id: string, registry: D) {
    const key = this.#key(id)
    this.setData(key, registry, this)
  }

  /**
   * get registry
   */
  public get<D extends MetadataObjects>(id: string): D | undefined {
    const key = this.#key(id)
    return this.getData<D>(key, this)
  }

  /**
   * delete registry
   */
  public delete(id: string): void {
    return this.deleteData(this.#key(id), this)
  }
}
