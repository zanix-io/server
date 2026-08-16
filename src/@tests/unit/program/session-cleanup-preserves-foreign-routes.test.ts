import { assert, assertEquals } from '@std/assert'
import { InternalProgram as ProgramClass } from 'modules/program/mod.ts'

/**
 * Unlike `reset-for-applications.test.ts` (which calls `resetExceptApplications` with a
 * hand-built `Set`), this exercises the REAL integration: two genuinely concurrent
 * `BootSessionContainer.runSession` calls (via `ProgramClass`'s own `sessions`), where session A's
 * `cleanupInitializationsMetadata('postBoot', true)` computes its exclude-list from
 * `getForeignActiveApplications()` — populated by session B's own `defineRoute` call, not by the
 * test asserting a Set by hand. Session B is kept deliberately in-flight (via `aCleanedUp`, not a
 * `setTimeout`) until AFTER A's cleanup call returns, so this is deterministic, not a race — same
 * gating discipline `session.test.ts` already uses for its own concurrent-sessions test.
 */
Deno.test(
  "cleanupInitializationsMetadata('postBoot', true) preserves a different, still-in-flight " +
    "session's Application — computed live from a real concurrent session, not a hand-built Set",
  async () => {
    const program = new ProgramClass()

    let resolveARegistered: () => void = () => {}
    let resolveBRegistered: () => void = () => {}
    let resolveACleanedUp: () => void = () => {}
    const aRegistered = new Promise<void>((
      resolve,
    ) => (resolveARegistered = resolve))
    const bRegistered = new Promise<void>((
      resolve,
    ) => (resolveBRegistered = resolve))
    const aCleanedUp = new Promise<void>((
      resolve,
    ) => (resolveACleanedUp = resolve))

    const sessionA = program.sessions.runSession(async () => {
      program.routes.defineRoute('rest', {
        path: '/a-route',
        handler: () => '' as never,
      }, 'a')
      resolveARegistered()
      await bRegistered // wait until B has registered its own route under its own session
      program.cleanupInitializationsMetadata('postBoot', true)
      resolveACleanedUp()
    })

    const sessionB = program.sessions.runSession(async () => {
      await aRegistered
      program.routes.defineRoute('rest', {
        path: '/b-route',
        handler: () => '' as never,
      }, 'b')
      resolveBRegistered()
      // Stay inside runSession (still "active", still tracked in #activeSessions) until AFTER
      // A's cleanup call has actually run — otherwise whether B still counts as foreign at the
      // moment A checks would depend on microtask ordering instead of being deterministic.
      await aCleanedUp
    })

    await Promise.all([sessionA, sessionB])

    const routes = program.routes.getRoutes('rest')
    // Storage key is `${application}:${path}/${httpMethod}` — see
    // `cross-application-route-collision.test.ts` for why `application` participates in it.
    assert(
      routes?.['b:/b-route/GET'],
      "a different, still-in-flight session's route must survive A's own cleanup",
    )
    assertEquals(
      routes?.['a:/a-route/GET'],
      undefined,
      "A's own route is swept by A's own finalize cleanup, same as the pre-existing full-wipe " +
        'behavior when nothing foreign is active',
    )
  },
)
