import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

// Regression for the additive `globalPrefix` change: two anchored REST servers sharing one port,
// with different `serverID`s, one of them given a custom `globalPrefix` — proves the multiplexer's
// dispatch key (always the bare `serverID`, never combined with `globalPrefix`) still cleanly
// separates them, even though their own route tables are built with different prefixes.
Deno.test(
  'shared port: two anchored REST servers (one with a custom globalPrefix) on the SAME port still dispatch to their own routes only',
  async () => {
    const SHARED_PORT = 4504
    let noPrefixId: ServerID | undefined
    let withPrefixId: ServerID | undefined

    try {
      await import('./fixtures/anchored-global-prefix.fixture.ts')

      // 1. No globalPrefix — not the last call of this sequence.
      noPrefixId = (await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'shared-no-prefix-anchor',
          port: SHARED_PORT,
        },
      }, { finalize: false }))[0]

      // 2. Same port, custom globalPrefix, different (explicit) serverID — the sequence's
      // last call, finalizes as usual.
      withPrefixId = (await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'shared-with-prefix-anchor',
          port: SHARED_PORT,
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
      assert(
        noPrefixId !== withPrefixId,
        'the two servers must have distinct ids',
      )

      const addr = webServerManager.info(noPrefixId).addr
      assert(addr, 'the shared listener should be up')
      assertEquals(
        `${addr.hostname}:${addr.port}`,
        `${webServerManager.info(withPrefixId).addr?.hostname}:${
          webServerManager.info(withPrefixId).addr?.port
        }`,
        'both servers should report the same address — one real listener, not two',
      )

      // Each server only serves its own combined prefix.
      const noPrefixRes = await fetch(
        `http://${addr.hostname}:${addr.port}/${noPrefixId}/probe`,
      )
      assertEquals(noPrefixRes.status, 200)
      await noPrefixRes.body?.cancel()

      const withPrefixRes = await fetch(
        `http://${addr.hostname}:${addr.port}/${withPrefixId}/ops/probe`,
      )
      assertEquals(withPrefixRes.status, 200)
      await withPrefixRes.body?.cancel()

      // Cross-checks: neither server's own dispatch key answers for the OTHER's expected path.
      const crossNoPrefix = await fetch(
        `http://${addr.hostname}:${addr.port}/${noPrefixId}/ops/probe`,
      )
      assertEquals(crossNoPrefix.status, 404)
      await crossNoPrefix.body?.cancel()

      const crossWithPrefix = await fetch(
        `http://${addr.hostname}:${addr.port}/${withPrefixId}/probe`,
      )
      assertEquals(crossWithPrefix.status, 404)
      await crossWithPrefix.body?.cancel()
    } finally {
      const ids = [noPrefixId, withPrefixId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
