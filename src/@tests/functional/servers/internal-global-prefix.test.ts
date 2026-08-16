import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

Deno.test(
  'anchored server: an explicit globalPrefix is additive ({id}/{globalPrefix}/...), omitting it keeps the bare {id}/... path unchanged',
  async () => {
    const NO_PREFIX_PORT = 4501
    const WITH_PREFIX_PORT = 4502
    let noPrefixId: ServerID | undefined
    let withPrefixId: ServerID | undefined

    try {
      await import('./fixtures/anchored-global-prefix.fixture.ts')

      // 1. No globalPrefix — not the last call of this sequence, so it must not finalize.
      noPrefixId = (await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'no-prefix-anchor',
          port: NO_PREFIX_PORT,
        },
      }, { finalize: false }))[0]

      // 2. With globalPrefix — the sequence's last call, finalizes as usual.
      withPrefixId = (await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'with-prefix-anchor',
          port: WITH_PREFIX_PORT,
          globalPrefix: 'ops',
        },
      }))[0]

      assert(
        noPrefixId,
        'no-globalPrefix anchored server should have been created',
      )
      assert(
        withPrefixId,
        'with-globalPrefix anchored server should have been created',
      )

      const noPrefixAddr = webServerManager.info(noPrefixId).addr
      const withPrefixAddr = webServerManager.info(withPrefixId).addr
      assert(noPrefixAddr, 'no-globalPrefix server should be listening')
      assert(withPrefixAddr, 'with-globalPrefix server should be listening')

      // Unchanged from before this feature existed: bare {id}/probe still works with no globalPrefix.
      const bareRes = await fetch(
        `http://${noPrefixAddr.hostname}:${noPrefixAddr.port}/${noPrefixId}/probe`,
      )
      assertEquals(bareRes.status, 200)
      await bareRes.body?.cancel()

      // Additive: globalPrefix is an extra segment after the id, not a replacement.
      const combinedRes = await fetch(
        `http://${withPrefixAddr.hostname}:${withPrefixAddr.port}/${withPrefixId}/ops/probe`,
      )
      assertEquals(combinedRes.status, 200)
      await combinedRes.body?.cancel()

      // The OLD bare path no longer matches once a globalPrefix is configured — proves additive,
      // not "both reachable at once."
      const staleRes = await fetch(
        `http://${withPrefixAddr.hostname}:${withPrefixAddr.port}/${withPrefixId}/probe`,
      )
      assertEquals(staleRes.status, 404)
      await staleRes.body?.cancel()
    } finally {
      const ids = [noPrefixId, withPrefixId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
