import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * End-to-end coverage for `HEAD` requests against a `Get()`-only route: there's no `Head()`
 * decorator, so route lookup falls back from an unmatched `HEAD` entry to its route's own `GET`
 * entry (`getMainHandler`, `webserver/helpers/handler.ts`), and `corsGuard`'s own default
 * `allowedMethods` (`GET, POST, PUT, PATCH, DELETE`) implicitly allows `HEAD` whenever `GET` is
 * allowed (`cors.guard.ts`) rather than rejecting it before the handler ever runs. `HEAD` is never
 * registered as its own route — it always falls back to its route's `GET` entry, body stripped,
 * headers intact. All three sub-cases share one bootstrapped server (a real, single
 * `bootstrapServers()` call for the whole fixture Application) since `WebServerManager.create()`
 * reuses an already-registered server id — a second `bootstrapServers()` call for the same
 * Application would silently reuse (already-stopped) state instead of creating a fresh listener.
 */
Deno.test(
  'HEAD: a Get()-only route responds like its GET counterpart, minus the body, and a real method mismatch still 405s',
  async () => {
    await import('./fixtures/head-fallback.fixture.ts')

    const servers = await bootstrapServers({
      rest: { port: 4423, application: 'head-fallback' },
    })

    try {
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}/api`

      // Absolute route (`/items`).
      {
        const getRes = await fetch(`${base}/items`)
        const getBody = await getRes.text()
        assertEquals(getRes.status, 200)
        assertEquals(getBody, JSON.stringify({ items: [1, 2, 3] }))

        const headRes = await fetch(`${base}/items`, { method: 'HEAD' })
        const headBody = await headRes.text()

        // The GET fallback resolves the request to 200, never 405.
        assertEquals(headRes.status, 200)
        assertEquals(headBody, '')
        // Every header GET sent — including `Content-Length`, computed from the SAME bytes GET's
        // own body has, even though HEAD's own wire body is empty — survives identically.
        assertEquals(headRes.headers.get('content-type'), getRes.headers.get('content-type'))
        assertEquals(headRes.headers.get('x-fixture'), getRes.headers.get('x-fixture'))
        assertEquals(headRes.headers.get('content-length'), getRes.headers.get('content-length'))
        assertEquals(headRes.headers.get('content-length'), String(getBody.length))
      }

      // `:param` (relative-bucket) route (`/items/:id`) — exercises `relativeByMethod`'s own `GET`
      // fallback, not just the absolute-path one above.
      {
        const getRes = await fetch(`${base}/items/42`)
        const getBody = await getRes.text()
        assertEquals(getRes.status, 200)
        assertEquals(getBody, JSON.stringify({ id: '42' }))

        const headRes = await fetch(`${base}/items/42`, { method: 'HEAD' })
        const headBody = await headRes.text()
        assertEquals(headRes.status, 200)
        assertEquals(headBody, '')
        assertEquals(headRes.headers.get('content-length'), getRes.headers.get('content-length'))
      }

      // `POST`-only route (`/orders`) — no `GET` registered at this exact path at all, so `HEAD`
      // here must still 405. The fallback never masks a real method mismatch.
      {
        const headRes = await fetch(`${base}/orders`, { method: 'HEAD' })
        await headRes.body?.cancel()
        assertEquals(headRes.status, 405)
      }
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
