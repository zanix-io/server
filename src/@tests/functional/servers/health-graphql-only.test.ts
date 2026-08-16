import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

Deno.test(
  'health: a GraphQL-only server (no REST configured at all) still gets /health and /ready, on the same port as /graphql',
  async () => {
    await import('./fixtures/health-graphql-only.fixture.ts')

    const servers = await bootstrapServers({
      graphql: { port: 4404, application: 'health-graphql-only' },
    })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the GraphQL server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 200)
      assertEquals(await health.json(), { status: 'ok' })

      const ready = await fetch(`${base}/ready`)
      assertEquals(ready.status, 200)
      assertEquals(await ready.json(), {
        status: 'ok',
        shared: { status: 'ok', checks: {} },
        apps: { 'health-graphql-only': { status: 'ok', checks: {} } },
      })

      const graphqlRes = await fetch(`${base}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ probe }' }),
      })
      assertEquals(graphqlRes.status, 200)
      assertEquals(await graphqlRes.json(), {
        data: { probe: 'probe response' },
      })
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
