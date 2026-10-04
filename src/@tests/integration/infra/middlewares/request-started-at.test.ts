// deno-lint-ignore-file no-await-in-loop no-explicit-any
import { assert, assertEquals, assertStrictEquals } from '@std/assert'
import { stub } from '@std/testing/mock'
import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { getMainHandler } from 'modules/webserver/helpers/handler.ts'
import { registerGraphqlHandlerFactory } from 'handlers/graphql/registry.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { ZanixSsrController } from 'modules/infra/handlers/ssr/base.ts'
import { SsrController } from 'modules/infra/handlers/ssr/decorators/base.ts'
import { Guard } from 'modules/infra/middlewares/decorators/guard.ts'
import { Pipe } from 'modules/infra/middlewares/decorators/pipe.ts'
import { Interceptor } from 'modules/infra/middlewares/decorators/interceptor.ts'
import { registerGlobalGuard } from 'modules/infra/middlewares/defs/guards.ts'
import { registerGlobalPipe } from 'modules/infra/middlewares/defs/pipes.ts'
import { registerGlobalInterceptor } from 'modules/infra/middlewares/defs/interceptors.ts'
import { createTimingInterceptor, RequestTiming } from 'modules/infra/middlewares/request-timing.ts'
import { REQUEST_STARTED_AT_LOCALS_KEY } from 'utils/constants.ts'
import Program from 'modules/program/mod.ts'

// Does the start the dispatcher writes into `ctx.locals` reach an interceptor intact, through every
// stage and every kind of route? Everything here runs through the REAL pipeline: a real server for
// controllers (Application scoped, real HTTP), and `getMainHandler` for the route types that have
// no controller decorator here. Nothing about the framework is mocked.

const KEY = REQUEST_STARTED_AT_LOCALS_KEY
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
stub(console, 'info')
stub(console, 'error')

/** What each stage saw: its name, the start it read from `locals`, and what it could tell about the objects. */
type Seen = { stage: string; start: unknown; ctx: unknown; locals: unknown }
const seen: Seen[] = []
const note = (stage: string) => (ctx: any) => {
  seen.push({ stage, start: ctx.locals?.[KEY], ctx, locals: ctx.locals })
}
const stagesOf = () => seen.map(({ stage }) => stage)
const reset = () => {
  seen.length = 0
}
const cleanGlobals = () => Program.middlewares.resetContainer()

const withServer = async (
  application: string,
  type: 'rest' | 'ssr',
  port: number,
  define: () => void,
  fn: (base: string) => Promise<void>,
) => {
  await Program.applications.define(application, define)
  const servers = await bootstrapServers({ [type]: { port, application } } as never)
  try {
    const addr = webServerManager.info(servers[0]).addr as Deno.NetAddr
    await fn(`http://${addr.hostname}:${addr.port}${type === 'rest' ? '/api' : ''}`)
  } finally {
    await Promise.all(servers.map((server) => webServerManager.stop(server)))
    cleanGlobals()
  }
}

