import { webServerManager } from 'webserver/mod.ts'
import { compileRuntime } from 'modules/webserver/runtime.ts'
import { resolveHealthOptions } from 'modules/webserver/health.ts'
import ProgramModule from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * The more common real-world case of the same fix `health-ssr-exact-collision.test.ts` covers for
 * SSR: a real REST route (registered via `ProgramModule.routes` — same low-level escape hatch
 * `getMainHandler`'s own GraphQL branch and every `@Controller` decorator ultimately funnel
 * through) at the exact literal `/health` path, on a genuinely unprefixed dispatch (`dispatchKey
 * === ''`). Reached via `webServerManager.create()` directly, not `bootstrapServers()`: REST's own
 * `bootstrapServerType` always passes `defaultPrefix: 'api'`, and `resolveGlobalPrefix`'s
 * `configured || fallback` treats an explicit `globalPrefix: ''` as "not configured" (empty string
 * is falsy) — so REST can never actually reach `dispatchKey === ''` through the public per-type
 * option, only through this lower-level, still-public API (the same one `bootstrapServers()`
 * itself calls into). A prefixed REST server (the default) never hits this at all — its own routes
 * are never reachable at the bare `/health` regardless of what's registered, so there's nothing to
 * override there.
 */
Deno.test(
  'health: a real REST route at the exact literal path /health, on a genuinely unprefixed dispatch, wins over the framework default',
  async () => {
    ProgramModule.routes.defineRoute('rest', {
      path: '/health',
      handler: () =>
        new Response(
          JSON.stringify({ status: 'custom', from: 'a real consumer route' }),
          {
            headers: { 'content-type': 'application/json' },
          },
        ) as never,
    })

    const runtime = compileRuntime('rest', { globalPrefix: undefined })
    const health = resolveHealthOptions(true)
    const id = webServerManager.create(
      'rest',
      { server: { port: 4410 } },
      runtime,
      health,
    )
    webServerManager.start(id)

    try {
      const addr = webServerManager.info(id).addr
      const res = await fetch(`http://${addr?.hostname}:${addr?.port}/health`)
      assertEquals(res.status, 200)
      assertEquals(await res.json(), {
        status: 'custom',
        from: 'a real consumer route',
      })
    } finally {
      await webServerManager.stop(id)
    }
  },
)
