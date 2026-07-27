import { assert, assertEquals, assertExists, assertFalse, assertThrows } from '@std/assert'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import Program from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'

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
    handler: () => '' as never,
  })

  const fullPath = path + '/GET'
  const { absolutePaths, relativePaths } = routeProcessor('rest')

  assertFalse(Object.keys(absolutePaths).length)
  assertExists(relativePaths[fullPath].regex)
  assertEquals(relativePaths[fullPath].params, ['param'])
  assertEquals(relativePaths[fullPath].httpMethod, 'GET') // Default method
  assertEquals(relativePaths[fullPath].interceptors[0]({} as never, {} as never), 'resp' as never)
  assert(relativePaths[fullPath].pipes.length === 0)
  assert(typeof relativePaths[fullPath].handler === 'function')

  // References should be deleted
  Program.routes.resetContainer()

  assertThrows(
    () => routeProcessor('rest'),
    InternalError,
    'Not routes defined for Rest sever',
  )
})

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
  Program.routes.setEndpoint({ Target, propertyKey: 'Fa', endpoint: path, httpMethod: 'DELETE' })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({ Target, propertyKey: 'Fb' }) // set property name endpoint
  Program.targets.addProperty({ Target, propertyKey: 'Fb' })

  Program.routes.defineRoute('rest', Target)

  Program.targets.defineTarget(Target.name, { type: 'controller', Target, lifetime: 'TRANSIENT' })

  const { absolutePaths, relativePaths } = routeProcessor('rest')

  const fullPath = '/prefix/' + path + '/DELETE'

  assertExists(absolutePaths['/prefix/fb/GET'])

  assertExists(relativePaths[fullPath].regex)
  assertEquals(relativePaths[fullPath].params, ['param-1'])
  assert(relativePaths[fullPath].interceptors.length === 0)
  assertEquals(relativePaths[fullPath].httpMethod, 'DELETE')
  assertEquals(relativePaths[fullPath].pipes.length, 4)
  assertEquals(relativePaths[fullPath].pipes[0]({ id: 2 } as never), 'this is global' as never)
  assertEquals(absolutePaths['/prefix/fb/GET'].pipes.length, 3) // One global, two for the target
  assertEquals(
    absolutePaths['/prefix/fb/GET'].pipes[0]({ id: 2 } as never),
    'this is global' as never,
  )
  assertEquals(relativePaths[fullPath].pipes[1]({ id: 2 } as never), 2 as never)
  assertEquals(relativePaths[fullPath].pipes[2]({ id: 2 } as never), undefined)
})

Deno.test('routeProcessor: isInternal filters which routes are included per scope', () => {
  Program.routes.resetContainer()

  Program.routes.defineRoute('rest', {
    path: '/public-only',
    handler: () => '' as never,
  }, false)
  Program.routes.defineRoute('rest', {
    path: '/internal-only',
    handler: () => '' as never,
  }, true)

  const { absolutePaths: publicPaths } = routeProcessor('rest', false)
  assertExists(publicPaths['/public-only/GET'])
  assertEquals(publicPaths['/internal-only/GET'], undefined)

  const { absolutePaths: internalPaths } = routeProcessor('rest', true)
  assertExists(internalPaths['/internal-only/GET'])
  assertEquals(internalPaths['/public-only/GET'], undefined)

  // Default (no isInternal argument) behaves like `false` (public)
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

Deno.test('routeProcessor should throw because of douplicate routes', () => {
  const path = 'route-2'
  class Target extends TargetBaseClass {}
  class Target2 extends TargetBaseClass {}

  Program.routes.setEndpoint({ Target, endpoint: 'prefix' })
  Program.routes.setEndpoint({ Target, propertyKey: 'Fa', endpoint: path })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({ Target: Target2, propertyKey: 'Fb', endpoint: path })
  Program.targets.addProperty({ Target: Target2, propertyKey: 'Fb' })

  Program.routes.defineRoute('rest', Target)
  Program.routes.defineRoute('rest', Target2) // No throws beause of prefix

  Program.routes.resetContainer()

  Program.routes.setEndpoint({ Target, propertyKey: 'Fa', endpoint: path })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({ Target: Target2, propertyKey: 'Fb', endpoint: path })
  Program.targets.addProperty({ Target: Target2, propertyKey: 'Fb' })

  Program.routes.defineRoute('rest', Target)

  assertThrows(
    () => Program.routes.defineRoute('rest', Target2),
    InternalError,
    'Route path "rest=>/route-2" is already defined in "Target"',
  )
})
