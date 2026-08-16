import { bootstrapServers } from 'webserver/mod.ts'
import { assertEquals, assertRejects } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')
stub(console, 'warn')

Deno.test(
  'health: never starts a listener on its own — an Application with zero real routes stays fully unserved even with health enabled',
  async () => {
    const servers = await bootstrapServers({
      rest: { port: 4499, application: 'health-no-content-totally-empty' },
      health: true,
    })

    assertEquals(servers.length, 0)

    // Connection refused (TypeError) — nothing is listening on this port at all.
    await assertRejects(() => fetch('http://localhost:4499/health'), TypeError)
  },
)
