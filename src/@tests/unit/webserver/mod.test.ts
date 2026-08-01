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
