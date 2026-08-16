import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * Verifies health rides safely on SSR's own unprefixed, catch-all (`''`-keyed) dispatch — the one
 * type the original design deferred until this was checked empirically (see `bootstrapServersImpl`'s
 * own `ssr` call site doc). A real SSR page still resolves at its own root path; a different real
 * SSR page whose own literal path happens to be adjacent (`/healthz-page`, not `/health`) is
 * unaffected — confirms the multiplexer's exact-key-wins-over-catch-all rule, not something SSR-
 * specific.
 */
Deno.test(
  'health: an SSR-only server (no rest/graphql/socket at all) still gets /health and /ready, alongside its own root-path pages',
  async () => {
    await import('./fixtures/health-ssr-only.fixture.ts')

    const servers = await bootstrapServers({
      ssr: { port: 4408, application: 'health-ssr-only' },
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the SSR server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
      assertEquals(await health.json(), { status: 'ok' })

      const ready = await fetch(`${base}/ready`)
      assertEquals(ready.status, 200)
      assertEquals(await ready.json(), {
        status: 'ok',
        shared: { status: 'ok', checks: {} },
        apps: { 'health-ssr-only': { status: 'ok', checks: {} } },
      })

      const page = await fetch(`${base}/products/42`)
      assertEquals(page.status, 200)
      assertEquals(await page.text(), '<html>ssr page</html>')
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
