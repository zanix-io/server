import { assert, assertEquals, assertInstanceOf } from '@std/assert'
import { InternalError } from '@zanix/errors'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { Post } from 'modules/infra/handlers/rest/decorators/post.ts'
import { Interceptor } from 'modules/infra/middlewares/decorators/interceptor.ts'
import {
  RequestTiming,
  type RequestTimingLogger,
} from 'modules/infra/middlewares/request-timing.ts'

import { REQUEST_STARTED_AT_LOCALS_KEY } from 'utils/constants.ts'

import type { HandlerContext } from 'typings/context.ts'
import type { MiddlewareInterceptor } from 'typings/middlewares.ts'

// What the decorator does is register an interceptor on the route, the way `@Interceptor` does. So
// the tests read what the framework recorded for each decorated handler and then run that
// interceptor with a context that has the `startedAt` the dispatcher gives every request.
// `@Controller` itself adds one class-level interceptor (protocol version) to every route, which is
// why the assertions look at what was decorated (`ownOf`) or compare with a control class.

const entries: { level: string; data: Record<string, unknown> }[] = []
const log: RequestTimingLogger = {
  isLevelEnabled: () => true,
  timer: (_label, options = {}) => ({
    elapsed: () => 0,
    stop: (metadata) => {
      entries.push({ level: options.level ?? 'debug', data: { ...options.metadata, ...metadata } })
      return 0
    },
    [Symbol.dispose]: () => {},
  }),
}

let now = 1000
const clock = () => now

// deno-lint-ignore no-explicit-any
type Ctor = new (...args: any[]) => unknown

/** Every interceptor the framework would run for this handler. */
const interceptorsOf = (Target: Ctor, propertyKey: string) =>
  ProgramModule.middlewares.getTargetInterceptors({
    Target: Target as never,
    propertyKey,
  }) as MiddlewareInterceptor[]

/** Only what was decorated on this method. */
const ownOf = (Target: Ctor, propertyKey: string) =>
  ProgramModule.middlewares.getInterceptors({
    Target: Target as never,
    propertyKey,
  }) as MiddlewareInterceptor[]

/** Runs a request that took `takes` ms through the interceptors. */
const run = (interceptors: MiddlewareInterceptor[], takes: number, method = 'GET') => {
  const ctx = {
    id: 'ctx-1',
    req: new Request('http://localhost/x?q=1', { method }),
    locals: { [REQUEST_STARTED_AT_LOCALS_KEY]: now },
  } as unknown as HandlerContext
  now += takes
  for (const interceptor of interceptors) interceptor(ctx, new Response('ok'))
}

const reset = () => {
  entries.length = 0
  now = 1000
  // Each test declares its own controllers: start from an empty route table.
  ProgramModule.routes.resetContainer()
}

Deno.test('on a method: that route is measured with ITS budget and the method name', () => {
  reset()
  class _A extends ZanixController {
    @Get('light')
    @RequestTiming({ slowMs: 50, log, clock })
    public light() {
      return 'ok'
    }
    @Get('heavy')
    @RequestTiming({ slowMs: 2000, log, clock })
    public heavy() {
      return 'ok'
    }
  }
  Controller()(_A)

  const light = ownOf(_A, 'light')
  const heavy = ownOf(_A, 'heavy')
  assertEquals([light.length, heavy.length], [1, 1])

  run(light, 300)
  run(heavy, 300)

  assertEquals(entries.map(({ data }) => [data.handler, data.slowMs]), [['light', 50]])
})

Deno.test('a handler without the decorator is not measured: nothing of it is registered, so no cost', () => {
  reset()
  class _B extends ZanixController {
    @Get('timed')
    @RequestTiming({ slowMs: 10, log, clock })
    public timed() {
      return 'ok'
    }
    @Post('plain')
    public plain() {
      return 'ok'
    }
    @Get('other')
    @Interceptor((_ctx, response) => response)
    public other() {
      return 'ok'
    }
  }
  Controller()(_B)

  assertEquals(ownOf(_B, 'plain'), [])
  assertEquals(ownOf(_B, 'other').length, 1, "only the app's own interceptor")

  run(interceptorsOf(_B, 'plain'), 5000, 'POST')
  run(interceptorsOf(_B, 'other'), 5000)
  assertEquals(entries, [])
})

