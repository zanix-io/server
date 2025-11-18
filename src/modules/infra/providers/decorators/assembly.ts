import type { ProviderDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { CoreProviders, Lifetime, ProviderTypes, StartMode } from 'typings/program.ts'

import ProvidersCoreModules from 'providers/core/all.ts'
import { ZanixProvider } from 'providers/base.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { InternalError } from '@zanix/errors'

import 'providers/core/mod.ts' // initialize module

/** Define decorator to register a provider */
export function defineProviderDecorator<L extends Exclude<Lifetime, 'TRANSIENT'>>(
  options?: ProviderTypes | ProviderDecoratorOptions<L>,
): ZanixClassDecorator {
  let key: string
  let type: ProviderTypes = 'custom'
  let startMode: StartMode = 'lazy'
  let lifetime: Lifetime = 'SINGLETON'

  if (typeof options === 'string') {
    type = options
  } else if (options) {
    type = options.type || type
    startMode = options.startMode || startMode
    lifetime = options.lifetime || lifetime
  }

  const coreProviders = Object.keys(ProvidersCoreModules)

  return function (Target) {
    if (!(Target.prototype instanceof ZanixProvider)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Provider. Please extend '${ZanixProvider.name}'`,
      )
    }

    if (coreProviders.includes(type)) {
      key = type
      const BaseTarget = ProvidersCoreModules[type as CoreProviders].Target
      if (!(Target.prototype instanceof BaseTarget)) {
        throw new InternalError(
          `The class '${Target.name}' is not a valid '${type}' Provider. Please extend '${BaseTarget.name}'`,
        )
      }
    } else {
      key = getTargetKey(Target)
    }

    ProgramModule.targets.defineTarget(key, {
      Target,
      lifetime,
      startMode,
      type: 'provider',
    })
  }
}
