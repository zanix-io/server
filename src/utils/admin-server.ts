import type { WebServerTypes } from 'typings/server.ts'
import { InternalError } from '@zanix/errors'

/** Env var name for a stable admin server id across restarts — see {@link resolveAdminServerId}. */
export const ADMIN_SERVER_ID_ENV = 'ADMIN_SERVER_ID'

/**
 * Env var name for a retiring admin server id to keep dispatching alongside the current one during
 * a manual rotation window — see {@link resolvePreviousAdminServerId}.
 */
export const ADMIN_SERVER_ID_PREVIOUS_ENV = 'ADMIN_SERVER_ID_PREVIOUS'

/**
 * Resolves the explicit `id` to pass to `bootstrapServers({..., application: 'admin'})`/
 * `webServerManager.create()` for one admin server type, from the `ADMIN_SERVER_ID` env var — read
 * at call time (not import time), so a caller/test setting the env var right before starting is
 * still observed.
 *
 * Both `@zanix/core`'s `start()` and `@zanix/admin`'s own `start()` call this rather than each
 * hand-rolling their own `` `${id}-${type}` `` suffixing — previously only one of them actually
 * did, so `@zanix/admin`'s standalone deployment got a fresh random id every restart while
 * `@zanix/core`'s embedded one got a stable one across deploys. Routing both through this one
 * function means they can't drift out of sync again.
 *
 * **There is no auto-generated fallback anymore: the admin server is anchored (gets an
 * obscuring URL prefix) if and only if `ADMIN_SERVER_ID` is set.** Leaving it unset gives a plain,
 * unprefixed admin server — an honest signal that path-obscurity wasn't opted into, rather than a
 * random id nobody could ever legitimately learn.
 *
 * @param type The server type (`'rest'`/`'graphql'`/`'socket'`) this id is for.
 * @returns `` `${ADMIN_SERVER_ID}-${type}` `` if the env var is set, else `undefined`.
 */
export function resolveAdminServerId(type: WebServerTypes): string | undefined {
  const id = Deno.env.get(ADMIN_SERVER_ID_ENV)
  return id ? `${id}-${type}` : undefined
}

/**
 * Resolves the `previousId` to pass alongside {@link resolveAdminServerId}'s own result, from the
 * `ADMIN_SERVER_ID_PREVIOUS` env var — the manual rotation runbook: set both this and a new
 * `ADMIN_SERVER_ID` in one redeploy, so every replica serves both prefixes simultaneously and
 * callers still using the old address keep working while they're updated to the new one; drop this
 * env var in a later redeploy to close the window. `compileRuntime` throws if this resolves to a
 * value while `resolveAdminServerId` doesn't (nothing to rotate from).
 *
 * @param type The server type (`'rest'`/`'graphql'`/`'socket'`) this id is for.
 * @returns `` `${ADMIN_SERVER_ID_PREVIOUS}-${type}` `` if the env var is set, else `undefined`.
 */
export function resolvePreviousAdminServerId(type: WebServerTypes): string | undefined {
  const id = Deno.env.get(ADMIN_SERVER_ID_PREVIOUS_ENV)
  return id ? `${id}-${type}` : undefined
}

/** Which caller currently holds the admin-registration claim — see {@link guardSingleAdminRegistration}. */
let registeredBy: string | undefined

/**
 * Guards against `@zanix/core`'s `start()` (with its `admin` option enabled) and
 * `@zanix/admin`'s own `start()` both registering admin metadata in the same process — each
 * independently calls `bootstrapServers()` against the same shared, process-global metadata
 * registry (routes, pending resolvers), and running both together silently corrupts it: one's
 * cleanup can wipe routes/resolvers the other registered before they're ever served, with no
 * error — only a missing endpoint. Call once, at the very start of whichever `defineAdminMetadata()`
 * runs, from both packages; the second *different* caller in a process throws instead of letting
 * that race happen silently. Calling again with the *same* `owner` (e.g. a test file starting and
 * stopping the same service multiple times) is a no-op, not a re-throw.
 *
 * Pair with {@link releaseAdminRegistration} on `stop()` so a service that shuts down doesn't keep
 * holding the claim forever (needed for e.g. test suites that start/stop repeatedly in one process).
 *
 * @param owner A short, human-readable label for the caller registering (`'core'`/`'admin'`) —
 * only used in the thrown error message.
 */
export function guardSingleAdminRegistration(owner: string): void {
  if (registeredBy !== undefined && registeredBy !== owner) {
    throw new InternalError(
      `Both "${registeredBy}" and "${owner}" tried to register the admin server in this same ` +
        "process. Use @zanix/core's `Zanix.start()` (with `admin` enabled) OR run " +
        '`ZanixAdmin.start()` as its own standalone deployment — never both in the same process.',
      { meta: { source: 'zanix', registeredBy, owner } },
    )
  }
  registeredBy = owner
}

/** Releases the claim {@link guardSingleAdminRegistration} took, if `owner` is the one holding it. */
export function releaseAdminRegistration(owner: string): void {
  if (registeredBy === owner) registeredBy = undefined
}
