import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import Program from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert'

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
