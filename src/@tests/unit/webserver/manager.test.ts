import { assert, assertEquals } from '@std/assert'
import { WebServerManager } from 'modules/webserver/manager.ts'

Deno.test('WebServerManager.delete: removes multiple servers when given an array of ids', () => {
  const manager = new WebServerManager()

  const id1 = manager.create('rest', { handler: (() => new Response('ok')) as never })
  const id2 = manager.create('rest', { handler: (() => new Response('ok')) as never })

  const result = manager.delete([id1, id2])

  assert(result)
  assertEquals(manager.info(id1).addr, undefined)
  assertEquals(manager.info(id2).addr, undefined)
})

Deno.test('WebServerManager.create: reuses the existing server when called with a known id', () => {
  const manager = new WebServerManager()

  const id = manager.create('rest', { handler: (() => new Response('ok')) as never })
  const sameId = manager.create('socket', { handler: (() => new Response('ok')) as never }, id)

  assertEquals(sameId, id)
  // The second call was a no-op: the server registered under `id` is still the 'rest' one.
  assertEquals(manager.info(id).type, 'rest')
})
