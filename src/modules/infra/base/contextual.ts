import type { ScopedContext } from 'typings/context.ts'

import { HttpError } from '@zanix/errors'
import ProgramModule from 'modules/program/mod.ts'
import { TargetBaseClass } from './target.ts'

export abstract class ContextualBaseClass extends TargetBaseClass {
  #contextId
  constructor(contextId: string) {
    super()
    this.#contextId = contextId
  }

  protected get config(): Omit<typeof Deno.env, 'toObject' | 'has'> {
    const { get, set, delete: del } = Deno.env
    // TODO: implement types on keys params. e.g get(currentKeys:types)
    return { get, set, delete: del }
  }

  protected get context(): ScopedContext {
    if (this['_znxProps'].lifetime === 'SINGLETON') {
      throw new HttpError('BAD_REQUEST', {
        message:
          `Access to the 'context' property is not allowed in singleton mode. Target: ${this.constructor.name}`,
      })
    }

    return ProgramModule.context.getContext<ScopedContext>(this.#contextId)
  }
}
