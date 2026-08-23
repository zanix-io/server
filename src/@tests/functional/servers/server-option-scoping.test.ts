import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import Program from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert'

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
