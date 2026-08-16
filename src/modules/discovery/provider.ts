import type { DiscoveryContract } from 'typings/discovery.ts'

/**
 * Version of the Discovery protocol itself (the envelope shape — `resourceType`/`generatedAt`/
 * `items`, and later `cursor`) — independent of any single resource's own data, and independent of
 * `@zanix/admin`'s own `ADMIN_PROTOCOL_VERSION` (a different protocol, a different concern). Bump
 * this only when the envelope shape itself changes, not when a resource's `items` shape does.
 */
export const DISCOVERY_PROTOCOL_VERSION = 1

/**
 * Resolves `resourceType` into the transport-agnostic facts any Discovery transport needs —
 * mirrors `compileRuntime`: pure, no side effects, callable repeatedly with identical input for
 * identical output. Never touches HTTP — see `discovery/mount.ts`'s `compileHttpRuntime` for the
 * layer that does.
 */
export function compileDiscoveryContract(
  resourceType: string,
): DiscoveryContract {
  return { resourceType, protocolVersion: DISCOVERY_PROTOCOL_VERSION }
}
