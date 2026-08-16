import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test(
  "/ready reflects a real, auto-initialized connector's isHealthy() live, per request",
  async () => {
    const { connectorState } = await import(
      './fixtures/health-connector-readiness.fixture.ts'
    )

    const servers = await bootstrapServers({
      rest: { port: 4407, application: 'health-connector-readiness' },
    })

    try {
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      connectorState.healthy = true
      const readyOk = await fetch(`${base}/ready`)
      const bodyOk = await readyOk.json()
      assertEquals(readyOk.status, 200)
      assertEquals(bodyOk.status, 'ok')
      assertEquals(bodyOk.shared.status, 'ok')
      const okChecks = Object.values(bodyOk.shared.checks) as boolean[]
      assert(
        okChecks.length > 0,
        'expected the auto-initialized connector to appear as a check',
      )
      assert(okChecks.every(Boolean))

      connectorState.healthy = false
      const readyBad = await fetch(`${base}/ready`)
      const bodyBad = await readyBad.json()
      assertEquals(readyBad.status, 503)
      assertEquals(bodyBad.status, 'degraded')
      assertEquals(bodyBad.shared.status, 'degraded')
      const badChecks = Object.values(bodyBad.shared.checks) as boolean[]
      assert(badChecks.some((value) => value === false))

      // Liveness never depends on the connector, by design — always cheap, always 200.
      connectorState.healthy = false
      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
      assertEquals(await health.json(), { status: 'ok' })
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
