// deno-lint-ignore-file ban-types
import type { CoreConnectors } from 'typings/program.ts'

import { InternalError } from '@zanix/errors'

/**
 * A single core connector slot — same shape and purpose as `CoreProviderSlot`
 * (`providers/core/all.ts`), see its doc for the field-by-field rationale.
 */
export type CoreConnectorSlot = {
  key: CoreConnectors
  Target: Function
  sourcePackage?: string
  registered?: boolean
}

/**
 * Open, string-keyed registry of core connector slots — mirrors `providerCoreModules`
 * (`providers/core/all.ts`); see its doc for the full rationale (modeled on
 * `DiscoveryContainer`'s registry, never limited to the keys pre-seeded below).
 */
export const connectorCoreModules: Record<CoreConnectors, CoreConnectorSlot> = {
  // initialization only — real Target assigned by `./mod.ts`'s `registerCoreConnectorSlot` calls
  'cache:redis': { key: 'cache:redis', Target: {} as Function },
  'cache:memcached': { key: 'cache:memcached', Target: Function },
  'cache:custom': { key: 'cache:custom', Target: {} as Function },
  'cache:local': { key: 'cache:local', Target: {} as Function },
  kvLocal: { key: 'kvLocal', Target: {} as Function },
  asyncmq: { key: 'asyncmq', Target: {} as Function },
  database: { key: 'database', Target: {} as Function },
  search: { key: 'search', Target: {} as Function },
}

/**
 * Registers `key` as a core connector slot backed by `BaseTarget` — see
 * `registerCoreProviderSlot` (`providers/core/all.ts`) for the full rationale, co-location
 * requirement, and idempotency/conflict semantics; identical mechanism, connector side.
 */
export function registerCoreConnectorSlot(
  key: CoreConnectors,
  BaseTarget: Function,
  options: { sourcePackage?: string } = {},
): void {
  const existing = connectorCoreModules[key]

  if (existing?.registered && existing.Target !== BaseTarget) {
    throw new InternalError(
      `Core connector slot "${key}" is already registered with a different base class ` +
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

  connectorCoreModules[key] = {
    key,
    Target: BaseTarget,
    sourcePackage: options.sourcePackage ?? existing?.sourcePackage,
    registered: true,
  }
}

/**
 * Looks up a registered core connector slot by key — `undefined` if `key` was never registered.
 * See `getCoreProviderSlot` (`providers/core/all.ts`) for the full rationale.
 */
export function getCoreConnectorSlot(
  key: CoreConnectors,
): CoreConnectorSlot | undefined {
  const slot = connectorCoreModules[key]
  return slot?.registered ? slot : undefined
}

/**
 * Maps a concrete connector class's target key back to the core slot string key it was decorated
 * under — connector-side mirror of `resolveCoreProviderTargetAlias` (`providers/core/all.ts`);
 * see its doc for the full rationale.
 */
const targetKeyToCoreConnectorKey: Record<string, string> = {}

/** Registers the alias described above — called once per decorated class, from `defineConnectorDecorator`. */
export function aliasCoreConnectorTarget(targetKey: string, key: string): void {
  targetKeyToCoreConnectorKey[targetKey] = key
}

/** Resolves a class's target key back to its core slot string key, if it was decorated as one. */
export function resolveCoreConnectorTargetAlias(
  targetKey: string,
): string | undefined {
  return targetKeyToCoreConnectorKey[targetKey]
}

export default connectorCoreModules
