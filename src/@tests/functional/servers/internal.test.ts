import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assertSpyCalls, stub } from '@std/testing/mock'
import { assert } from '@std/assert'
import logger from '@zanix/logger'

stub(console, 'info')
const consoleInfo = stub(logger, 'info')

Deno.test('Start module should init internal servers', async () => {
  await new Promise((resolve) => setTimeout(resolve, 500))
  await import('../setup/metadata.ts')
  const servers: ServerID[] = []

  const onCreate = (id: ServerID) => {
    servers.push(id)
  }
  const isInternal = true

  await bootstrapServers(
    {
      rest: { onCreate, isInternal, port: 1234 },
      graphql: { onCreate, isInternal, port: 1235 },
      socket: { onCreate, isInternal, port: 1236 },
    },
  )

  assert(servers.length === 3)
  for (const server of servers) {
    assert(webServerManager.info(server as never).addr)
  }

  assertSpyCalls(consoleInfo, 6) // routes quentity

  // Assert resetTargets called with argument
  for (let call = 0; call < consoleInfo.calls.length; call++) {
    assert(servers.some((id) => consoleInfo.calls[call].args[1].startsWith(`/${id}`)))
  }

  await webServerManager.stop(servers)
})
