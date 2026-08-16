import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test(
  'health: custom path/readyPath move the endpoints, custom checks merge in and drive the 503',
  async () => {
    await import('./fixtures/health-custom.fixture.ts')

    const servers = await bootstrapServers({
      rest: { port: 4403, application: 'health-custom' },
      health: {
        path: '/healthz',
        readyPath: '/readyz',
        checks: {
          alwaysOk: () => true,
          alwaysFailing: () => false,
        },
      },
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      // Default paths are no longer registered once custom ones are configured.
      const defaultHealth = await fetch(`${base}/health`)
      assertEquals(defaultHealth.status, 404)
      await defaultHealth.body?.cancel()
      const defaultReady = await fetch(`${base}/ready`)
      assertEquals(defaultReady.status, 404)
      await defaultReady.body?.cancel()

      const healthz = await fetch(`${base}/healthz`)
      assertEquals(healthz.status, 200)
      assertEquals(await healthz.json(), { status: 'ok' })

      const readyz = await fetch(`${base}/readyz`)
      assertEquals(readyz.status, 503)
      assertEquals(await readyz.json(), {
        status: 'degraded',
        shared: { status: 'ok', checks: {} },
        apps: {
          'health-custom': {
            status: 'degraded',
            checks: { alwaysOk: true, alwaysFailing: false },
          },
        },
      })
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
