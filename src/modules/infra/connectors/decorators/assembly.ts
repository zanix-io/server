import type { ConnectorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ConnectorTypes, CoreConnectors, Lifetime, StartMode } from 'typings/program.ts'
import type { ConnectorAutoInitOptions } from 'typings/targets.ts'

import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import ConnectorCoreModules from 'connectors/core/all.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { InternalError } from '@zanix/errors'

import 'connectors/core/mod.ts' // initialize module

/** Define decorator to register a connector */
export function defineConnectorDecorator<L extends Lifetime>(
  options?: ConnectorTypes | ConnectorDecoratorOptions<L>,
): ZanixClassDecorator {
  let key: string
  let type: ConnectorTypes = 'custom'
  let startMode: StartMode = 'postBoot'
  let lifetime: Lifetime = 'SINGLETON'
  let autoInitialize: ConnectorAutoInitOptions = true

  if (typeof options === 'string') {
    type = options
  } else if (options) {
    type = options.type || type
    startMode = options.startMode || startMode
    lifetime = options.lifetime || lifetime
    autoInitialize = options.autoInitialize ?? autoInitialize
  }

  const coreConnectors = Object.keys(ConnectorCoreModules)

  return function (Target) {
    if (!(Target.prototype instanceof ZanixConnector)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Connector. Please extend '${ZanixConnector.name}'`,
      )
    }

    if (coreConnectors.includes(type)) {
      key = type
      const BaseTarget = ConnectorCoreModules[type as CoreConnectors].Target
      if (!(Target.prototype instanceof BaseTarget)) {
        throw new InternalError(
          `The class '${Target.name}' is not a valid '${type}' Connector. Please extend '${BaseTarget.name}'`,
        )
      }
    } else {
      key = getTargetKey(Target)
    }

    ProgramModule.targets.defineTarget(key, {
      Target,
      lifetime,
      startMode,
      type: 'connector',
      dataProps: { type, autoInitialize },
    })
  }
}
