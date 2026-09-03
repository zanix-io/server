import type { ProviderDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { CoreProviders, Lifetime, ProviderTypes, StartMode } from 'typings/program.ts'

import ProvidersCoreModules, {
  aliasCoreProviderTarget,
  registerCustomProviderSlotAlias,
} from 'providers/core/all.ts'
import { ZanixProvider } from 'providers/base.ts'
import ProgramModule from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { InternalError } from '@zanix/errors'

/**
 * Define decorator to register a provider.
 *
 * `options.slot` (or the plain-string shorthand) accepts either a REGISTERED core slot
 * (`'cache'`, `'auth'`, ...) or a plain, developer-chosen custom string — as of a real fix, no
 * longer silently ignored for anything outside the 5 core slots. A custom `slot` gives a plain
 * `@Provider` class the same "resolve by class reference OR by string, always the SAME cached
 * singleton" guarantee core slots already had (`aliasCoreProviderTarget`) — closing a real,
 * confirmed module-identity split `NATIVE_RUNTIME_MODULES` (`@zanix/space`) structurally cannot
 * reach: a PROJECT-LOCAL provider class a consuming app's Space pages reach through Vite's SSR
 * pipeline gets re-evaluated as a SECOND, independent class object from whatever the native
 * process already loaded directly — same source, same name, different reference. Without a shared
 * `slot`, `this.providers.get(TheClass)` from one evaluation can never find what the OTHER
 * evaluation registered (`[BaseInstancesContainer]: Target is not a constructor` —
 * `INVALID_INSTANCE`, confirmed as a real production failure). With a shared `slot`, both
 * evaluations' own class-derived keys alias to the SAME string, and — since a re-registration
 * under an already-used key only ever overwrites the stored `Target` reference, never an
 * already-cached instance (`TargetContainer.defineTarget`/`BaseInstancesContainer.getInstance`) —
 * whichever evaluation resolves an instance FIRST is the one every later lookup, from EITHER
 * evaluation, keeps returning.
 *
 * Never applies to the default (`slot` omitted, or explicitly `'custom'`): that keeps resolving
 * purely by class reference, exactly as before — the right choice for a class no one intends to
 * cross the identity boundary above with (see `registerCustomProviderSlotAlias`'s own doc for the
 * one guard rail a custom `slot` DOES enforce: two genuinely different classes cannot collide on
 * the same one, only two evaluations of the SAME class — compared by name — legitimately can).
 */
export function defineProviderDecorator<
  L extends Exclude<Lifetime, 'TRANSIENT'>,
>(
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
        {
          meta: {
            source: 'zanix',
            targetName: Target.name,
            baseTarget: ZanixProvider.name,
          },
        },
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
        {
          meta: {
            source: 'zanix',
            targetName: Target.name,
            providerSlot: slot,
          },
        },
      )
    } else if (slot !== 'custom') {
      // A real, developer-chosen slot string that isn't one of the 5 reserved core slots — see
      // this function's own doc for the module-identity split this closes. Registered the exact
      // same way a core slot is (storage key = the string itself, plus the class-reference
      // alias), just without requiring `registerCoreProviderSlot` — nothing pre-declares a custom
      // slot ahead of time, the first `@Provider({ slot })` to use one IS its registration.
      key = slot
      registerCustomProviderSlotAlias(key, Target)
      aliasCoreProviderTarget(getTargetKey(Target), key)
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
