import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * End-to-end regression coverage for a confirmed bug: `corsGuard`'s preflight short-circuit used
 * to return a `Response` carrying only `Access-Control-Max-Age`, discarding the
 * `Access-Control-Allow-Origin`/`-Allow-Methods`/`-Allow-Headers` a real browser reads on the
 * preflight response itself before ever sending the real request that follows it. This drives a
 * genuine `fetch()` `OPTIONS` request through a real, bootstrapped REST server — not just calling
 * `corsGuard` directly — the same shape a browser's own preflight takes, configured the way a real
 * consumer (a cross-origin file upload needing `Authorization`/a custom header past the plain
 * `Content-Type` default) would.
 */
Deno.test(
  'CORS preflight: a real OPTIONS request against a live server gets back the same ' +
    'Access-Control-Allow-* headers a passing request would, not only Access-Control-Max-Age',
  async () => {
    await import('./fixtures/head-fallback.fixture.ts')

    const servers = await bootstrapServers({
      rest: {
        port: 4424,
        application: 'head-fallback',
        cors: {
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Znx-Asset-Filename'],
          preflight: { optionsSuccessStatus: 204, maxAge: 600 },
        },
      },
    })

    try {
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}/api`

      const preflight = await fetch(`${base}/items`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://consumer.example' },
      })
      await preflight.body?.cancel()

      assertEquals(preflight.status, 204)
      assertEquals(
        preflight.headers.get('access-control-allow-headers'),
        'Content-Type, Authorization, X-Znx-Asset-Filename',
      )
      assertEquals(
        preflight.headers.get('access-control-allow-methods'),
        'GET, POST, PUT, PATCH, DELETE',
      )
      assertEquals(preflight.headers.get('access-control-allow-origin'), '*')
      assertEquals(preflight.headers.get('access-control-max-age'), '600')

      // The real request that would follow this preflight in a browser still works normally —
      // this fix only changes what the PREFLIGHT response itself carries.
      const real = await fetch(`${base}/items`, { headers: { Origin: 'https://consumer.example' } })
      assertEquals(real.status, 200)
      assertEquals(real.headers.get('access-control-allow-origin'), '*')
      await real.body?.cancel()
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
