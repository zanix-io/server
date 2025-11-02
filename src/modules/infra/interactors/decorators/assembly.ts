import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { Lifetime } from 'typings/program.ts'
import type { ZanixConnector } from 'connectors/base.ts'

import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import ConnectorCoreModules from 'connectors/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'
import { ZANIX_PROPS } from 'utils/constants.ts'

/** Define decorator to register an interactor */
export function defineInteractorDecorator<C extends typeof ZanixConnector, L extends Lifetime>(
  options?: InteractorDecoratorOptions<C, L>,
): ZanixClassDecorator {
  let connector: string | undefined
  let lifetime: Lifetime | undefined
  if (options) {
    lifetime = options.lifetime
    connector = getTargetKey(options.Connector)
  }

  const coreConnectors = Object.values(ConnectorCoreModules)

  return function (Target) {
    if (!(Target.prototype instanceof ZanixInteractor)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Interactor. Please extend ${ZanixInteractor.name}`,
      )
    }

    // Core connector validation use
    const Connector = options?.Connector
    if (Connector) {
      const connectorType = ProgramModule.targets['getTarget']('connector:' + connector)
        ?.prototype[ZANIX_PROPS].type // Asume that exists if is not core

      const connectorTarget = coreConnectors.find(({ Target: ConnectorTarget }) =>
        Connector.prototype instanceof ConnectorTarget
      )
      if (!connectorType && connectorTarget) {
        throw new InternalError(
          `Invalid dependency injection: '${Connector.name}' is a core connector and cannot be injected into '${Target.name}'. Access it through 'this.${connectorTarget?.key}' inside your class, and remove it from the Interactor decorator configuration.`,
        )
      }
    }

    const key = getTargetKey(Target)

    ProgramModule.targets.defineTarget(key, {
      Target,
      lifetime: lifetime || 'SCOPED',
      startMode: options?.startMode,
      type: 'interactor',
      dataProps: { connector },
    })
  }
}
