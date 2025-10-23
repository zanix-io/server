import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { Lifetime } from 'typings/program.ts'
import type { ZanixConnector } from 'connectors/base.ts'

import { ZanixInteractor } from 'modules/infra/interactors/base.ts'
import ConnectorCoreModules from 'connectors/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Define decorator to register an interactor */
export function defineInteractorDecorator<C extends typeof ZanixConnector>(
  options?: InteractorDecoratorOptions<C>,
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
      throw new Deno.errors.Interrupted(
        `'${Target.name}' is not a valid Interactor. Please extend ${ZanixInteractor.name}`,
      )
    }

    // Core connector validation use
    const Connector = options?.Connector
    if (Connector) {
      const connectorType = ProgramModule.targets['getTarget']('connector:' + connector)
        ?.prototype['_znxProps'].type // Asume that exists if is not core

      const connectorTarget = coreConnectors.find(({ Target: ConnectorTarget }) =>
        Connector.prototype instanceof ConnectorTarget
      )
      if (!connectorType && connectorTarget) {
        throw new Deno.errors.Interrupted(
          `'${Connector.name}' cannot be used directly by '${Target.name}'. Instead, you should use 'this.${connectorTarget?.key}' and remove it from the Interactor decorator.`,
        )
      }
    }

    const key = getTargetKey(Target)

    ProgramModule.targets.toBeInstanced(key, {
      Target,
      lifetime: lifetime || 'SCOPED',
      type: 'interactor',
      dataProps: { connector },
    })
  }
}