Deno.test('on a class: every route of the class is measured, under the class name', () => {
  reset()
  class _Reports extends ZanixController {
    @Get('reports-a')
    public a() {
      return 'a'
    }
    @Post('reports-b')
    public b() {
      return 'b'
    }
  }
  RequestTiming({ slowMs: 100, log, clock })(_Reports, { kind: 'class', name: '_Reports' } as never)
  Controller()(_Reports)

  class _Control extends ZanixController {
    @Get('reports-control')
    public control() {
      return 'c'
    }
  }
  Controller()(_Control)

  run(interceptorsOf(_Reports, 'a'), 200, 'GET')
  run(interceptorsOf(_Reports, 'b'), 200, 'POST')
  run(interceptorsOf(_Control, 'control'), 200, 'GET')

  assertEquals(entries.map(({ data }) => [data.handler, data.method]), [
    ['_Reports', 'GET'],
    ['_Reports', 'POST'],
  ])
  assertEquals(
    interceptorsOf(_Reports, 'a').length,
    interceptorsOf(_Control, 'control').length + 1,
    'one more interceptor than a class without the decorator',
  )
})

Deno.test('`name` overrides the default name', () => {
  reset()
  class _C extends ZanixController {
    @Get('named')
    @RequestTiming({ slowMs: 1, name: 'reports.monthly', log, clock })
    public x() {
      return 'ok'
    }
  }
  Controller()(_C)

  run(ownOf(_C, 'x'), 50)

  assertEquals(entries[0].data.handler, 'reports.monthly')
})

Deno.test('a class decorator is found through inheritance: a subclass is measured too', () => {
  reset()
  class _Base extends ZanixController {
    @Get('base-x')
    public x() {
      return 'ok'
    }
  }
  RequestTiming({ slowMs: 1, log, clock })(_Base, { kind: 'class', name: '_Base' } as never)

  // The framework looks class-level middleware up through the prototype chain, so a subclass sees
  // its parent's decorator without being decorated itself.
  class _Child extends _Base {}

  const classLevel = (Target: Ctor) =>
    ProgramModule.middlewares.getInterceptors({ Target: Target as never })
  assertEquals(classLevel(_Base).length, 1)
  assertEquals(classLevel(_Child).length, 1)
})

Deno.test("it composes with the app's own interceptors: both are registered", () => {
  reset()
  const own: MiddlewareInterceptor = (_ctx, response) => response
  class _D extends ZanixController {
    @Get('composed')
    @RequestTiming({ slowMs: 10, log, clock })
    @Interceptor(own)
    public x() {
      return 'ok'
    }
  }
  Controller()(_D)

  const list = ownOf(_D, 'x')

  assertEquals(list.length, 2)
  assert(list.includes(own))
})

Deno.test('an invalid option fails when the decorator is applied, naming the problem', () => {
  for (
    const [options, expected] of [
      [{ slowMs: undefined as never }, '`slowMs`'],
      [{ slowMs: 0 }, '`slowMs`'],
      [{ slowMs: 10, logAll: 'yes' as never }, '`logAll`'],
      [{ slowMs: 10, name: ' ' }, '`name`'],
    ] as const
  ) {
    let thrown: unknown
    try {
      class _E extends ZanixController {
        @RequestTiming(options)
        public x() {
          return 'ok'
        }
      }
      void _E
    } catch (error) {
      thrown = error
    }
    assertInstanceOf(thrown, InternalError)
    assert(thrown.message.includes(expected), thrown.message)
  }
})
