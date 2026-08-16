// deno-lint-ignore-file ban-types
import { InternalError } from '@zanix/errors'
import type { CoreProviders } from 'typings/program.ts'

/**
 * A single core provider slot: the DI key it resolves under, the abstract base class any concrete
 * implementation must extend, and (optionally) a hint naming the package expected to register it
 * — used only to compose a clearer error when the slot was never registered (see
 * `getCoreProviderSlot`). `registered` distinguishes a real registration from the placeholder
 * pre-seeds below (present only so `.key` stays available immediately, matching pre-existing
 * behavior — see `registerCoreProviderSlot`'s own doc).
 */
export type CoreProviderSlot = {
  key: CoreProviders
  Target: Function
  sourcePackage?: string
  registered?: boolean
}

/**
 * Open, string-keyed registry of core provider slots — same shape and spirit as
 * `DiscoveryContainer`'s registry (`modules/program/metadata/discovery.ts`): any package can add
 * a slot at any key, `@zanix/server` never needs to enumerate them upfront. Pre-seeded here with
 * the slots `@zanix/server` currently owns directly (`Target` is a placeholder until `./mod.ts`
 * calls `registerCoreProviderSlot` for each); as ownership of a slot moves to another package,
 * that package's own `/core` entrypoint registers it here directly instead, at whatever key it
 * chooses — this object is never limited to the keys below.
 */
export const ProviderCoreModules: Record<CoreProviders, CoreProviderSlot> = {
  // initialization only — real Target assigned by `./mod.ts`'s `registerCoreProviderSlot` calls
  cache: { key: 'cache', Target: {} as Function },
  asyncmq: { key: 'asyncmq', Target: {} as Function },
  worker: { key: 'worker', Target: {} as Function },
  auth: { key: 'auth', Target: {} as Function },
  notifications: { key: 'notifications', Target: {} as Function },
}

/**
 * Registers `key` as a core provider slot backed by `BaseTarget` — the mechanism any package
 * owning a core capability (cache, asyncmq, auth, ...) uses to declare it, modeled directly on
 * `DiscoveryContainer.define`'s open, plain-function registration. Purely a runtime registration —
 * there's no companion type declaration to co-locate it with: a consumer who wants a precisely-typed
 * `this.providers.get('key')` result declares that key on their own class's `CoreModules` generic
 * instead (see `typings/targets.ts`'s `CoreModules` doc).
 *
 * Idempotent when called twice with the same `BaseTarget` for the same `key` (a harmless re-run,
 * e.g. a package's `/core` module evaluated more than once in a process that legitimately expects
 * that — see the ES module caching note on side-effect imports). Throws if called twice with a
 * *different* `BaseTarget` for the same `key` — a genuine conflict between two packages both
 * trying to own the same slot name.
 */
export function registerCoreProviderSlot(
  key: CoreProviders,
  BaseTarget: Function,
  options: { sourcePackage?: string } = {},
): void {
  const existing = ProviderCoreModules[key]

  if (existing?.registered && existing.Target !== BaseTarget) {
    throw new InternalError(
      `Core provider slot "${key}" is already registered with a different base class ` +
        `('${existing.Target.name}'). Cannot re-register it with '${BaseTarget.name}'.`,
      {
        meta: {
          source: 'zanix',
          slot: key,
          existingTarget: existing.Target.name,
          incomingTarget: BaseTarget.name,
        },
      },
    )
  }

  ProviderCoreModules[key] = {
    key,
    Target: BaseTarget,
    sourcePackage: options.sourcePackage ?? existing?.sourcePackage,
    registered: true,
  }
}

/**
 * Looks up a registered core provider slot by key — `undefined` if `key` was never registered via
 * `registerCoreProviderSlot` (including for one of the placeholder pre-seeds above, before its
 * owning `/core` module ran). Used to compose the explicit "missing core slot" error in
 * `modules/program/public.ts` instead of a generic "provider not found".
 */
export function getCoreProviderSlot(
  key: CoreProviders,
): CoreProviderSlot | undefined {
  const slot = ProviderCoreModules[key]
  return slot?.registered ? slot : undefined
}

/**
 * Maps a concrete provider class's target key (see `getTargetKey`, `utils/targets.ts`) back to
 * the core slot string key it was decorated under. Populated automatically by
 * `defineProviderDecorator` whenever `@Provider({ type })` decorates a class for a registered
 * core slot — never written to directly.
 *
 * This is what lets `this.providers.get(SomeCoreProviderSubclass)` resolve the exact same
 * singleton instance as `this.providers.get('name')`, without the two forms ever creating two
 * separate instances: `getProviders`'s `get(Class)` branch (`modules/program/public.ts`)
 * translates the class back to this canonical string key *before* it ever reaches
 * `TargetContainer`'s instance cache, so both forms end up resolving under the identical cache
 * key. A class that was never decorated for a core slot (the common case — a custom provider, or
 * simply a class nobody looks up by reference) has no entry here and resolves through the normal
 * class-keyed path unchanged.
 */
const targetKeyToCoreProviderKey: Record<string, string> = {}

/** Registers the alias described above — called once per decorated class, from `defineProviderDecorator`. */
export function aliasCoreProviderTarget(targetKey: string, key: string): void {
  targetKeyToCoreProviderKey[targetKey] = key
}

/** Resolves a class's target key back to its core slot string key, if it was decorated as one. */
export function resolveCoreProviderTargetAlias(
  targetKey: string,
): string | undefined {
  return targetKeyToCoreProviderKey[targetKey]
}

export default ProviderCoreModules
