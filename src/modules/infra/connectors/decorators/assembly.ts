import type { ConnectorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ConnectorTypes, CoreConnectors, Lifetime, StartMode } from 'typings/program.ts'

import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { getTargetKey } from 'utils/targets.ts'
import Program from 'modules/program/main.ts'
import { CORE_CONNECTORS } from 'utils/constants.ts'

/** Define decorator to register a connector */
export function defineConnectorDecorator(
  options?: ConnectorDecoratorOptions,
): ZanixClassDecorator {
  let key: string
  let type: ConnectorTypes
  let startMode: StartMode | undefined
  let lifetime: Lifetime
  if (typeof options === 'string') {
    type = options
  } else if (options) {
    type = options.type
    startMode = options.startMode || 'postBoot'
    lifetime = options.lifetime || 'SINGLETON'
  }

  const coreConnectors = Object.keys(CORE_CONNECTORS)

  return function (Target) {
    if (!(Target.prototype instanceof ZanixConnector)) {
      throw new Deno.errors.Interrupted(
        `'${Target.name}' is not a valid Connector. Please extend '${ZanixConnector.name}'`,
      )
    }

    if (coreConnectors.includes(type)) {
      key = type
      const BaseTarget = CORE_CONNECTORS[type as CoreConnectors].Target
      if (!(Target.prototype instanceof BaseTarget)) {
        throw new Deno.errors.Interrupted(
          `'${Target.name}' is not a valid '${type}' Connector. Please extend '${BaseTarget.name}'`,
        )
      }
    } else {
      key = getTargetKey(Target)
    }

    Program.targets.toBeInstanced(key, {
      Target,
      lifetime,
      startMode,
      type: 'connector',
      dataProps: { type },
    })
  }
}
