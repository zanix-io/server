import type { BaseContext } from 'typings/context.ts'

import { BaseContainer } from './abstracts/main.ts'

/**
 * A container for holding and managing Contexts.
 */
export class ContextContainer extends BaseContainer {
  #key = (id: string) => `context:${id}`

  /**
   * Add context data
   */
  public addContext<T extends BaseContext>(
    data: T,
  ) {
    const key = this.#key(data.id)
    this.setData(key, { ...data }, this)
  }

  /**
   * get context data
   */
  public getContext<Context extends BaseContext>(id: string): Context {
    const key = this.#key(id)
    return this.getData<Context>(key, this) || {}
  }

  /**
   * delete context data
   */
  public deleteContext(id: string): void {
    return this.deleteData(this.#key(id), this)
  }
}
