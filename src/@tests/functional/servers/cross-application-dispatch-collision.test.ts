import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { InternalError } from '@zanix/errors'
import { assert, assertEquals, assertRejects } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * Regression for a real, confirmed-in-production incident: two `'rest'` Applications, neither
 * given an explicit `id`/`globalPrefix`/`port`, independently land on the identical default
 * `dispatchKey` (`resolveGlobalPrefix`'s `'api'` fallback — deliberately the same for every
 * Application, see that function's own doc) AND, once `PORT` is set (any real deploy), the
 * identical default port too (`WebServerManager.getEnvPort`, equally Application-agnostic).
 *
 * Before `claimDispatchKey` (`manager.ts`), the SECOND `bootstrapServers()` call's own `create()`
 * silently overwrote the FIRST Application's entire dispatch-table entry — `getMainHandler` only
 * ever serves its own Application's routes, so the first Application's routes started 404ing with
 * no error, no warning, and nothing distinguishing the process's own boot log from a fully healthy
 * one. This test proves the second call now fails loudly instead, and that the first Application's
 * routes are completely unaffected by the rejected attempt.
 */
Deno.test(
  'bootstrapServers: two different Applications sharing the default dispatch key AND the default (env) port fail loudly instead of silently overwriting each other',
  async () => {
    const SHARED_PORT = 4550
    let idA: ServerID | undefined

    try {
      Deno.env.set('PORT', String(SHARED_PORT))

      await import('./fixtures/dispatch-collision-a.fixture.ts')
      await import('./fixtures/dispatch-collision-b.fixture.ts')

      // Application A: no id, no globalPrefix, no port — everything left to its defaults, exactly
      // like a process's own default REST server. Not the last call of the (attempted) sequence.
      idA = (await bootstrapServers({
        rest: { application: 'dispatch-collision-a' },
      }, { finalize: false }))[0]

      assert(idA, "Application A's server should have been created")
      const addrA = webServerManager.info(idA).addr
      assert(addrA, 'Application A should be listening')
      assertEquals(addrA.port, SHARED_PORT)

      // Application B: same shape — no id, no globalPrefix, no port. Resolves to the SAME
      // dispatch key ('api') on the SAME port (SHARED_PORT, via the shared PORT env var) as
      // Application A above, purely by coincidence of both being left unconfigured — never anything
      // either side asked for.
      await assertRejects(
        () => bootstrapServers({ rest: { application: 'dispatch-collision-b' } }),
        InternalError,
        'resolved to the same dispatch key',
      )

      // The real proof this is actually fixed, not just "throws SOMETHING": Application A's own
      // route is still fully reachable, completely unaffected by Application B's rejected attempt
      // to register on top of it — before this fix, this exact request would have 404'd instead,
      // silently served by Application B's (also 404ing, since it never matches `/hello-a`) handler.
      const res = await fetch(`http://${addrA.hostname}:${addrA.port}/api/hello-a`)
      assertEquals(res.status, 200)
      assertEquals(await res.text(), 'response from Application A')
    } finally {
      Deno.env.delete('PORT')
      if (idA) await webServerManager.stop(idA)
    }
  },
)

/**
 * The deliberate, already-shipped composition pattern this fix must never break: the SAME
 * Application, registered via two independent `bootstrapServers()` calls (e.g. a caller that
 * re-runs its own boot sequence, or splits registration across modules), reusing the identical
 * default dispatch key on the identical default port. `getMainHandler` rebuilds that Application's
 * FULL route table on every `create()` call, so the second call's overwrite is a harmless,
 * idempotent rebuild — never the data-loss collision `claimDispatchKey` guards against, since both
 * calls agree on which Application they're claiming the key for.
 */
Deno.test(
  'bootstrapServers: the SAME Application registered twice, unconfigured, on the shared default port never trips the collision guard',
  async () => {
    const SHARED_PORT = 4551
    let firstId: ServerID | undefined
    let secondId: ServerID | undefined

    try {
      Deno.env.set('PORT', String(SHARED_PORT))

      // Fixture already imported (and its Application already defined) by the previous test in
      // this file — dynamic `import()` of the same specifier only runs its top-level code once per
      // process, so this reuses the exact same Application/route registration.
      await import('./fixtures/dispatch-collision-a.fixture.ts')

      firstId = (await bootstrapServers({
        rest: { application: 'dispatch-collision-a' },
      }, { finalize: false }))[0]

      secondId = (await bootstrapServers({
        rest: { application: 'dispatch-collision-a' },
      }))[0]

      assert(firstId, 'first registration should have succeeded')
      assert(secondId, 'second registration of the SAME Application should also succeed')

      const addr = webServerManager.info(firstId).addr
      assert(addr, 'the shared listener should be up')
      assertEquals(webServerManager.info(secondId).addr?.port, addr.port)

      const res = await fetch(`http://${addr.hostname}:${addr.port}/api/hello-a`)
      assertEquals(res.status, 200)
      assertEquals(await res.text(), 'response from Application A')
    } finally {
      Deno.env.delete('PORT')
      const ids = [firstId, secondId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