Deno.test(
  'REST, the whole pipeline: global guard + route guards (chained, writing other keys) + global pipe + ' +
    'route pipe + handler + route and global interceptors all read the SAME start, and the objects are as documented',
  async () => {
    reset()
    await withServer('started-at-rest', 'rest', 4491, () => {
      @Controller()
      class _Before extends ZanixController {
        @Get('before')
        @Guard((ctx) => (note('before:route-guard')(ctx), {}))
        public before(ctx: any) {
          note('before:handler')(ctx)
          return 'before'
        }
      }
      void _Before

      // Global middlewares are copied into each route as it is DEFINED: `_Before` above is already
      // defined, `_After` below is not.
      registerGlobalGuard((ctx: any) => {
        ctx.locals.fromGlobalGuard = true
        note('global-guard')(ctx)
        return {}
      })
      registerGlobalPipe((ctx: any) => {
        ctx.locals.fromGlobalPipe = true
        note('global-pipe')(ctx)
      })
      const globalInterceptor = (ctx: any, response: Response) => {
        note('global-interceptor')(ctx)
        return response
      }
      registerGlobalInterceptor(globalInterceptor as any)

      @Controller()
      class _After extends ZanixController {
        @Get('after')
        @Guard((ctx) => {
          // A guard that writes OTHER keys into `locals` must not disturb the start.
          ;(ctx.locals as any).fromRouteGuard1 = 1
          note('route-guard-1')(ctx)
          return {}
        })
        @Guard((ctx) => {
          ;(ctx.locals as any).fromRouteGuard2 = 2
          note('route-guard-2')(ctx)
          return {}
        })
        @Pipe((ctx) => {
          ;(ctx.locals as any).fromRoutePipe = 3
          note('route-pipe')(ctx)
        })
        @Interceptor((ctx, response) => {
          note('route-interceptor')(ctx)
          return response
        })
        public after(ctx: any) {
          note('handler')(ctx)
          return { ok: true }
        }
      }
      void _After
    }, async (base) => {
      // A route defined BEFORE the globals: it has no global guard/pipe/interceptor, but the start
      // is there for what it does have.
      const before = await fetch(`${base}/before`)
      assertEquals(await before.text(), 'before')
      assertEquals(stagesOf(), ['before:route-guard', 'before:handler'])
      for (const stage of seen) assertEquals(typeof stage.start, 'number', stage.stage)
      assertEquals(new Set(seen.map(({ start }) => start)).size, 1, 'one start for the request')
      reset()

      // A route defined AFTER the globals: every stage, in pipeline order.
      const startBefore = performance.now()
      const after = await fetch(`${base}/after`)
      const startAfter = performance.now()
      assertEquals((await after.json()).ok, true)

      assertEquals(stagesOf(), [
        'global-guard',
        // decorators apply bottom-up: the guard written lower runs first
        'route-guard-2',
        'route-guard-1',
        'global-pipe',
        'route-pipe',
        'handler',
        'global-interceptor', // the global interceptors come first in the list a route runs
        'route-interceptor',
      ])
      const starts = new Set(seen.map(({ start }) => start))
      assertEquals(starts.size, 1, `the same start in every stage: ${[...starts]}`)
      const [start] = [...starts] as number[]
      assert(
        Number.isFinite(start) && start >= startBefore && start <= startAfter,
        'a real reading of this clock',
      )

      // The values other stages wrote are all there too: nothing was replaced on the way.
      const last = seen[seen.length - 1].locals as Record<string, unknown>
      for (
        const key of [
          'fromGlobalGuard',
          'fromRouteGuard1',
          'fromRouteGuard2',
          'fromGlobalPipe',
          'fromRoutePipe',
        ]
      ) {
        assert(key in last, `${key} survived to the last stage`)
      }

      // Evidence for the table in the docs: ONE `locals` object for the whole request...
      const [first] = seen
      for (const stage of seen) assertStrictEquals(stage.locals, first.locals, stage.stage)
      // ...and ONE context object for the guards, the route pipe, the handler and the route
      // interceptor. The global pipe and the global interceptor get a shallow COPY of the context
      // (`registerGlobalPipe`/`registerGlobalInterceptor` spread it), which shares the same `locals`.
      const ctxOf = (stage: string) => (seen.find((entry) => entry.stage === stage) as Seen).ctx
      for (const same of ['route-guard-2', 'route-pipe', 'handler', 'route-interceptor']) {
        assertStrictEquals(ctxOf(same), ctxOf('route-guard-1'), same)
      }
      assert(ctxOf('global-pipe') !== ctxOf('route-guard-1'), 'global pipe: a copy of the context')
      assert(ctxOf('global-interceptor') !== ctxOf('route-guard-1'), 'global interceptor: a copy')
    })
  },
)

Deno.test('REST: the timing interceptor registered with `@RequestTiming` measures through guards, pipes and handler', async () => {
  reset()
  const lines: string[] = []
  const warn = stub(
    console,
    'warn',
    (...args: unknown[]) =>
      void lines.push(args.map((arg) => Deno.inspect(arg, { depth: 6 })).join(' ')),
  )
  try {
    await withServer('started-at-timing', 'rest', 4492, () => {
      @Controller()
      class _T extends ZanixController {
        @Get('slow')
        @Guard(async () => (await sleep(15), {}))
        @Pipe(async () => await sleep(15))
        @RequestTiming({ slowMs: 20 })
        public async slow() {
          await sleep(15)
          return { p: 'slow' }
        }
        @Get('fast')
        @RequestTiming({ slowMs: 60_000 })
        public fast() {
          return { p: 'fast' }
        }
        @Get('plain')
        public async plain() {
          await sleep(30)
          return { p: 'plain' }
        }
      }
      void _T
    }, async (base) => {
      for (const path of ['slow', 'fast', 'plain']) await (await fetch(`${base}/${path}`)).text()
    })
  } finally {
    warn.restore()
  }

  const timing = lines.filter((line) => line.includes('http.request'))
  assertEquals(timing.length, 1, 'only the route over its budget is logged')
  assert(timing[0].includes('slow'), timing[0])
  const duration = Number(/durationMs: ([0-9.]+)/.exec(timing[0])?.[1])
  assert(duration >= 40, `guard + pipe + handler time is inside the measurement: ${duration}`)
  assertEquals(
    timing.join('').includes('plain'),
    false,
    'a route without the decorator is never measured',
  )
})

