import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { Lifetime } from 'typings/program.ts'

import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'

/** Define decorator to register an interactor */
export function defineInteractorDecorator<L extends Lifetime>(
  options?: InteractorDecoratorOptions<L>,
): ZanixClassDecorator {
  const lifetime = options?.lifetime

  return function (Target) {
    if (!(Target.prototype instanceof ZanixInteractor)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Interactor. Please extend ${ZanixInteractor.name}`,
        { meta: { target: Target.name, baseTarget: ZanixInteractor.name } },
      )
    }

    const key = getTargetKey(Target)

    ProgramModule.targets.defineTarget(key, {
      Target,
      lifetime: lifetime || 'SCOPED',
      startMode: options?.startMode,
      type: 'interactor',
    })
  }
}
