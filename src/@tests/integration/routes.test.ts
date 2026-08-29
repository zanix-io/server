import { assert, assertEquals, assertExists, assertFalse, assertThrows } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import Program from 'modules/program/mod.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { InternalError } from '@zanix/errors'
import logger from '@zanix/logger'

//Mocks
console.info = () => {}
console.error = () => {}

Deno.test('routeProcessor should throw', () => {
  Program.routes.defineRoute('rest', {} as never)

  assertThrows(
    () => routeProcessor('rest'),
    InternalError,
    'Not routes defined for Rest sever',
  )
})

Deno.test('routeProcessor should return default adapted routes', () => {
  const path = '/route-1/:param'
  Program.routes.defineRoute('rest', {
    path,
    interceptors: [() => 'resp' as never],
    // Regression coverage: `defineRoute`'s plain path+handler form (no `Target`) used to silently
    // drop `guards` — `interceptors`/`pipes` were destructured and stored, `guards` wasn't, so a
    // caller passing one here (e.g. Discovery's own mount) got an empty array back regardless.
    guards: [() => ({ headers: { 'x-guard-ran': 'yes' } })],
    handler: () => '' as never,
  })

  const fullPath = path + '/GET'
  const { absolutePaths, relativePaths } = routeProcessor('rest')

  assertFalse(Object.keys(absolutePaths).length)
  assertExists(relativePaths[fullPath].regex)
  assertEquals(relativePaths[fullPath].params, ['param'])
  assertEquals(relativePaths[fullPath].httpMethod, 'GET') // Default method
  assertEquals(
    relativePaths[fullPath].interceptors[0]({} as never, {} as never),
    'resp' as never,
  )
  assert(relativePaths[fullPath].pipes.length === 0)
  assertEquals(relativePaths[fullPath].guards.length, 1)
  assertEquals(
    relativePaths[fullPath].guards[0]({} as never),
    { headers: { 'x-guard-ran': 'yes' } } as never,
  )
  assert(typeof relativePaths[fullPath].handler === 'function')

  // References should be deleted
  Program.routes.resetContainer()

  assertThrows(
    () => routeProcessor('rest'),
    InternalError,
    'Not routes defined for Rest sever',
  )
})

Deno.test(
  'routeProcessor preserves a camelCase route param NAME, even though the rest of the path ' +
    'still matches case-insensitively',
  () => {
    Program.routes.resetContainer()

    const path = '/route-camel/:serviceId/:model'
    Program.routes.defineRoute('rest', {
      path,
      handler: () => '' as never,
    })

    // The storage key is still the LOWERCASED path (unchanged, matching-related behavior) — only
    // the extracted param NAMES (below) keep their original casing now.
    const fullPath = path.toLowerCase() + '/GET'
    const { relativePaths } = routeProcessor('rest')

    // Regression: `cleanRoute` lowercases the WHOLE path it's given, including `:paramName`
    // placeholder text — before this fix, this came back as `['serviceid', 'model']`, silently
    // breaking `ctx.payload.params.serviceId` (it would only ever resolve under the lowercased
    // key `serviceid`).
    assertEquals(relativePaths[fullPath].params, ['serviceId', 'model'])
  },
)

Deno.test('routeProcessor should return adapted routes for external definitions', () => {
  Program.middlewares.addGlobalPipe(() => 'this is global' as never, ['rest']) // Global pipe

  const path = 'route-1/:param-1'
  class Target extends TargetBaseClass {
    public Fa() {}
    public Fb() {}
  }
  Program.middlewares.addPipe((ctx) => {
    return ctx.id as never
  }, { Target })

  const fn = () => {}
  Program.middlewares.addPipe(fn, { Target })
  Program.middlewares.addPipe(fn, { Target, propertyKey: 'Fa' }) // avoid to save same fn by reference
  Program.middlewares.addPipe(() => {}, { Target, propertyKey: 'Fa' }) // new specific for the property

  Program.routes.setEndpoint({ Target, endpoint: 'prefix' })
  Program.routes.setEndpoint({
    Target,
    propertyKey: 'Fa',
    endpoint: path,
    httpMethod: 'DELETE',
  })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({ Target, propertyKey: 'Fb' }) // set property name endpoint
  Program.targets.addProperty({ Target, propertyKey: 'Fb' })

  Program.routes.defineRoute('rest', Target)

  Program.targets.defineTarget(Target.name, {
    type: 'controller',
    Target,
    lifetime: 'TRANSIENT',
  })

  const { absolutePaths, relativePaths } = routeProcessor('rest')

  const fullPath = '/prefix/' + path + '/DELETE'

  assertExists(absolutePaths['/prefix/fb/GET'])

  assertExists(relativePaths[fullPath].regex)
  assertEquals(relativePaths[fullPath].params, ['param-1'])
  assert(relativePaths[fullPath].interceptors.length === 0)
  assertEquals(relativePaths[fullPath].httpMethod, 'DELETE')
  assertEquals(relativePaths[fullPath].pipes.length, 4)
  assertEquals(
    relativePaths[fullPath].pipes[0]({ id: 2 } as never),
    'this is global' as never,
  )
  assertEquals(absolutePaths['/prefix/fb/GET'].pipes.length, 3) // One global, two for the target
  assertEquals(
    absolutePaths['/prefix/fb/GET'].pipes[0]({ id: 2 } as never),
    'this is global' as never,
  )
  assertEquals(
    relativePaths[fullPath].pipes[1]({ id: 2 } as never),
    2 as never,
  )
  assertEquals(relativePaths[fullPath].pipes[2]({ id: 2 } as never), undefined)
})

