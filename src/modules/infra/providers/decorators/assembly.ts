import type { ProviderDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { CoreProviders, Lifetime, ProviderTypes, StartMode } from 'typings/program.ts'

import ProvidersCoreModules, { aliasCoreProviderTarget } from 'providers/core/all.ts'
import { ZanixProvider } from 'providers/base.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { InternalError } from '@zanix/errors'

/** Define decorator to register a provider */
export function defineProviderDecorator<L extends Exclude<Lifetime, 'TRANSIENT'>>(
  options?: ProviderTypes | ProviderDecoratorOptions<L>,
): ZanixClassDecorator {
  let key: string
  let slot: ProviderTypes = 'custom'
  let startMode: StartMode = 'lazy'
  let lifetime: Lifetime = 'SINGLETON'

  if (typeof options === 'string') {
    slot = options
  } else if (options) {
    slot = options.slot || slot
    startMode = options.startMode || startMode
    lifetime = options.lifetime || lifetime
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixProvider)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Provider. Please extend '${ZanixProvider.name}'`,
        { meta: { source: 'zanix', targetName: Target.name, baseTarget: ZanixProvider.name } },
      )
    }

    // `slot in ProvidersCoreModules` alone isn't enough — the 5 built-in core slots (`cache`,
    // `asyncmq`, `worker`, `auth`, `notifications`) are pre-seeded with a non-callable placeholder
    // `Target` from module load, before their owning package's `registerCoreProviderSlot` call
    // ever runs. Checking `.registered` distinguishes "genuinely registered" from "reserved name,
    // not registered yet in this module context" — the latter must never reach the `instanceof`
    // check below, since a placeholder `Target` isn't a constructor and throws a confusing
    // `TypeError: Right-hand side of 'instanceof' is not callable` instead of a clear diagnostic.
    const coreSlot = ProvidersCoreModules[slot as CoreProviders]

    if (coreSlot?.registered) {
      key = slot
      const BaseTarget = coreSlot.Target
      if (!(Target.prototype instanceof BaseTarget)) {
        throw new InternalError(
          `The class '${Target.name}' is not a valid '${slot}' Provider. Please extend '${BaseTarget.name}'`,
          {
            meta: {
              source: 'zanix',
              providerSlot: slot,
              targetName: Target.name,
              baseTarget: BaseTarget.name,
            },
          },
        )
      }
      // Lets `this.providers.get(Target)` resolve the same singleton as `get('<slot>')` — see
      // `resolveCoreProviderTargetAlias`'s doc (`providers/core/all.ts`).
      aliasCoreProviderTarget(getTargetKey(Target), key)
    } else if (coreSlot) {
      throw new InternalError(
        `Cannot decorate '${Target.name}' with slot "${slot}": this is a reserved core provider ` +
          `slot, but it hasn't been registered yet in this module context (e.g. a Worker with its ` +
          `own module graph, evaluated before the owning package's registration ran). Make sure ` +
          `the package that owns it (its own '/core' entrypoint, which calls ` +
          `registerCoreProviderSlot) is imported before this class is decorated.`,
        { meta: { source: 'zanix', targetName: Target.name, providerSlot: slot } },
      )
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
