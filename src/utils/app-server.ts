import type { WebServerTypes } from 'typings/server.ts'

/**
 * Stable-id/anchoring helpers for any Application-scoped server that wants a predictable env-var
 * name (`ADMIN_SERVER_ID`, `ADMIN_HUB_SERVER_ID`, ...) rather than a random id every restart —
 * shared by `@zanix/core`'s embedded `admin` option and `@zanix/admin`'s own `ZanixAdminHub.start()`
 * so neither package hand-rolls its own env-var-suffixing logic, or needs its own named
 * function/env-var pair. Named generically (not `admin-server.ts`) because these work for ANY
 * Application, not just `'admin'`.
 */

/** `'my-app'` -> `'MY_APP'`, so any Application name maps predictably onto an env var name. */
function toEnvKey(application: string): string {
  return application.toUpperCase().replace(/-/g, '_')
}

/**
 * Suffix appended to an Application's own env-key (see `toEnvKey`) to name its stable-id env var —
 * `` `${toEnvKey(application)}${SERVER_ID_SUFFIX}` `` (e.g. `'admin'` -> `ADMIN_SERVER_ID`). See
 * {@link resolveApplicationServerId}. Exported (rather than a fixed list of vars) because the
 * Application name itself is arbitrary — this documents the PATTERN, not one var per Application.
 */
export const SERVER_ID_SUFFIX = '_SERVER_ID'

/**
 * Suffix appended to an Application's own env-key to name its retiring-id env var —
 * `` `${toEnvKey(application)}${SERVER_ID_PREVIOUS_SUFFIX}` `` (e.g. `'admin'` ->
 * `ADMIN_SERVER_ID_PREVIOUS`). See {@link resolvePreviousApplicationServerId} and
 * {@link SERVER_ID_SUFFIX}.
 */
export const SERVER_ID_PREVIOUS_SUFFIX = `${SERVER_ID_SUFFIX}_PREVIOUS`

/**
 * Resolves the explicit `id` to pass to `bootstrapServers({..., application})`/
 * `webServerManager.create()` for one Application's server type, from that Application's own
 * stable-id env var — `` `${toEnvKey(application)}${SERVER_ID_SUFFIX}` `` (e.g. `'admin'` ->
 * `ADMIN_SERVER_ID`, `'admin-hub'` -> `ADMIN_HUB_SERVER_ID`) — read at call time (not import time),
 * so a caller/test setting the env var right before starting is still observed.
 *
 * Every Application-scoped server package (`@zanix/core`'s embedded `admin` option,
 * `@zanix/admin`'s own `ZanixAdminHub.start()`, ...) calls this rather than hand-rolling its own
 * `` `${id}-${type}` `` suffixing, so they can't drift out of sync with each other, and a new
 * Application gets the same capability for free.
 *
 * **There is no auto-generated fallback: a server is anchored (gets an obscuring URL prefix) if
 * and only if its Application's stable-id env var is set.** Leaving it unset gives a plain,
 * unprefixed server — an honest signal that path-obscurity wasn't opted into, rather than a random
 * id nobody could ever legitimately learn.
 *
 * @param application The Application (see `ApplicationContainer`) this id is for.
 * @param type The server type (`'rest'`/`'graphql'`/`'socket'`) this id is for.
 * @returns `` `${id}-${type}` `` if the env var is set, else `undefined`.
 */
export function resolveApplicationServerId(
  application: string,
  type: WebServerTypes,
): string | undefined {
  const id = Deno.env.get(`${toEnvKey(application)}${SERVER_ID_SUFFIX}`)
  return id ? `${id}-${type}` : undefined
}

/**
 * Resolves the `previousId` to pass alongside {@link resolveApplicationServerId}'s own result,
 * from that Application's own retiring-id env var —
 * `` `${toEnvKey(application)}${SERVER_ID_PREVIOUS_SUFFIX}` ``
 * — the manual rotation runbook: set both this and a new stable id in one redeploy, so every
 * replica serves both prefixes simultaneously and callers still using the old address keep working
 * while they're updated to the new one; drop this env var in a later redeploy to close the window.
 * `compileRuntime` throws if this resolves to a value while {@link resolveApplicationServerId}
 * doesn't (nothing to rotate from).
 *
 * @param application The Application (see `ApplicationContainer`) this id is for.
 * @param type The server type (`'rest'`/`'graphql'`/`'socket'`) this id is for.
 * @returns `` `${previousId}-${type}` `` if the env var is set, else `undefined`.
 */
export function resolvePreviousApplicationServerId(
  application: string,
  type: WebServerTypes,
): string | undefined {
  const id = Deno.env.get(`${toEnvKey(application)}${SERVER_ID_PREVIOUS_SUFFIX}`)
  return id ? `${id}-${type}` : undefined
}