Deno.test('routeProcessor: application filters which routes are included per Application', () => {
  Program.routes.resetContainer()

  Program.routes.defineRoute('rest', {
    path: '/public-only',
    handler: () => '' as never,
  }, DEFAULT_APPLICATION)
  Program.routes.defineRoute('rest', {
    path: '/internal-only',
    handler: () => '' as never,
  }, 'admin')

  const { absolutePaths: publicPaths } = routeProcessor(
    'rest',
    DEFAULT_APPLICATION,
  )
  assertExists(publicPaths['/public-only/GET'])
  assertEquals(publicPaths['/internal-only/GET'], undefined)

  const { absolutePaths: internalPaths } = routeProcessor('rest', 'admin')
  assertExists(internalPaths['/internal-only/GET'])
  assertEquals(internalPaths['/public-only/GET'], undefined)

  // Default (no application argument) behaves like the default Application
  const { absolutePaths: defaultPaths } = routeProcessor('rest')
  assertExists(defaultPaths['/public-only/GET'])
  assertEquals(defaultPaths['/internal-only/GET'], undefined)
})

Deno.test('routeProcessor: relative regex matches nothing with zero relative routes', () => {
  Program.routes.resetContainer()

  Program.routes.defineRoute('rest', {
    path: '/only-absolute',
    handler: () => '' as never,
  })

  const { routePaths } = routeProcessor('rest')

  // Regression: `new RegExp('')` (an empty pattern, produced when `routePaths.relative` starts
  // out empty) matches every string, which made any unmatched path look like a 405 (method not
  // allowed) instead of a 404 (not found).
  assertFalse(routePaths.relative.test('/some/unrelated/path'))
  assertFalse(routePaths.relative.test(''))
})

Deno.test('routes.removeRoutesForTarget: deregisters a Target so it can be re-registered', () => {
  Program.routes.resetContainer()

  const path = 'hot-reload-page'
  class PageV1 extends TargetBaseClass {
    public handleGet() {}
  }

  Program.routes.setEndpoint({
    Target: PageV1,
    propertyKey: 'handleGet',
    endpoint: path,
  })
  Program.targets.addProperty({ Target: PageV1, propertyKey: 'handleGet' })
  Program.targets.defineTarget(PageV1.name, {
    type: 'controller',
    Target: PageV1,
    lifetime: 'TRANSIENT',
  })
  Program.routes.defineRoute('ssr', PageV1)

  // Re-registering the SAME Target, without removing first, collides exactly like two unrelated
  // classes would — this is the failure mode `removeRoutesForTarget` exists to avoid on hot-reload.
  assertThrows(
    () => Program.routes.defineRoute('ssr', PageV1),
    InternalError,
    'Route path "ssr=>/hot-reload-page" is already defined in "PageV1"',
  )

  const removed = Program.routes.removeRoutesForTarget(PageV1)
  assertEquals(removed, 1)

  // No longer collides once deregistered — simulates re-importing the same page as a fresh module
  // instance (a new class object in real hot-reload, the same class here since only the
  // deregistration mechanics are under test).
  Program.routes.defineRoute('ssr', PageV1)

  const { absolutePaths } = routeProcessor('ssr')
  assertExists(absolutePaths['/hot-reload-page/GET'])

  // Removing an already-empty Target is a safe no-op, not an error
  Program.routes.removeRoutesForTarget(PageV1)
  const removedAgain = Program.routes.removeRoutesForTarget(PageV1)
  assertEquals(removedAgain, 0)
})

Deno.test('routes.removeRoutesForTarget: a `type` scopes removal, other types untouched', () => {
  Program.routes.resetContainer()

  class MultiTypeTarget extends TargetBaseClass {
    public handleGet() {}
  }

  Program.routes.setEndpoint({
    Target: MultiTypeTarget,
    propertyKey: 'handleGet',
    endpoint: 'multi-type',
  })
  Program.targets.addProperty({
    Target: MultiTypeTarget,
    propertyKey: 'handleGet',
  })
  Program.targets.defineTarget(MultiTypeTarget.name, {
    type: 'controller',
    Target: MultiTypeTarget,
    lifetime: 'TRANSIENT',
  })
  Program.routes.defineRoute('rest', MultiTypeTarget)
  Program.routes.defineRoute('ssr', MultiTypeTarget)

  const removed = Program.routes.removeRoutesForTarget(MultiTypeTarget, 'rest')
  assertEquals(removed, 1)

  assertThrows(
    () => routeProcessor('rest'),
    InternalError,
    'Not routes defined for Rest sever',
  )
  assertExists(routeProcessor('ssr').absolutePaths['/multi-type/GET'])
})

