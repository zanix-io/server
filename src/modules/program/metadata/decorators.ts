import { BaseContainer } from './abstracts/main.ts'

/**
 * A container for holding and managing Decorators.
 */
export class DecoratorsContainer extends BaseContainer {
  #key = (type: DecoratorTypes = 'generic') => `decorators:${type}`

  /**
   * Add decorator data
   */
  public addDecoratorData<T extends DecoratorTypes>(
    data: DecoratorsData<T>,
    type?: T,
  ) {
    const key = this.#key(type)
    const decorators = this.getData<(typeof data)[]>(key, this) || []
    decorators.push(data)
    this.setData(key, decorators, this)
  }

  /**
   * get decorator data
   */
  public getDecoratorsData<T extends DecoratorTypes>(type: T): DecoratorsData<T>[] {
    type R = DecoratorsData<T>
    const key = this.#key(type)
    return this.getData<R[]>(key, this) || []
  }

  /**
   * delete decorator data
   */
  public deleteDecorators(type: DecoratorTypes): void {
    return this.deleteData(this.#key(type), this)
  }
}
