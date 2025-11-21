import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ZanixConnector } from 'connectors/base.ts'
import type { ZanixProvider } from 'providers/base.ts'
import type { Lifetime } from 'typings/program.ts'

import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import ConnectorCoreModules from 'connectors/core/mod.ts'
import ProviderCoreModules from 'providers/core/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'
import { ZANIX_PROPS } from 'utils/constants.ts'

const coreItems = {
  connector: Object.values(ConnectorCoreModules),
  provider: Object.values(ProviderCoreModules),
}

/** Validate core dependency */
function validateCoreDependency(
  Dependency: typeof ZanixConnector | typeof ZanixProvider | undefined,
  type: 'connector' | 'provider',
  id: string | undefined,
  target: string,
) {
  if (!Dependency) return

  const dependencyType = ProgramModule.targets['getTarget'](`${type}:${id}`)
    ?.prototype[ZANIX_PROPS].type // Asume that exists if is not core

  const coreMatch = coreItems[type].find(({ Target }) => Dependency.prototype instanceof Target)
  if (!dependencyType && coreMatch) {
    const [property] = coreMatch.key.split(':')
    throw new InternalError(
      `Invalid dependency injection: '${Dependency.name}' is a core ${type} that can be overridden but should not be manually injected into '${target}'. ` +
        `Access it through 'this.${property}' inside your class, and remove it from the Interactor decorator configuration.`,
      { meta: { dependency: Dependency.name, targetType: type, target, property } },
    )
  }
}

/** Define decorator to register an interactor */
export function defineInteractorDecorator<
  C extends typeof ZanixConnector,
  P extends typeof ZanixProvider,
  L extends Lifetime,
>(
  options?: InteractorDecoratorOptions<C, P, L>,
): ZanixClassDecorator {
  let connector: string | undefined
  let provider: string | undefined
  let lifetime: Lifetime | undefined
  if (options) {
    lifetime = options.lifetime
    connector = getTargetKey(options.Connector)
    provider = getTargetKey(options.Provider)
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixInteractor)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Interactor. Please extend ${ZanixInteractor.name}`,
        { meta: { target: Target.name, baseTarget: ZanixInteractor.name } },
      )
    }

    const name = Target.name
    // Core connector validation use
    validateCoreDependency(options?.Connector, 'connector', connector, name)
    // Core provider validation use
    validateCoreDependency(options?.Provider, 'provider', provider, name)

    const key = getTargetKey(Target)

    ProgramModule.targets.defineTarget(key, {
      Target,
      lifetime: lifetime || 'SCOPED',
      startMode: options?.startMode,
      type: 'interactor',
      dataProps: { connector, provider },
    })
  }
}
