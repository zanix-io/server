import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test(
  'health: a socket-only server (no REST configured at all) still gets /health and /ready',
  async () => {
    await import('./fixtures/health-socket-only.fixture.ts')

    const servers = await bootstrapServers({
      socket: { port: 4405, application: 'health-socket-only' },
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the socket server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
      assertEquals(await health.json(), { status: 'ok' })

      const ready = await fetch(`${base}/ready`)
      assertEquals(ready.status, 200)
      assertEquals(await ready.json(), {
        status: 'ok',
        shared: { status: 'ok', checks: {} },
        apps: { 'health-socket-only': { status: 'ok', checks: {} } },
      })
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
