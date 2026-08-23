import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import Program from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert'

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
