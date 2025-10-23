import { assert } from '@std/assert'
import './setup/metadata.ts'
import { bootstrapServers, type ServerID, webServerManager } from '@zanix/server'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test('Start module should init some servers', async () => {
  const servers: ServerID[] = []
  const onCreate = (id: ServerID) => {
    servers.push(id)
  }
  await bootstrapServers(
    {
      rest: { onCreate },
      graphql: { onCreate },
      socket: { onCreate },
    },
  )

  assert(servers.length === 3)
  for (const server of servers) assert(webServerManager.info(server as never).addr)

  webServerManager.stop(servers)
})
