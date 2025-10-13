import { assert, assertEquals, assertExists, assertThrows } from '@std/assert'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import Program from 'modules/program/main.ts'

//Mocks
console.info = () => {}

Deno.test('routeProcessor should throw', () => {
  Program.routes.defineRoute('rest', {} as never)

  assertThrows(
    () => routeProcessor('rest'),
    Deno.errors.Interrupted,
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

  const routes = routeProcessor('rest')

  assertExists(routes[path].regex)
  assertEquals(routes[path].params, ['param'])
  assertEquals(routes[path].methods, ['GET', 'POST']) // Default methods
  assertEquals(routes[path].interceptors[0]({} as never, {} as never), 'resp' as never)
  assert(routes[path].pipes.length === 0)
  assert(typeof routes[path].handler === 'function')

  // References should be deleted
  Program.cleanupMetadata()

  assertThrows(
    () => routeProcessor('rest'),
    Deno.errors.Interrupted,
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
  Program.routes.setEndpoint({ Target, propertyKey: 'Fa', endpoint: path })
  Program.targets.addProperty({ Target, propertyKey: 'Fa' })
  Program.routes.setEndpoint({ Target, propertyKey: 'Fb' }) // set property name endpoint
  Program.targets.addProperty({ Target, propertyKey: 'Fb' })
  Program.routes.addHttpMethod('DELETE', { Target, propertyKey: 'Fa' })

  Program.routes.defineRoute('rest', Target)

  Program.targets.toBeInstanced(Target.name, { type: 'controller', Target })

  const routes = routeProcessor('rest')

  const fullPath = '/prefix/' + path

  assertExists(routes['/prefix/fb'])
  assertExists(routes[fullPath].regex)
  assertEquals(routes[fullPath].params, ['param-1'])
  assert(routes[fullPath].interceptors.length === 0)
  assertEquals(routes[fullPath].methods, ['DELETE'])
  assertEquals(routes[fullPath].pipes.length, 4)
  assertEquals(routes[fullPath].pipes[0]({ id: 2 } as never), 'this is global' as never)
  assertEquals(routes['/prefix/fb'].pipes.length, 3) // One global, two for the target
  assertEquals(routes['/prefix/fb'].pipes[0]({ id: 2 } as never), 'this is global' as never)
  assertEquals(routes[fullPath].pipes[1]({ id: 2 } as never), 2 as never)
  assertEquals(routes[fullPath].pipes[2]({ id: 2 } as never), undefined)
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
    Deno.errors.Interrupted,
    'Route path "rest=>/route-2" is already defined in "Target"',
  )
})
