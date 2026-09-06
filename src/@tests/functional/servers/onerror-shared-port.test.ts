import type { ServerID } from 'typings/server.ts'

import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert, assertEquals } from '@std/assert'

stub(console, 'info')

/**
 * Regression coverage: when two registrations share a port, only the first to bind `Deno.serve()`
 * used to have its `onError` actually applied — every later registration's own `onError` was
 * silently discarded regardless of which one's handler threw. `WebServerManager.create()` now
 * wraps each registration's own dispatch entry with its own `onError` before storing it.
 *
 * Same registration order as `shared-port.test.ts` (`finalize: false` then a default second call):
 * the first registration here has no `onError` and ends up binding the port; the second has a
 * custom `onError` on a route whose `@Guard` always throws.
 */
Deno.test(
  'shared port: a server registered AFTER another on the same port still gets its own onError ' +
    "for its own thrown errors — not silently discarded to the first-bound server's (default) one",
  async () => {
    const SHARED_PORT = 4322
    let firstId: ServerID | undefined
    let secondId: ServerID | undefined
    let customErrorHandlerCalls = 0

    try {
      await import('./fixtures/shared-port-onerror-first.fixture.ts')
      await import('./fixtures/shared-port-onerror-second.fixture.ts')

      // 1. First registration, no onError of its own — binds the real Deno.serve() listener.
      await bootstrapServers({
        rest: {
          application: 'onerror-first',
          id: 'onerror-first',
          port: SHARED_PORT,
          onCreate: (id) => {
            firstId = id
          },
        },
      }, { finalize: false })

      // 2. Second registration, WITH its own onError — reuses the listener the first call bound.
      await bootstrapServers({
        rest: {
          application: 'onerror-second',
          id: 'onerror-second',
          port: SHARED_PORT,
          onError: () => {
            customErrorHandlerCalls++
            return new Response('custom-handled', { status: 418 })
          },
          onCreate: (id) => {
            secondId = id
          },
        },
      })

      assert(firstId, 'first server should have been created')
      assert(secondId, 'second server should have been created')

      const addr = webServerManager.info(secondId as ServerID).addr
      assert(addr, 'second server should report a real, shared address')

      // The first server's own route still works, unaffected by the second server's own onError.
      const firstRes = await fetch(
        `http://${addr?.hostname}:${addr?.port}/${firstId}/ok`,
      )
      assertEquals(firstRes.status, 200)
      await firstRes.body?.cancel()

      // The second server's own guard-throw must be handled by ITS OWN onError — not the first
      // server's default one (a bare INTERNAL_ERROR/UNAUTHORIZED JSON body, never status 418).
      const secondRes = await fetch(
        `http://${addr?.hostname}:${addr?.port}/${secondId}/protected`,
      )
      assertEquals(secondRes.status, 418)
      assertEquals(await secondRes.text(), 'custom-handled')
      assertEquals(customErrorHandlerCalls, 1)
    } finally {
      const ids = [firstId, secondId].filter(Boolean) as ServerID[]
      if (ids.length) await webServerManager.stop(ids)
    }
  },
)
