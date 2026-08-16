import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * Mirrors `shared-port-three-way.test.ts`'s own two-independent-`bootstrapServers()`-calls-on-one-
 * port shape, but for health: liveness (`/health`) is registered exactly once, first claim wins —
 * it never varies per Application. Readiness (`/ready`) is different: each Application sharing the
 * port contributes its OWN `health.checks`, and both must show up, broken out by Application name,
 * under `/ready`'s own `apps` field — not silently dropped by whichever Application happened to
 * claim the port first (the previous, buggy behavior). See `WebServerManager.create`'s own health
 * doc and the design doc's "Registro multi-puerto, multi-dueño" section. Both Applications' own
 * real routes must still work regardless.
 */
Deno.test(
  'health: two different Applications sharing one port each get their own readiness checks aggregated under /ready, liveness stays single',
  async () => {
    const SHARED_PORT = 4406
    let idA: ServerID | undefined
    let idB: ServerID | undefined

    try {
      await import('./fixtures/health-shared-port-a.fixture.ts')
      await import('./fixtures/health-shared-port-b.fixture.ts')

      await bootstrapServers({
        rest: {
          application: 'health-shared-a',
          id: 'health-shared-a',
          port: SHARED_PORT,
          onCreate: (id) => {
            idA = id
          },
        },
        health: { checks: { aCheck: () => true } },
      }, { finalize: false })

      await bootstrapServers({
        rest: {
          application: 'health-shared-b',
          id: 'health-shared-b',
          port: SHARED_PORT,
          onCreate: (id) => {
            idB = id
          },
        },
        health: { checks: { bCheck: () => false } },
      })

      assert(idA, "the first Application's server should have been created")
      assert(idB, "the second Application's server should have been created")

      const addrA = webServerManager.info(idA).addr
      const addrB = webServerManager.info(idB).addr
      assert(addrA, 'the first server should be listening')
      assert(addrB, 'the second server should be listening')
      assertEquals(addrA?.port, SHARED_PORT)
      assertEquals(addrB?.port, SHARED_PORT)

      const base = `http://${addrA?.hostname}:${SHARED_PORT}`

      // Both real, anchored routes still work, unaffected by health sharing their port.
      const aHello = await fetch(`${base}/health-shared-a/a-hello`)
      assertEquals(aHello.status, 200)
      await aHello.body?.cancel()

      const bHello = await fetch(`${base}/health-shared-b/b-hello`)
      assertEquals(bHello.status, 200)
      await bHello.body?.cancel()

      // Liveness itself: reachable exactly once on the shared port, no collision/throw from either
      // Application's own attempt to register it, and never varies per Application.
      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
      assertEquals(await health.json(), { status: 'ok' })

      // Readiness: BOTH Applications' own checks show up, broken out by name — app B's failing
      // check degrades the overall status without ever hiding app A's own passing one.
      const ready = await fetch(`${base}/ready`)
      assertEquals(ready.status, 503)
      assertEquals(await ready.json(), {
        status: 'degraded',
        shared: { status: 'ok', checks: {} },
        apps: {
          'health-shared-a': { status: 'ok', checks: { aCheck: true } },
          'health-shared-b': { status: 'degraded', checks: { bCheck: false } },
        },
      })
    } finally {
      const ids = [idA, idB].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
