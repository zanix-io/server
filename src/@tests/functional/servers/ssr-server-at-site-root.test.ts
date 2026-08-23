import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import Program from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert'

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
