import type { ScopedContext } from 'typings/context.ts'

import { HttpError } from '@zanix/errors'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import Program from 'modules/program/main.ts'

export abstract class ContextualBaseClass extends TargetBaseClass {
  constructor(private contextId: string) {
    super()
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

    return Program.context.getContext<ScopedContext>(this.contextId)
  }
}
