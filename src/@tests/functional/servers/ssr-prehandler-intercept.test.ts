import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import Program from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert'

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
