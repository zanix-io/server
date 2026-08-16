import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test(
  'health defaults: a plain REST app gets /health and /ready automatically, alongside its own real route',
  async () => {
    await import('./fixtures/health-defaults.fixture.ts')

    const servers = await bootstrapServers({
      rest: { port: 4401, application: 'health-defaults' },
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
      assertEquals(await health.json(), { status: 'ok' })

      const ready = await fetch(`${base}/ready`)
      assertEquals(ready.status, 200)
      assertEquals(await ready.json(), {
        status: 'ok',
        shared: { status: 'ok', checks: {} },
        apps: { 'health-defaults': { status: 'ok', checks: {} } },
      })

      const orders = await fetch(`${base}/api/orders`)
      assertEquals(orders.status, 200)
      assertEquals(await orders.json(), { orders: [] })
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