Deno.test('REST: two concurrent requests keep their own start', async () => {
  reset()
  await withServer('started-at-concurrent', 'rest', 4493, () => {
    @Controller()
    class _Concurrent extends ZanixController {
      @Get('wait/:ms')
      @Interceptor((ctx, response) => {
        note(`done:${new URL(ctx.req.url).pathname}`)(ctx)
        return response
      })
      public async wait(ctx: any) {
        const ms = Number(ctx.payload.params.ms)
        note(`handler:${ms}`)(ctx)
        await sleep(ms)
        return { ms }
      }
    }
    void _Concurrent
  }, async (base) => {
    await Promise.all([
      fetch(`${base}/wait/120`).then((r) => r.text()),
      (async () => {
        await sleep(30)
        return (await fetch(`${base}/wait/5`)).text()
      })(),
    ])
  })

  const byStage = (stage: string) => seen.find((entry) => entry.stage.endsWith(stage)) as Seen
  const slowStart = byStage('handler:120').start as number
  const fastStart = byStage('handler:5').start as number
  assert(
    fastStart - slowStart >= 25,
    `the later request has the later start: ${fastStart - slowStart}`,
  )
  const slowEnd = performance.now()
  assert(
    slowEnd - slowStart >= 100,
    'the slow request started ~120 ms ago, not when the fast one did',
  )
  assertEquals(byStage('wait/120').start, slowStart, 'its interceptor reads ITS start')
  assertEquals(byStage('wait/5').start, fastStart, 'and the other reads its own')
})

Deno.test('SSR (what @zanix/space pages are): the start reaches a route interceptor through a global guard scoped to ssr', async () => {
  reset()
  const guard: any = (ctx: any) => {
    note('ssr:global-guard')(ctx)
    return {}
  }
  guard.exports = { server: ['ssr'] } // what `defineMiddleware` of @zanix/space does
  await withServer('started-at-ssr', 'ssr', 4494, () => {
    registerGlobalGuard(guard)
    @SsrController()
    class _Page extends ZanixSsrController {
      @Get('page')
      @Interceptor((ctx, response) => {
        note('ssr:interceptor')(ctx)
        return response
      })
      public page() {
        return new Response('page')
      }
    }
    void _Page
  }, async (base) => {
    assertEquals(await (await fetch(`${base}/page`)).text(), 'page')
  })

  assertEquals(stagesOf(), ['ssr:global-guard', 'ssr:interceptor'])
  assertEquals(new Set(seen.map(({ start }) => start)).size, 1)
  assertEquals(typeof seen[0].start, 'number')
})

Deno.test('the other route types that go through the dispatcher (socket route, GraphQL route) carry the start in the same `locals`', async () => {
  reset()
  // A `socket`-type route: the same dispatcher, the same guards/interceptors list.
  Program.routes.resetContainer()
  Program.routes.defineRoute('socket', {
    path: '/ws',
    guards: [(ctx: any) => (note('socket:guard')(ctx), {})],
    handler: (ctx: any) => (note('socket:handler')(ctx), new Response('upgrade-stand-in')) as never,
    interceptors: [(ctx: any, response: Response) => (note('socket:interceptor')(ctx), response)],
  })
  const socket = getMainHandler('socket', undefined, '') as any
  assertEquals(await (await socket(new Request('http://localhost/ws'))).text(), 'upgrade-stand-in')
  assertEquals(stagesOf(), ['socket:guard', 'socket:handler', 'socket:interceptor'])
  assertEquals(new Set(seen.map(({ start }) => start)).size, 1)
  assertEquals(typeof seen[0].start, 'number')

  // A `graphql`-type route: `getMainHandler` registers the factory's handler itself.
  reset()
  Program.routes.resetContainer()
  registerGraphqlHandlerFactory(() => (ctx: any) => (note('graphql:handler')(ctx), 'gql' as never))
  const graphql = getMainHandler('graphql', undefined, 'graphql') as any
  await graphql(new Request('http://localhost/graphql', { method: 'POST' }))
  assertEquals(stagesOf(), ['graphql:handler'])
  assertEquals(typeof seen[0].start, 'number')
  Program.routes.resetContainer()
})

