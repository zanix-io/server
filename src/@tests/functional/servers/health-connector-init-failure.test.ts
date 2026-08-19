import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')
stub(console, 'error')

Deno.test(
  "/ready reports 'degraded' (not a 500) when a connector's initialize() never succeeds",
  async () => {
    await import('./fixtures/health-connector-init-failure.fixture.ts')

    const servers = await bootstrapServers({
      rest: { port: 4408, application: 'health-connector-init-failure' },
    })

    try {
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      // `bootstrapServers()` above already awaited `targetInitializations('postBoot')`, so the
      // connector's `isReady` has already settled (rejected) by this point.
      const ready = await fetch(`${base}/ready`)
      const body = await ready.json()

      assertEquals(ready.status, 503)
      assertEquals(body.status, 'degraded')
      assertEquals(body.shared.status, 'degraded')
      const checks = Object.values(body.shared.checks) as boolean[]
      assert(
        checks.length > 0 && checks.every((value) => value === false),
        'the never-ready connector should report as a failing (not throwing) check',
      )

      // Liveness never depends on the connector, by design — always cheap, always 200.
      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
