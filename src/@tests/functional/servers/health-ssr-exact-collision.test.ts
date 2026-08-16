import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * A real SSR page whose own literal path is exactly `/health` is a genuine override, and wins —
 * detected by checking `ProgramModule.routes` for a route registered under THIS Application at the
 * exact resolved path, gated to only the genuinely unprefixed/unanchored case (`dispatchKey ===
 * ''`) where a controller's own `path` really is the final reachable URL — see
 * `WebServerManager.create`'s own doc for why that gate matters (a prefixed/anchored server's real
 * routes are never reachable at the bare path regardless of what a controller declares, so the
 * lookup would risk a false-positive skip there).
 */
Deno.test(
  'health: a real SSR page at the exact literal path /health wins over the framework default',
  async () => {
    await import('./fixtures/health-ssr-exact-collision.fixture.ts')

    const servers = await bootstrapServers({
      ssr: { port: 4409, application: 'health-ssr-exact-collision' },
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the SSR server should be listening')

      const res = await fetch(`http://${addr.hostname}:${addr.port}/health`)
      assertEquals(res.status, 200)
      assertEquals(
        await res.text(),
        '<html>a real page someone built at /health</html>',
      )
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
