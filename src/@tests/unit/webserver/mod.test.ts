import { assertEquals } from '@std/assert/assert-equals'
import { bootstrapServers, webServerManager } from 'modules/webserver/mod.ts'
import Program from 'modules/program/mod.ts'

Deno.test('bootstrapServers: returns no servers when nothing is registered to serve', async () => {
  const servers = await bootstrapServers()
  assertEquals(servers, [])
})

Deno.test('bootstrapServers: a rest route is only served by a matching Application', async () => {
  Program.routes.resetContainer()
  Program.routes.defineRoute('rest', {
    path: '/admin-only',
    handler: () => 'ok' as never,
  }, 'admin')

  const defaultServers = await bootstrapServers({ rest: { port: 1297 } })
  assertEquals(defaultServers, [])

  const adminServers = await bootstrapServers({
    rest: { application: 'admin', port: 1296 },
  })
  assertEquals(adminServers.length, 1)

  await webServerManager.stop(adminServers)
})

Deno.test('bootstrapServers: forwards an explicit `id` to a server', async () => {
  Program.routes.resetContainer()
  Program.routes.defineRoute('rest', {
    path: '/admin-only',
    handler: () => 'ok' as never,
  }, 'admin')

  const adminServers = await bootstrapServers({
    rest: { application: 'admin', port: 1298, id: 'custom-admin' },
  })

  assertEquals(adminServers, ['custom-admin'])

  await webServerManager.stop(adminServers)
})

Deno.test(
  'bootstrapServers: a type not named in `server` never auto-starts, even with routes registered',
  async () => {
    // Regression: `serve.socket` used to turn `true` purely from `hasRoutesForScope`, regardless
    // of whether the caller's `server` object ever mentioned `socket` at all — a decorator's
    // import-time registration for a totally unrelated concern (e.g. `@zanix/space`'s dev-only
    // `SpaceDevSocket`) could silently start an extra, unrequested server this way.
    Program.routes.resetContainer()
    Program.routes.defineRoute('rest', {
      path: '/some-rest-route',
      handler: () => 'ok' as never,
    })
    Program.routes.defineRoute('ssr', {
      path: '/some-ssr-route',
      handler: () => new Response('<html></html>') as never,
    })

    // `server` explicitly names ONLY `ssr` — `rest` has a real route too, but was never named.
    const servers = await bootstrapServers({ ssr: { port: 1300 } })
    assertEquals(servers.length, 1)

    await webServerManager.stop(servers)
  },
)

Deno.test(
  'bootstrapServers: omitting `server` entirely still auto-discovers everything registered',
  async () => {
    // The other half of the same fix: unlike naming SOME types explicitly (above), naming NONE
    // at all (a bare `bootstrapServers()`/`bootstrapServers(undefined)` call) must keep
    // auto-discovering from whatever's registered — `@zanix/core`'s own top-level
    // `bootstrapServers(options.server)` call relies on exactly this when a `Zanix.bootstrap()`
    // caller never passes its own `server` option.
    Program.routes.resetContainer()
    Program.routes.defineRoute('rest', {
      path: '/auto-discovered',
      handler: () => 'ok' as never,
    })

    const servers = await bootstrapServers()
    assertEquals(servers.length, 1)

    await webServerManager.stop(servers)
  },
)

Deno.test(
  'bootstrapServers: preHandler intercepts before route dispatch, and falls through on null',
  async () => {
    Program.routes.resetContainer()
    Program.routes.defineRoute('ssr', {
      path: '/products/:id',
      handler: () =>
        new Response('<html></html>', {
          headers: { 'content-type': 'text/html' },
        }) as never,
    })

    const servers = await bootstrapServers({
      ssr: {
        port: 1301,
        preHandler: (req) => {
          const url = new URL(req.url)
          if (url.pathname === '/@vite/client') {
            return new Response('/* dev asset */')
          }
          return null
        },
      },
    })

    try {
      const devAssetRes = await fetch('http://localhost:1301/@vite/client')
      assertEquals(devAssetRes.status, 200)
      assertEquals(await devAssetRes.text(), '/* dev asset */')

      // Never named in preHandler's own condition — falls through to the real SSR route.
      const pageRes = await fetch('http://localhost:1301/products/1')
      assertEquals(pageRes.status, 200)
      await pageRes.body?.cancel()
    } finally {
      await webServerManager.stop(servers)
    }
  },
)

Deno.test('bootstrapServers: an ssr route starts its own server at the site root', async () => {
  Program.routes.resetContainer()
  Program.routes.defineRoute('ssr', {
    path: '/products/:id',
    handler: () =>
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      }) as never,
  })

  const servers = await bootstrapServers({ ssr: { port: 1299 } })
  assertEquals(servers.length, 1)

  const res = await fetch(`http://localhost:1299/products/1`)
  assertEquals(res.status, 200)
  await res.body?.cancel()

  await webServerManager.stop(servers)
})
