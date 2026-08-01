import { assert, assertEquals, assertNotEquals, assertThrows } from '@std/assert'
import { WebServerManager } from 'modules/webserver/manager.ts'
import { compileRuntime } from 'modules/webserver/runtime.ts'

console.error = () => {}

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
  const sameId = manager.create(
    'socket',
    { handler: (() => new Response('ok')) as never },
    compileRuntime('socket', { explicitId: id }),
  )

  assertEquals(sameId, id)
  // The second call was a no-op: the server registered under `id` is still the 'rest' one.
  assertEquals(manager.info(id).type, 'rest')
})

Deno.test('WebServerManager.create: an anchored serverID is normalized (case/slash)', () => {
  const manager = new WebServerManager()

  const runtime = compileRuntime('rest', { explicitId: 'Custom-Billing' })
  const id = manager.create('rest', { handler: (() => new Response('ok')) as never }, runtime)

  assertEquals(id, 'custom-billing')
})

Deno.test('WebServerManager.create: rejects an anchored serverID with unsafe chars', () => {
  assertThrows(
    () => compileRuntime('rest', { explicitId: 'custom.billing(evil)' }),
    Error,
    'Invalid anchored server id',
  )
})

Deno.test(
  'WebServerManager.create: with no explicit id, the server is unanchored — its serverID is not used as the route dispatch/prefix key',
  () => {
    // No auto-generated anchored id anymore: omitting `explicitId` means this server is plain and
    // unprefixed, even though `compileRuntime` still gives it a random `serverID` for its own
    // internal bookkeeping (see `WebServerManager`'s `#servers` map).
    const runtime = compileRuntime('rest', {})

    assertNotEquals(runtime.dispatchKey, runtime.serverID)
    assertNotEquals(runtime.routeHandlerPrefix, runtime.serverID)
  },
)

Deno.test(
  'WebServerManager.create: previousId without an explicit id throws (nothing to rotate from)',
  () => {
    assertThrows(
      () => compileRuntime('rest', { previousId: 'old-billing' }),
      Error,
      'to rotate from',
    )
  },
)

Deno.test(
  'WebServerManager.create: previousId (rotation) is rejected for a graphql server',
  () => {
    // A second `getMainHandler` build for the same Application would compile an empty stub schema
    // instead of the real one — `defineSchema` consumes its Query/Mutation accumulator once built
    // — so this is rejected outright rather than silently shipping a broken previous-prefix.
    assertThrows(
      () => compileRuntime('graphql', { explicitId: 'billing', previousId: 'old-billing' }),
      Error,
      "isn't supported for a graphql server",
    )
  },
)
