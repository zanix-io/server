import type { BaseContext } from 'typings/context.ts'

import { AsyncLocalStorage, type AsyncLocalStorageOptions } from 'async_hooks'

/**
 * A class that extends `AsyncLocalStorage` to manage the context of a request asynchronously.
 * This class provides a method to retrieve the context ID and an `runWith` method
 * to execute a callback within a specific context.
 *
 * @template BaseContext The base type for the context.
 */
// deno-lint-ignore no-explicit-any
export class AsyncContext extends AsyncLocalStorage<BaseContext & Record<string, any>> {
  constructor(options?: AsyncLocalStorageOptions) {
    super({ name: 'zanix-async-context', ...options })
  }

  /**
   * Retrieves the ID of the current context stored in the async storage.
   *
   * @returns {string | undefined} The ID of the current context, or `undefined` if no context exists.
   */
  public getId(): string | undefined {
    return this.getStore()?.id
  }

  /**
   * Executes a callback within a specific context, passing the context along with the callback.
   * This method wraps around the `runWith` method, providing an additional abstraction
   * for running the callback with the given context.
   *
   * @param {BaseContext} contextId The context to set in the async storage.
   * @param {R} callback The callback function to execute with the provided context.
   *
   * @returns {R} The result of executing the callback.
   *
   * @template R The type of the result returned by the callback function.
   */
  public runWith<R>(contextId: BaseContext['id'], callback: () => R): R {
    return this.run<R>({ id: contextId }, callback)
  }
}
