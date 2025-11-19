import type { ScopedContext } from 'typings/context.ts'

import { DEFAULT_CONTEXT_ID, ZANIX_PROPS } from 'utils/constants.ts'
import ProgramModule from 'modules/program/mod.ts'
import { TargetBaseClass } from './target.ts'
import { TargetError } from 'utils/errors.ts'
import { asyncContext } from './storage.ts'

/**
 * Abstract base class that extends `TargetBaseClass` and provides contextual information for
 * various Zanix components such as **interactors**, **providers**, and **connectors**.
 *
 * This class manages **contextual data** and environment-specific configurations,
 * enabling components to operate within a specific **execution context**. It includes methods
 * to retrieve environment variables, manage the scoped context, and resolve the `contextId` dynamically
 * using **Async Local Storage (ALS)**, if available, or fallback to the provided `contextId` in the constructor.
 *
 * **Key Responsibilities**:
 * - **Contextual Information**: Provides the current execution context via the `contextId` property.
 * - **Environment Configuration**: Exposes environment configuration for the component through `Deno.env`.
 * - **Scoped Context**: Offers access to a scoped context for components, enabling state isolation between different parts of the application.
 * - **Dynamic Context ID Resolution**: The `contextId` is resolved dynamically using **Async Local Storage (ALS)** if available.
 *   If ALS is not used, it will fall back to the `contextId` provided in the constructor.
 *
 * This class is intended to be extended by components that need to operate within a specific context,
 * like **interactors**, **providers**, and **connectors** in the Zanix framework, ensuring modular and
 * isolated execution within a scoped environment.
 *
 * @abstract
 * @extends TargetBaseClass
 */
export abstract class ContextualBaseClass extends TargetBaseClass {
  protected accessor contextId: string | undefined

  /**
   * Creates an instance of the `ContextualBaseClass` with an optional `contextId`.
   *
   * The constructor allows the class to be initialized with a manual `contextId`. If the `contextId`
   * is not provided, the class will attempt to resolve it dynamically using **Async Local Storage (ALS)**
   * (via `asyncContext.getId()`) if available.
   *
   * **Behavior**:
   * - If **ALS** is available and contains a `contextId`, it will be used.
   * - If **ALS** is not available or the `contextId` is not found, the `contextId` passed to the constructor will be used.
   *
   * @param {string} [contextId] - Optional identifier for the current context. If not provided, the default context is used or resolved via ALS.
   */
  constructor(contextId?: string) {
    super()
    this.contextId = contextId
  }
  /**
   * Provides access to the environment configuration for the current execution context.
   *
   * This getter exposes a subset of `Deno.env` methods, including `get`, `set`, and `delete`, allowing for
   * environment variable management. This is useful for accessing environment-specific settings or configuration
   * during the lifecycle of the component.
   */
  protected get config(): Omit<typeof Deno.env, 'toObject' | 'has'> {
    const { get, set, delete: del } = Deno.env
    // TODO: implement types on keys params. e.g get(currentKeys:types)
    return { get, set, delete: del }
  }

  /**
   * Provides access to the scoped context for the current component.
   *
   * The scoped context exists only for the lifetime of a single request,
   * and a new isolated `ScopedContext` is created for every incoming request.
   *
   * The `contextId` is determined as follows:
   * - If **Async Local Storage (ALS)** is available, the `contextId` will be resolved using `asyncContext.getId()`.
   * - If ALS is not available, the `contextId` provided in the constructor (or `undefined` if no `contextId` was provided) is used.
   *
   * The `context` object returned contains request information, allowing for modular state management
   * and context isolation across the application.
   *
   * @protected
   * @returns {ScopedContext} An object representing the current scoped context, which includes the `id`, `payload`, `session`, etc.
   */
  protected get context(): ScopedContext {
    const { lifetime, startMode } = this[ZANIX_PROPS]

    this.contextId = asyncContext.getId() || this.contextId

    if (!this.contextId) {
      throw new TargetError(
        `The system could not find the required information to proceed`,
        startMode,
        {
          shouldLog: true,
          code: 'CONTEXT_NOT_DEFINED',
          cause:
            'The context is missing. It must be provided for each class instance, either in the constructor, via the super() call, or by enabling the ALS flag in the handler decorator.',
          meta: { targetName: this.constructor.name, source: 'zanix' },
        },
      )
    }

    if (this.contextId === DEFAULT_CONTEXT_ID) {
      throw new TargetError(
        `The system could not find the required information to proceed`,
        startMode,
        {
          shouldLog: true,
          code: 'INVALID_CONTEXT',
          cause:
            "No valid context found for this instance. This may be due to an issue with the current setup targets. Additionally, please note that if ALS access is not enabled, the 'context' property cannot be accessed in 'SINGLETON' lifetime mode.",
          meta: {
            targetName: this.constructor.name,
            source: 'zanix',
            lifetime,
            startMode,
          },
        },
      )
    }

    return ProgramModule.context.getContext<ScopedContext>(this.contextId)
  }
}
