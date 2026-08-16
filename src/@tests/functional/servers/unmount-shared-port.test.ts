import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

/**
 * Real hot-uninstall scenario: two ANCHORED Applications sharing one real `Deno.serve()` listener
 * (same setup `shared-port.test.ts` already proves works for ordinary requests) — `unmount()` must
 * strip only ONE of them from the shared `HandlerBox`, without touching the real socket the OTHER
 * one still depends on.
 */
Deno.test(
  "WebServerManager.unmount: hot-removes one Application's dispatch entry from a shared port, " +
    'leaving the OTHER Application on that same port fully reachable',
  async () => {
    const SHARED_PORT = 4331
    let idA: ServerID | undefined
    let idB: ServerID | undefined

    try {
      await ProgramModule.applications.define('hot-unmount-app-a', () => {
        @Controller()
        class _HotUnmountAppAController extends ZanixController {
          @Get('hello')
          public hello() {
            return 'a response'
          }
        }
      })
      await ProgramModule.applications.define('hot-unmount-app-b', () => {
        @Controller()
        class _HotUnmountAppBController extends ZanixController {
          @Get('hello')
          public hello() {
            return 'b response'
          }
        }
      })

      await bootstrapServers({
        rest: {
          application: 'hot-unmount-app-a',
          id: 'hot-unmount-app-a',
          port: SHARED_PORT,
          onCreate: (id) => {
            idA = id
          },
        },
      }, { finalize: false })

      await bootstrapServers({
        rest: {
          application: 'hot-unmount-app-b',
          id: 'hot-unmount-app-b',
          port: SHARED_PORT,
          onCreate: (id) => {
            idB = id
          },
        },
      })

      assert(idA, 'app-a server should have been created')
      assert(idB, 'app-b server should have been created')

      const addr = webServerManager.info(idA as ServerID).addr
      assert(addr, 'the shared listener should be bound')
      const base = `http://${addr?.hostname}:${addr?.port}`

      const beforeA = await fetch(`${base}/${idA}/hello`)
      assertEquals(beforeA.status, 200)
      await beforeA.body?.cancel()
      const beforeB = await fetch(`${base}/${idB}/hello`)
      assertEquals(beforeB.status, 200)
      await beforeB.body?.cancel()

      webServerManager.unmount(idA as ServerID)

      const afterA = await fetch(`${base}/${idA}/hello`)
      assertEquals(
        afterA.status,
        404,
        'the unmounted Application must no longer be reachable',
      )
      await afterA.body?.cancel()

      const afterB = await fetch(`${base}/${idB}/hello`)
      assertEquals(
        afterB.status,
        200,
        'the OTHER Application sharing the real listener must be completely unaffected',
      )
      await afterB.body?.cancel()
    } finally {
      const ids = [idA, idB].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