Deno.test('a guard that REPLACES `ctx.locals` removes the start: the timing interceptor degrades, measures and logs nothing', async () => {
  reset()
  const lines: string[] = []
  const warn = stub(
    console,
    'warn',
    (...args: unknown[]) =>
      void lines.push(args.map((arg) => Deno.inspect(arg, { depth: 6 })).join(' ')),
  )
  try {
    Program.routes.resetContainer()
    Program.routes.defineRoute('rest', {
      path: '/replaced',
      guards: [(ctx: any) => {
        ctx.locals = { other: 1 } // reassigns the object: the dispatcher's `locals` is gone
        return {}
      }],
      handler: async () => (await sleep(15), 'ok' as never),
      interceptors: [createTimingInterceptor({ name: 'replaced', slowMs: 1, serverTiming: true })],
    })
    const handler = getMainHandler('rest', undefined, '') as any
    const response = await handler(new Request('http://localhost/replaced'))
    assertEquals(response.status, 200)
    assertEquals(await response.text(), 'ok')
    assertEquals(response.headers.get('Server-Timing'), null, 'no header invented')
  } finally {
    warn.restore()
    Program.routes.resetContainer()
  }
  assertEquals(lines.filter((line) => line.includes('http.request')), [], 'no false measurement')
})

Deno.test("a pipe that throws ends the request before the interceptor: nothing is measured, and the error response is the framework's", async () => {
  reset()
  const lines: string[] = []
  const warn = stub(
    console,
    'warn',
    (...args: unknown[]) =>
      void lines.push(args.map((arg) => Deno.inspect(arg, { depth: 6 })).join(' ')),
  )
  try {
    Program.routes.resetContainer()
    Program.routes.defineRoute('rest', {
      path: '/throws',
      pipes: [() => {
        throw new Error('pipe failed')
      }],
      handler: () => 'ok' as never,
      interceptors: [createTimingInterceptor({ name: 'throws', slowMs: 1 })],
    })
    const handler = getMainHandler('rest', undefined, '') as any
    const outcome = await handler(new Request('http://localhost/throws')).catch((error: unknown) =>
      error
    )
    assert(outcome instanceof Error || outcome instanceof Response)
  } finally {
    warn.restore()
    Program.routes.resetContainer()
  }
  assertEquals(lines.filter((line) => line.includes('http.request')), [])
})

Deno.test('a pipe that changes the body and params and several chained pipes leave the start untouched', async () => {
  reset()
  Program.routes.resetContainer()
  Program.routes.defineRoute('rest', {
    path: '/pipes/:id',
    httpMethod: 'POST',
    pipes: [
      (ctx: any) => {
        ctx.payload.body = { ...ctx.payload.body, transformed: true }
        note('pipe-1')(ctx)
      },
      (ctx: any) => {
        ctx.locals.chained = true
        note('pipe-2')(ctx)
      },
    ],
    handler: (ctx: any) => (note('handler')(ctx), { body: ctx.payload.body } as never),
    interceptors: [(ctx: any, response: Response) => (note('interceptor')(ctx), response)],
  })
  const handler = getMainHandler('rest', undefined, '') as any
  const response = await handler(
    new Request('http://localhost/pipes/7', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    }),
  )
  assertEquals((await response.json()).body, { a: 1, transformed: true })
  assertEquals(stagesOf(), ['pipe-1', 'pipe-2', 'handler', 'interceptor'])
  assertEquals(new Set(seen.map(({ start }) => start)).size, 1)
  assertEquals(typeof seen[0].start, 'number')
  Program.routes.resetContainer()
})

Deno.test('without the timing registered, the only observable effect of the framework change is one extra key in `locals`', async () => {
  reset()
  Program.routes.resetContainer()
  let keys: string[] = []
  Program.routes.defineRoute('rest', {
    path: '/plain',
    handler: (ctx: any) => {
      keys = Object.keys(ctx.locals)
      return 'ok' as never
    },
  })
  const handler = getMainHandler('rest', undefined, '') as any
  const response = await handler(new Request('http://localhost/plain'))

  assertEquals(await response.text(), 'ok')
  // `guardHeaders` is the framework's own key, written around the handler (`mainInterceptor`).
  assertEquals(keys.sort(), ['guardHeaders', REQUEST_STARTED_AT_LOCALS_KEY].sort())
  assertEquals(response.headers.get('server-timing'), null, 'no header of the timing')
  Program.routes.resetContainer()
})
