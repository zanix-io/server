import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

Deno.test(
  'anchored GraphQL server: globalPrefix lands the single POST endpoint at {id}/{globalPrefix}, not duplicated or malformed',
  async () => {
    const PORT = 4503

    await import('./fixtures/graphql-global-prefix.fixture.ts')

    const [id] = await bootstrapServers({
      graphql: {
        application: 'admin',
        id: 'graphql-globalprefix-anchor',
        port: PORT,
        globalPrefix: 'ops',
      },
    })

    try {
      assert(id, 'internal GraphQL server should have been created')
      const addr = webServerManager.info(id).addr
      assert(addr, 'internal GraphQL server should be listening')

      const combinedRes = await fetch(`http://${addr.hostname}:${addr.port}/${id}/ops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ globalprefixprobe }' }),
      })
      assertEquals(await combinedRes.json(), { data: { globalprefixprobe: 'probe response' } })

      // The bare {id} path (no globalPrefix segment) no longer matches once globalPrefix is set.
      const bareRes = await fetch(`http://${addr.hostname}:${addr.port}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ globalprefixprobe }' }),
      })
      assertEquals(bareRes.status, 404)
      await bareRes.body?.cancel()
    } finally {
      await webServerManager.stop(id)
    }
  },
)
