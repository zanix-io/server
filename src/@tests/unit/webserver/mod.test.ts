import { assertEquals } from '@std/assert/assert-equals'
import { bootstrapServers, webServerManager } from 'modules/webserver/mod.ts'
import Program from 'modules/program/mod.ts'

Deno.test('bootstrapServers: returns no servers when nothing is registered to serve', async () => {
  const servers = await bootstrapServers()
  assertEquals(servers, [])
})

Deno.test('bootstrapServers: a rest route is only served by a matching isInternal', async () => {
  Program.routes.resetContainer()
  Program.routes.defineRoute('rest', {
    path: '/internal-admin-only',
    handler: () => 'ok' as never,
  }, true)

  const publicServers = await bootstrapServers({ rest: { port: 1297 } })
  assertEquals(publicServers, [])

  const internalServers = await bootstrapServers({
    rest: { isInternal: true, port: 1296 },
  })
  assertEquals(internalServers.length, 1)

  await webServerManager.stop(internalServers)
})