Deno.test('routes.removeRoutesForTarget: never matches the raw path/handler form', () => {
  Program.routes.resetContainer()

  class UnrelatedTarget extends TargetBaseClass {}

  Program.routes.defineRoute('rest', {
    path: '/raw-escape-hatch',
    handler: () => '' as never,
  })

  const removed = Program.routes.removeRoutesForTarget(UnrelatedTarget)
  assertEquals(removed, 0)
  assertExists(routeProcessor('rest').absolutePaths['/raw-escape-hatch/GET'])
})

Deno.test('routeProcessor should throw because of douplicate routes', () => {
  const path = 'route-2'
  class Target extends TargetBaseClass {}
  class Target2 extends TargetBaseClass {}

  Program.routes.setEndpoint({ Target, endpoint: 'prefix' })
  Program.routes.setEndpoint({ Target, propertyKey: 'Fa', endpoint: path })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({
    Target: Target2,
    propertyKey: 'Fb',
    endpoint: path,
  })
  Program.targets.addProperty({ Target: Target2, propertyKey: 'Fb' })

  Program.routes.defineRoute('rest', Target)
  Program.routes.defineRoute('rest', Target2) // No throws beause of prefix

  Program.routes.resetContainer()

  Program.routes.setEndpoint({ Target, propertyKey: 'Fa', endpoint: path })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({
    Target: Target2,
    propertyKey: 'Fb',
    endpoint: path,
  })
  Program.targets.addProperty({ Target: Target2, propertyKey: 'Fb' })

  Program.routes.defineRoute('rest', Target)

  assertThrows(
    () => Program.routes.defineRoute('rest', Target2),
    InternalError,
    'Route path "rest=>/route-2" is already defined in "Target"',
  )
})

Deno.test('routeProcessor should apply global prefix', () => {
  Program.routes.resetContainer()

  Program.routes.defineRoute('rest', {
    path: '/users',
    handler: () => '' as never,
  })

  const { absolutePaths } = routeProcessor(
    'rest',
    DEFAULT_APPLICATION,
    'api',
  )

  assertExists(absolutePaths['/api/users/GET'])
})

Deno.test('routeProcessor should not duplicate global prefix when route matches it', () => {
  Program.routes.resetContainer()

  Program.routes.defineRoute('rest', {
    path: '/api',
    handler: () => '' as never,
  })

  const { absolutePaths } = routeProcessor(
    'rest',
    DEFAULT_APPLICATION,
    'api',
  )

  assertExists(absolutePaths['/api/GET'])
  assertEquals(absolutePaths['/api/api/GET'], undefined)
})

Deno.test(
  'routeProcessor: logs a route registration only once, never again on a later rebuild of the ' +
    'SAME route (e.g. WebServerManager.refreshRoutes recompiling from scratch)',
  () => {
    Program.routes.resetContainer()
    Program.routes.defineRoute('rest', {
      path: '/route-logging-dedup-test',
      handler: () => '' as never,
    })

    const logSpy = spy(logger, 'info')
    try {
      routeProcessor('rest')
      assertSpyCalls(logSpy, 1)

      // A second call for the IDENTICAL, already-registered route — exactly what
      // `WebServerManager.refreshRoutes` does on every dev-mode reload, whether or not anything
      // actually changed — must never log it again; only a genuinely new route should.
      routeProcessor('rest')
      assertSpyCalls(logSpy, 1)

      Program.routes.defineRoute('rest', {
        path: '/route-logging-dedup-test-2',
        handler: () => '' as never,
      })
      routeProcessor('rest')
      assertSpyCalls(logSpy, 2)
    } finally {
      logSpy.restore()
    }
  },
)

Deno.test(
  'routeProcessor: a genuinely changed route (a new object at the SAME storage key) is always ' +
    'reprocessed and relogged — the cache must never suppress a real change',
  () => {
    Program.routes.resetContainer()
    Program.routes.defineRoute('rest', {
      path: '/route-logging-change-test',
      handler: () => 'v1' as never,
    })

    const logSpy = spy(logger, 'info')
    try {
      const { absolutePaths: v1 } = routeProcessor('rest')
      assertSpyCalls(logSpy, 1)
      assertEquals(v1['/route-logging-change-test/GET'].handler({} as never), 'v1' as never)

      // Re-registering the SAME path (no `removeRoutesForTarget` needed — this is the raw
      // path+handler escape hatch, which `RouteContainer.defineRoute` always overwrites
      // unconditionally) writes a BRAND-NEW record object at the identical storage key. The cache
      // is keyed by that record's own object identity, never by path/method string, so this must
      // be a cache MISS — reprocessed and relogged — even though nothing about the path changed.
      Program.routes.defineRoute('rest', {
        path: '/route-logging-change-test',
        handler: () => 'v2' as never,
      })
      const { absolutePaths: v2 } = routeProcessor('rest')
      assertSpyCalls(logSpy, 2)
      assertEquals(v2['/route-logging-change-test/GET'].handler({} as never), 'v2' as never)
    } finally {
      logSpy.restore()
    }
  },
)
