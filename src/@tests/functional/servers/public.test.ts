import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'

import { assert } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test('Start module should init some servers', async () => {
  await import('../setup/metadata.ts')
  const servers: ServerID[] = []
  const onCreate = (id: ServerID) => {
    servers.push(id)
  }
  await bootstrapServers(
    {
      rest: {
        onCreate,
        cors: { origins: ['*'], allowedMethods: ['GET', 'POST', 'PUT'] },
      },
      graphql: { onCreate, cors: { origins: ['*'], allowedMethods: ['GET'] } },
      ssr: { onCreate, cors: { origins: ['*'] } },
      socket: { onCreate, cors: { origins: ['*'] } },
    },
  )

  assert(servers.length === 3)
  for (const server of servers) assert(webServerManager.info(server as never).addr)

  await webServerManager.stop(servers)
})
