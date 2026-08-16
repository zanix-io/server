import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

/**
 * Regression for a real bug: a port's `HandlerBox` map entry got deleted the moment a SECOND server
 * reused an already-bound port, so a THIRD server sharing that same port built its own dispatch
 * table into a brand-new, disconnected box the running listener never saw — it reported the correct
 * `addr` (copied from whichever server actually bound the socket) while every one of its own routes
 * 404'd. `shared-port.test.ts` only ever exercises two servers, so it never caught this — this test
 * is the first to exercise three, the real-world shape (a business app's own server + its embedded
 * `admin` server + `ZanixAdminHub`'s own server, all reusing one Heroku-style port).
 */
Deno.test(
  'shared port: three servers (two anchored, one unanchored) on the SAME port all serve their own routes',
  async () => {
    const SHARED_PORT = 4322
    let anchoredId: ServerID | undefined
    let thirdId: ServerID | undefined
    let unanchoredId: ServerID | undefined

    try {
      await import('./fixtures/shared-port-anchored.fixture.ts')
      await import('./fixtures/shared-port-third.fixture.ts')
      await import('./fixtures/shared-port-unanchored.fixture.ts')

      await bootstrapServers({
        rest: {
          application: 'admin',
          id: 'shared-port-anchor',
          port: SHARED_PORT,
          onCreate: (id) => {
            anchoredId = id
          },
        },
      }, { finalize: false })

      await bootstrapServers({
        rest: {
          application: 'admin-hub',
          id: 'shared-port-third',
          port: SHARED_PORT,
          onCreate: (id) => {
            thirdId = id
          },
        },
      }, { finalize: false })

      await bootstrapServers({
        rest: {
          port: SHARED_PORT,
          onCreate: (id) => {
            unanchoredId = id
          },
        },
      })

      assert(anchoredId, 'first anchored server should have been created')
      assert(thirdId, 'second anchored server should have been created')
      assert(unanchoredId, 'unanchored server should have been created')

      const anchoredAddr = webServerManager.info(anchoredId as ServerID).addr
      const thirdAddr = webServerManager.info(thirdId as ServerID).addr
      const unanchoredAddr = webServerManager.info(unanchoredId as ServerID).addr
      assert(anchoredAddr, 'first anchored server should be listening')
      assert(thirdAddr, 'second anchored server should be listening')
      assert(unanchoredAddr, 'unanchored server should be listening')
      assertEquals(anchoredAddr?.port, SHARED_PORT)
      assertEquals(thirdAddr?.port, SHARED_PORT)
      assertEquals(unanchoredAddr?.port, SHARED_PORT)

      const unanchoredRes = await fetch(
        `http://${unanchoredAddr?.hostname}:${SHARED_PORT}/api/hello`,
      )
      assertEquals(unanchoredRes.status, 200)
      await unanchoredRes.body?.cancel()

      const anchoredRes = await fetch(
        `http://${anchoredAddr?.hostname}:${SHARED_PORT}/shared-port-anchor/anchored-hello`,
      )
      assertEquals(anchoredRes.status, 200)
      await anchoredRes.body?.cancel()

      // The one this bug broke: the THIRD server's own route, on the same shared port.
      const thirdRes = await fetch(
        `http://${thirdAddr?.hostname}:${SHARED_PORT}/shared-port-third/third-hello`,
      )
      assertEquals(thirdRes.status, 200)
      await thirdRes.body?.cancel()
    } finally {
      const ids = [anchoredId, thirdId, unanchoredId].filter(
        Boolean,
      ) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
