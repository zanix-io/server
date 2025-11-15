import { assert, assertEquals, assertExists, assertFalse, assertThrows } from '@std/assert'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import Program from 'modules/program/mod.ts'

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

  const { absolutePaths, relativePaths } = routeProcessor('rest')

  assertFalse(Object.keys(absolutePaths).length)
  assertExists(relativePaths[path].regex)
  assertEquals(relativePaths[path].params, ['param'])
  assertEquals(relativePaths[path].methods, ['GET', 'POST']) // Default methods
  assertEquals(relativePaths[path].interceptors[0]({} as never, {} as never), 'resp' as never)
  assert(relativePaths[path].pipes.length === 0)
  assert(typeof relativePaths[path].handler === 'function')

  // References should be deleted
  Program.routes.resetContainer()

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

  Program.targets.defineTarget(Target.name, { type: 'controller', Target, lifetime: 'TRANSIENT' })

  const { absolutePaths, relativePaths } = routeProcessor('rest')

  const fullPath = '/prefix/' + path

  assertExists(absolutePaths['/prefix/fb'])
  assertExists(relativePaths[fullPath].regex)
  assertEquals(relativePaths[fullPath].params, ['param-1'])
  assert(relativePaths[fullPath].interceptors.length === 0)
  assertEquals(relativePaths[fullPath].methods, ['DELETE'])
  assertEquals(relativePaths[fullPath].pipes.length, 4)
  assertEquals(relativePaths[fullPath].pipes[0]({ id: 2 } as never), 'this is global' as never)
  assertEquals(absolutePaths['/prefix/fb'].pipes.length, 3) // One global, two for the target
  assertEquals(absolutePaths['/prefix/fb'].pipes[0]({ id: 2 } as never), 'this is global' as never)
  assertEquals(relativePaths[fullPath].pipes[1]({ id: 2 } as never), 2 as never)
  assertEquals(relativePaths[fullPath].pipes[2]({ id: 2 } as never), undefined)
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
