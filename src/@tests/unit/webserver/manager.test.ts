import { assert, assertEquals, assertNotEquals, assertThrows } from '@std/assert'
import { WebServerManager } from 'modules/webserver/manager.ts'
import { compileRuntime } from 'modules/webserver/runtime.ts'
import Program from 'modules/program/mod.ts'

console.error = () => {}

Deno.test('WebServerManager.delete: removes multiple servers when given an array of ids', () => {
  const manager = new WebServerManager()

  const id1 = manager.create('rest', {
    handler: (() => new Response('ok')) as never,
  })
  const id2 = manager.create('rest', {
    handler: (() => new Response('ok')) as never,
  })

  const result = manager.delete([id1, id2])

  assert(result)
  assertEquals(manager.info(id1).addr, undefined)
  assertEquals(manager.info(id2).addr, undefined)
})

Deno.test('WebServerManager.create: reuses the existing server when called with a known id', () => {
  const manager = new WebServerManager()

  const id = manager.create('rest', {
    handler: (() => new Response('ok')) as never,
  })
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
  const id = manager.create('rest', {
    handler: (() => new Response('ok')) as never,
  }, runtime)

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
      () =>
        compileRuntime('graphql', {
          explicitId: 'billing',
          previousId: 'old-billing',
        }),
      Error,
      "isn't supported for a graphql server",
    )
  },
)

Deno.test(
  'WebServerManager.stopAll: stops every registered server without the caller tracking any ServerID itself',
  async () => {
    const manager = new WebServerManager()

    const id1 = manager.create('rest', {
      handler: (() => new Response('ok')) as never,
      server: { port: 4470 },
    })
    const id2 = manager.create('rest', {
      handler: (() => new Response('ok')) as never,
      server: { port: 4471 },
    })
    manager.start([id1, id2])

    assert(manager.info(id1).addr, 'server 1 actually bound its port')
    assert(manager.info(id2).addr, 'server 2 actually bound its port')

    await manager.stopAll()

    // Real closure, not just bookkeeping — a fresh manager can bind the exact same ports again,
    // which only succeeds if `stopAll()` actually released both underlying `Deno.serve()` listeners.
    const reboundManager = new WebServerManager()
    const reboundId1 = reboundManager.create('rest', {
      handler: (() => new Response('ok')) as never,
      server: { port: 4470 },
    })
    const reboundId2 = reboundManager.create('rest', {
      handler: (() => new Response('ok')) as never,
      server: { port: 4471 },
    })
    reboundManager.start([reboundId1, reboundId2])

    assert(reboundManager.info(reboundId1).addr, 'port 4470 was genuinely released')
    assert(reboundManager.info(reboundId2).addr, 'port 4471 was genuinely released')

    await reboundManager.stopAll()
  },
)

Deno.test(
  'WebServerManager.refreshRoutes: a route registered AFTER create() becomes reachable, with zero ' +
    'downtime for routes that already worked',
  async () => {
    const manager = new WebServerManager()
    try {
      Program.routes.defineRoute('rest', {
        path: '/hello',
        handler: () => new Response('v1'),
      })

      const id = manager.create('rest', { server: { port: 4472, globalPrefix: '' } })
      manager.start(id)

      const before = await fetch('http://localhost:4472/hello')
      assertEquals(await before.text(), 'v1')

      const missingBefore = await fetch('http://localhost:4472/new')
      assertEquals(missingBefore.status, 404)

      Program.routes.defineRoute('rest', {
        path: '/new',
        handler: () => new Response('v2'),
      })
      manager.refreshRoutes(id)

      const after = await fetch('http://localhost:4472/new')
      assertEquals(await after.text(), 'v2')

      // The original route must still work after the rebuild — a refresh is a full recompile from
      // the current registry, not an incremental patch, so this also guards against the rebuild
      // silently dropping anything that was already there.
      const stillWorks = await fetch('http://localhost:4472/hello')
      assertEquals(await stillWorks.text(), 'v1')
    } finally {
      await manager.stopAll()
      Program.routes.resetContainer()
    }
  },
)

Deno.test(
  'WebServerManager.refreshRoutes: a no-op for a server created with a fully custom handler',
  () => {
    const manager = new WebServerManager()

    const id = manager.create('rest', {
      handler: (() => new Response('custom')) as never,
      server: { port: 4473 },
    })

    // Must not throw — there is nothing framework-owned to recompile for a custom handler.
    manager.refreshRoutes(id)
  },
)

Deno.test(
  'WebServerManager.refreshRoutes: a no-op for an id that was never registered',
  () => {
    const manager = new WebServerManager()
    manager.refreshRoutes('never-registered')
  },
)
