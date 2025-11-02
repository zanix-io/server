import type { ScopedContext } from 'typings/context.ts'

import ProgramModule from 'modules/program/mod.ts'
import { DEFAULT_CONTEXT_ID, ZANIX_PROPS } from 'utils/constants.ts'
import { TargetBaseClass } from './target.ts'
import { TargetError } from 'utils/errors.ts'
import { asyncContext } from './storage.ts'

export abstract class ContextualBaseClass extends TargetBaseClass {
  #contextId
  constructor(contextId?: string) {
    super()
    this.#contextId = contextId
  }

  protected get config(): Omit<typeof Deno.env, 'toObject' | 'has'> {
    const { get, set, delete: del } = Deno.env
    // TODO: implement types on keys params. e.g get(currentKeys:types)
    return { get, set, delete: del }
  }

  protected get context(): ScopedContext {
    const { lifetime, startMode } = this[ZANIX_PROPS]

    this.#contextId = asyncContext.getId() || this.#contextId

    if (!this.#contextId) {
      throw new TargetError(
        `The system could not find the required information to proceed`,
        startMode,
        {
          code: 'CONTEXT_NOT_DEFINED',
          cause:
            'The context is missing. It must be provided for each class instance, either in the constructor, via the super() call, or by enabling the ALS flag in the handler decorator.',
          meta: { targetName: this.constructor.name },
        },
      )
    }

    if (this.#contextId === DEFAULT_CONTEXT_ID) {
      throw new TargetError(
        `The system could not find the required information to proceed`,
        startMode,
        {
          code: 'INVALID_CONTEXT',
          cause:
            "No valid context found for this instance. This may be due to an issue with the current setup targets. Additionally, please note that if ALS access is not enabled, the 'context' property cannot be accessed in 'SINGLETON' lifetime mode.",
          meta: {
            targetName: this.constructor.name,
            lifetime,
            startMode,
          },
        },
      )
    }

    return ProgramModule.context.getContext<ScopedContext>(this.#contextId)
  }
}
