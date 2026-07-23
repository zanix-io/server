import { assertEquals } from '@std/assert/assert-equals'
import { bootstrapServers } from 'modules/webserver/mod.ts'

Deno.test('bootstrapServers: returns no servers when nothing is registered to serve', async () => {
  const servers = await bootstrapServers()
  assertEquals(servers, [])
})
