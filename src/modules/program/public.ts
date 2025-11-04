import { AsyncContext } from 'modules/infra/base/storage.ts'

/**
 * Represents the main program interface that can be exported and used by other libraries.
 *
 * This class is intended to provide reusable functionality and act as a shared program module.
 *
 * @exports Program
 */

class Program {
  /**
   * AsyncLocalStorage instance that manages a context shared across
   * asynchronous operations within the same request or logical scope.
   *
   * This allows you to store and retrieve contextual information
   * (such as request IDs, tenant info, or user session data)
   * without explicitly passing it through function parameters.
   *
   * @example
   * // Initialize context at the start of a request
   * asyncContext.run({ id: 'abc123' }, async () => {
   *   // Later, anywhere in async code:
   *   console.log(asyncContext.getStore()?.id); // 'abc123'
   * });
   *
   * @type {AsyncContext}
   */
  public asyncContext: AsyncContext = new AsyncContext()
}

/**
 * A frozen singleton instance of the `Program`,
 * to provide reusable functionality and act as a shared program module.
 *
 * @type {Readonly<Program>}
 */
const PublicProgramModule: Readonly<Program> = Object.freeze(new Program())
export default PublicProgramModule

export const asyncContext = PublicProgramModule.asyncContext
