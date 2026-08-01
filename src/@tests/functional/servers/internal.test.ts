import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assertSpyCalls, stub } from '@std/testing/mock'
import { assert } from '@std/assert'
import logger from '@zanix/logger'

stub(console, 'info')
const consoleInfo = stub(logger, 'info')

Deno.test("Start module should init the 'admin'-Application, anchored servers", async () => {
  await new Promise((resolve) => setTimeout(resolve, 500))
  await import('../setup/metadata.ts')
  const servers: ServerID[] = []

  const onCreate = (id: ServerID) => {
    servers.push(id)
  }
  const application = 'admin'

  await bootstrapServers(
    {
      rest: { onCreate, application, id: 'internal-rest-anchor', port: 1234 },
      graphql: { onCreate, application, id: 'internal-graphql-anchor', port: 1235 },
      socket: { onCreate, application, id: 'internal-socket-anchor', port: 1236 },
    },
  )

  assert(servers.length === 3)
  for (const server of servers) {
    assert(webServerManager.info(server as never).addr)
  }

  assertSpyCalls(consoleInfo, 3) // routes quantity ('admin'-Application fixtures only)

  // Assert some anchored server
  for (let call = 0; call < consoleInfo.calls.length; call++) {
    assert(servers.some((id) => consoleInfo.calls[call].args[1].startsWith(`/${id}`)))
  }

  await webServerManager.stop(servers)
})
