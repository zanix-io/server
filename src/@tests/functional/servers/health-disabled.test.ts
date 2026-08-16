import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test(
  'health: false disables /health and /ready entirely, real routes unaffected',
  async () => {
    await import('./fixtures/health-disabled.fixture.ts')

    const servers = await bootstrapServers({
      rest: { port: 4402, application: 'health-disabled' },
      health: false,
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 404)
      await health.body?.cancel()

      const ready = await fetch(`${base}/ready`)
      assertEquals(ready.status, 404)
      await ready.body?.cancel()

      const orders = await fetch(`${base}/api/orders`)
      assertEquals(orders.status, 200)
      assertEquals(await orders.json(), { orders: [] })
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
