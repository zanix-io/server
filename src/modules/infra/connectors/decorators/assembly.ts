import type { ConnectorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ConnectorTypes, Lifetime, StartMode } from 'typings/program.ts'
import type { ConnectorAutoInitOptions } from 'typings/targets.ts'

import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import ConnectorCoreModules, { aliasCoreConnectorTarget } from 'connectors/core/all.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { InternalError } from '@zanix/errors'

import 'connectors/core/mod.ts' // initialize module (registers 'cache:custom'/'cache:memcached')

/** Define decorator to register a connector */
export function defineConnectorDecorator<L extends Lifetime>(
  options?: ConnectorTypes | ConnectorDecoratorOptions<L>,
): ZanixClassDecorator {
  let key: string
  let slot: ConnectorTypes = 'custom'
  let startMode: StartMode = 'postBoot'
  let lifetime: Lifetime = 'SINGLETON'
  let autoInitialize: ConnectorAutoInitOptions = true

  if (typeof options === 'string') {
    slot = options
  } else if (options) {
    slot = options.slot || slot
    startMode = options.startMode || startMode
    lifetime = options.lifetime || lifetime
    autoInitialize = options.autoInitialize ?? autoInitialize
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixConnector)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Connector. Please extend '${ZanixConnector.name}'`,
        { meta: { target: Target.name, baseTarget: ZanixConnector.name } },
      )
    }

    // `slot in ConnectorCoreModules` alone isn't enough — the 8 built-in core slots (`database`,
    // `cache:*`, `kvLocal`, `asyncmq`, `search`) are pre-seeded with a non-callable placeholder
    // `Target` from module load, before their owning package's `registerCoreConnectorSlot` call
    // ever runs. Checking `.registered` distinguishes "genuinely registered" from "reserved name,
    // not registered yet in this module context" — the latter must never reach the `instanceof`
    // check below, since a placeholder `Target` isn't a constructor and throws a confusing
    // `TypeError: Right-hand side of 'instanceof' is not callable` instead of a clear diagnostic.
    const coreSlot = ConnectorCoreModules[slot]

    if (coreSlot?.registered) {
      key = slot
      const BaseTarget = coreSlot.Target
      if (!(Target.prototype instanceof BaseTarget)) {
        throw new InternalError(
          `The class '${Target.name}' is not a valid '${slot}' Connector. Please extend '${BaseTarget.name}'`,
          { meta: { target: Target.name, baseTarget: ZanixConnector.name } },
        )
      }
      // Lets `this.connectors.get(Target)` resolve the same singleton as `get('<slot>')` — see
      // `resolveCoreConnectorTargetAlias`'s doc (`connectors/core/all.ts`).
      aliasCoreConnectorTarget(getTargetKey(Target), key)
    } else if (coreSlot) {
      throw new InternalError(
        `Cannot decorate '${Target.name}' with slot "${slot}": this is a reserved core connector ` +
          `slot, but it hasn't been registered yet in this module context (e.g. a Worker with its ` +
          `own module graph, evaluated before the owning package's registration ran). Make sure ` +
          `the package that owns it (its own '/core' entrypoint, which calls ` +
          `registerCoreConnectorSlot) is imported before this class is decorated.`,
        { meta: { source: 'zanix', target: Target.name, slot } },
      )
    } else {
      key = getTargetKey(Target)
    }

    ProgramModule.targets.defineTarget(key, {
      Target,
      lifetime,
      startMode,
      type: 'connector',
      dataProps: { slot, autoInitialize },
    })
  }
}
