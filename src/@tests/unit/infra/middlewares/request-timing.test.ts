import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertMatch,
  assertStrictEquals,
} from '@std/assert'
import { InternalError } from '@zanix/errors'
import { REQUEST_STARTED_AT_LOCALS_KEY } from 'utils/constants.ts'
import ProgramModule from 'modules/program/mod.ts'
import {
  createTimingInterceptor,
  DEFAULT_REQUEST_TIMING_MAX_LOGS_PER_SECOND,
  REQUEST_TIMING_LABEL,
  type RequestTimingLogger,
  type TimingInterceptorOptions,
} from 'modules/infra/middlewares/request-timing.ts'

import type { HandlerContext } from 'typings/context.ts'

// The interceptor works alone: it reads the request's start from
// `ctx.locals[REQUEST_STARTED_AT_LOCALS_KEY]`, which the dispatcher writes when it creates the
// context. These tests give it a context that has one, and a
// clock they move by hand. The logger fake keeps the one semantic that matters: a timer reports
// `clock() at stop - clock() at start`, so the duration the interceptor computes is what is logged.

const createClock = () => {
  let now = 1000
  return { read: () => now, add: (ms: number) => void (now += ms) }
}

type LoggedEntry = {
  label: string
  level: string
  durationMs: number
  data: Record<string, unknown>
}

const fakeLogger = (enabled: (level: string) => boolean = () => true) => {
  const entries: LoggedEntry[] = []
  let timers = 0
  const log: RequestTimingLogger = {
    isLevelEnabled: (level) => enabled(level),
    timer: (label, options = {}) => {
      timers++
      const clock = options.clock ?? (() => 0)
      const start = clock()
      return {
        elapsed: () => clock() - start,
        stop: (metadata) => {
          const durationMs = Math.round((clock() - start) * 100) / 100
          entries.push({
            label,
            level: options.level ?? 'debug',
            durationMs,
            data: { ...options.metadata, ...metadata },
          })
          return durationMs
        },
        [Symbol.dispose]: () => {},
      }
    },
  }
  return { log, entries, timersStarted: () => timers }
}

/** A context as the dispatcher builds it: the start is written into `locals`. */
const context = (startedAt: number | undefined, init?: RequestInit, id?: string) => {
  const url = 'http://localhost/users/42?token=secret'
  const locals: Record<string, unknown> = {}
  if (startedAt !== undefined) locals[REQUEST_STARTED_AT_LOCALS_KEY] = startedAt
  const ctx = { id: id ?? 'ctx-1', req: new Request(url, init), url: new URL(url), locals }
  return ctx as unknown as HandlerContext
}

const build = (extra: Partial<TimingInterceptorOptions> = {}) => {
  const clock = createClock()
  const logger = fakeLogger()
  const interceptor = createTimingInterceptor({
    name: 'users.get',
    slowMs: 100,
    log: logger.log,
    clock: clock.read,
    ...extra,
  })
  /** A request that started now and took `takes` ms, answered with `response`. */
  const request = (takes: number, response?: Response, init?: RequestInit, id?: string) => {
    const answered = response ?? new Response('body')
    const ctx = context(clock.read(), init, id)
    clock.add(takes)
    return { ctx, response: answered, result: interceptor(ctx, answered) as Response }
  }
  return { interceptor, clock, request, ...logger }
}

// -- validation ----------------------------------------------------------------------------

Deno.test('createTimingInterceptor: every invalid option is a loud InternalError naming the problem', () => {
  const cases: Array<[string, Partial<TimingInterceptorOptions>, string]> = [
    ['no name', { name: undefined as never }, '`name`'],
    ['an empty name', { name: '  ' }, '`name`'],
    ['no budget', { slowMs: undefined as never }, '`slowMs`'],
    ['a zero budget', { slowMs: 0 }, '`slowMs`'],
    ['a negative budget', { slowMs: -5 }, '`slowMs`'],
    ['a budget that is not a number', { slowMs: NaN }, '`slowMs`'],
    ['a `logAll` that is not a boolean', { logAll: 'all' as never }, '`logAll`'],
    ['a numeric `logAll`', { logAll: 1 as never }, '`logAll`'],
    ['a null `logAll`', { logAll: null as never }, '`logAll`'],
    ['a cap of zero', { maxLogsPerSecond: 0 }, '`maxLogsPerSecond`'],
    ['a fractional cap', { maxLogsPerSecond: 2.5 }, '`maxLogsPerSecond`'],
  ]

  for (const [label, options, expected] of cases) {
    let thrown: unknown
    try {
      createTimingInterceptor({ name: 'x', slowMs: 10, ...options })
    } catch (error) {
      thrown = error
    }
    assertInstanceOf(thrown, InternalError, label)
    assert(thrown.message.includes(expected), `${label}: ${thrown.message}`)
    assertEquals((thrown.meta as { method: string }).method, 'createTimingInterceptor')
  }
  assertEquals(DEFAULT_REQUEST_TIMING_MAX_LOGS_PER_SECOND, 10)
})

// -- the budget ----------------------------------------------------------------------------

Deno.test('a request under its budget logs nothing', () => {
  const { request, entries, timersStarted } = build()
  request(99.9)
  assertEquals(entries, [])
  assertEquals(timersStarted(), 0)
})

Deno.test('a request at or over its budget is logged once, at warn, with exactly these fields', () => {
  const { request, entries } = build()

  request(100, new Response('x', { status: 201 }))

  assertEquals(entries.length, 1)
  assertEquals(entries[0], {
    label: REQUEST_TIMING_LABEL,
    level: 'warn',
    durationMs: 100,
    data: {
      method: 'GET',
      handler: 'users.get',
      httpStatus: 201,
      contextId: 'ctx-1',
      slowMs: 100,
    },
  })
})

Deno.test('an entry carries no URL, body, header, cookie, query string or session: the field list is closed', () => {
  const { interceptor, clock, entries } = build()
  const ctx = context(clock.read(), {
    method: 'POST',
    headers: { authorization: 'Bearer abc', cookie: 'sid=xyz' },
    body: JSON.stringify({ message: 'private' }),
  })
  ;(ctx as unknown as { session: unknown }).session = { id: 'user-9' }
  clock.add(500)

  interceptor(ctx, new Response('x'))

  assertEquals(Object.keys(entries[0].data).sort(), [
    'contextId',
    'handler',
    'httpStatus',
    'method',
    'slowMs',
  ])
  const everything = JSON.stringify(entries)
  for (
    const secret of [
      '/users/42',
      'token=',
      'secret',
      'Bearer',
      'abc',
      'sid=',
      'xyz',
      'private',
      'user-9',
    ]
  ) {
    assertEquals(everything.includes(secret), false, secret)
  }
})

Deno.test('a slow response with an error status is recorded by its status, with no message', () => {
  const { request, entries } = build()

  request(
    400,
    new Response(JSON.stringify({ message: 'database password rejected' }), { status: 500 }),
  )

  assertEquals(entries[0].data.httpStatus, 500)
  assertEquals(JSON.stringify(entries).includes('password'), false)
})

Deno.test('two interceptors for two routes keep their own name and budget', () => {
  const clock = createClock()
  const logger = fakeLogger()
  const light = createTimingInterceptor({
    name: 'light',
    slowMs: 50,
    log: logger.log,
    clock: clock.read,
  })
  const heavy = createTimingInterceptor({
    name: 'heavy',
    slowMs: 2000,
    log: logger.log,
    clock: clock.read,
  })

  for (const interceptor of [light, heavy]) {
    const ctx = context(clock.read())
    clock.add(300)
    interceptor(ctx, new Response('x'))
  }

  assertEquals(logger.entries.map(({ data }) => [data.handler, data.slowMs]), [['light', 50]])
})

// -- no start, no measurement ---------------------------------------------------------------

Deno.test('a context with no start is not measured: nothing logged, nothing added, the same response back', () => {
  const { interceptor, entries, timersStarted } = build({ serverTiming: true, logAll: true })
  const response = new Response('untouched')

  const result = interceptor(context(undefined), response)

  assertStrictEquals(result, response)
  assertEquals(response.headers.get('Server-Timing'), null)
  assertEquals(entries, [])
  assertEquals(timersStarted(), 0)
})

Deno.test('a start that is not a usable number is ignored: no measurement is invented', () => {
  for (const bad of ['1000', NaN, Infinity, null, {}, 5000 /* in the future of this clock */]) {
    const { interceptor, entries, timersStarted } = build({ serverTiming: true, logAll: true })
    const ctx = context(undefined)
    ;(ctx.locals as Record<string, unknown>)[REQUEST_STARTED_AT_LOCALS_KEY] = bad
    const response = new Response('x')

    const result = interceptor(ctx, response)

    assertStrictEquals(result, response, String(bad))
    assertEquals(response.headers.get('Server-Timing'), null, String(bad))
    assertEquals(entries, [], String(bad))
    assertEquals(timersStarted(), 0, String(bad))
  }
})

Deno.test('a context whose `locals` was replaced or removed degrades without throwing', () => {
  const { interceptor, entries } = build({ serverTiming: true })
  const replaced = context(1000)
  replaced.locals = { other: 1 }
  const removed = context(1000) as unknown as { locals?: unknown }
  delete removed.locals

  assertEquals((interceptor(replaced, new Response('x')) as Response).status, 200)
  assertEquals((interceptor(removed as HandlerContext, new Response('x')) as Response).status, 200)
  assertEquals(entries, [])
})

// -- logAll ----------------------------------------------------------------------------------

Deno.test('`logAll` false (the default) logs nothing for a request under budget', () => {
  const { request, entries } = build()
  request(5)
  assertEquals(entries, [])
})

Deno.test('`logAll: true` logs a request under budget at debug, and an over-budget one at warn only', () => {
  const { request, entries } = build({ logAll: true })

  request(5)
  request(250)

  assertEquals(entries.map(({ level, durationMs }) => [level, durationMs]), [
    ['debug', 5],
    ['warn', 250],
  ])
})

// -- the cap -------------------------------------------------------------------------------

Deno.test('over-budget entries are capped per second, and the next one reports what was dropped', () => {
  const { request, entries, clock } = build({ maxLogsPerSecond: 2 })

  for (let i = 0; i < 5; i++) request(200)
  assertEquals(entries.length, 2, 'two persisted in the first second, three dropped')
  assertEquals('suppressed' in entries[0].data, false)

  clock.add(1500)
  request(200)
  assertEquals(entries.length, 3)
  assertEquals(entries[2].data.suppressed, 3)

  request(200)
  assertEquals('suppressed' in entries[3].data, false, 'the count is reported once')
})

Deno.test('the cap does not hide a request under budget with `logAll: true`, and drops go to debug', () => {
  const { request, entries } = build({ maxLogsPerSecond: 1, logAll: true })

  request(200)
  request(200)
  request(1)

  assertEquals(entries.map(({ level }) => level), ['warn', 'debug', 'debug'])
})

// -- the logger's level ----------------------------------------------------------------------

Deno.test('with warn and debug dropped nothing is measured: no clock read, no timer, the same response', () => {
  let clockReads = 0
  const logger = fakeLogger((level) => level !== 'warn' && level !== 'debug')
  const interceptor = createTimingInterceptor({
    name: 'x',
    slowMs: 1,
    logAll: true,
    log: logger.log,
    clock: () => ++clockReads,
  })
  const response = new Response('ok')

  const result = interceptor(context(0), response)

  assertStrictEquals(result, response)
  assertEquals(clockReads, 0)
  assertEquals(logger.timersStarted(), 0)
})

Deno.test('`logAll: true` asks for debug, an over-budget entry for warn: each level is checked on its own', () => {
  const clock = createClock()
  const logger = fakeLogger((level) => level === 'warn')
  const interceptor = createTimingInterceptor({
    name: 'x',
    slowMs: 10,
    logAll: true,
    log: logger.log,
    clock: clock.read,
  })

  for (const takes of [5, 50]) {
    const ctx = context(clock.read())
    clock.add(takes)
    interceptor(ctx, new Response('ok'))
  }

  assertEquals(logger.entries.map(({ level }) => level), ['warn'], 'debug is dropped, warn is kept')
})

// -- Server-Timing -------------------------------------------------------------------------

Deno.test('Server-Timing is off by default, and carries the total only when asked for', () => {
  assertEquals(build().request(50).result.headers.get('Server-Timing'), null)
  assertEquals(
    build({ serverTiming: true }).request(12.345).result.headers.get('Server-Timing'),
    'total;dur=12.35',
  )
})

Deno.test('Server-Timing keeps a header the application set, and works with nothing logged', () => {
  const { request, entries } = build({ serverTiming: true })

  const { result } = request(5, new Response('x', { headers: { 'Server-Timing': 'db;dur=3' } }))

  assertMatch(result.headers.get('Server-Timing') ?? '', /^db;dur=3, total;dur=5$/)
  assertEquals(entries, [])
})

Deno.test('Server-Timing: a response with immutable headers keeps its status and its stream', async () => {
  const { request } = build({ serverTiming: true })
  const redirect = request(8, Response.redirect('http://localhost/elsewhere', 302)).result
  assertEquals(redirect.status, 302)
  assertEquals(redirect.headers.get('location'), 'http://localhost/elsewhere')
  assertEquals(redirect.headers.get('Server-Timing'), 'total;dur=8')

  const stream = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a;'))
        controller.enqueue(new TextEncoder().encode('b'))
        controller.close()
      },
    }),
    { headers: Response.redirect('http://localhost/x', 302).headers },
  )
  const streamed = request(3, stream).result
  assertEquals(await streamed.text(), 'a;b')
  assertEquals(streamed.headers.get('Server-Timing'), 'total;dur=3')
})

// -- robustness ----------------------------------------------------------------------------

Deno.test('a logger that fails never changes the response', () => {
  const clock = createClock()
  const broken: RequestTimingLogger = {
    isLevelEnabled: () => true,
    timer: () => {
      throw new Error('logger down')
    },
  }
  const interceptor = createTimingInterceptor({
    name: 'x',
    slowMs: 1,
    log: broken,
    clock: clock.read,
    serverTiming: true,
  })
  const ctx = context(clock.read())
  clock.add(30)
  const response = new Response('ok')

  const result = interceptor(ctx, response) as Response

  assertStrictEquals(result, response)
  assertEquals(result.status, 200)
  assertEquals(result.headers.get('Server-Timing'), 'total;dur=30')
})

Deno.test('concurrent requests through one interceptor never share a measurement', () => {
  const { interceptor, clock, entries } = build({ slowMs: 10 })

  const first = context(clock.read(), {}, 'first') // starts at 1000
  clock.add(100)
  const second = context(clock.read(), {}, 'second') // starts at 1100
  clock.add(40)
  interceptor(second, new Response('b', { status: 201 })) // 40 ms
  clock.add(60)
  interceptor(first, new Response('a')) // 200 ms

  assertEquals(
    entries.map(({ durationMs, data }) => [data.contextId, durationMs, data.httpStatus]),
    [['second', 40, 201], ['first', 200, 200]],
  )
})

// -- no residue ----------------------------------------------------------------------------

Deno.test('the interceptor leaves nothing on the request: no key added to its context or its locals, the start stays', () => {
  const { interceptor, clock } = build()
  const ctx = context(clock.read())
  const keys = Object.keys(ctx).sort()
  clock.add(500)

  interceptor(ctx, new Response('x'))

  assertEquals(Object.keys(ctx).sort(), keys)
  assertEquals(Object.keys(ctx.locals), [REQUEST_STARTED_AT_LOCALS_KEY])
})

Deno.test('two interceptors share nothing: each has its own cap and its own logger', () => {
  const one = build({ maxLogsPerSecond: 1 })
  const two = build({ maxLogsPerSecond: 1 })

  for (let i = 0; i < 3; i++) one.request(200)
  two.request(200)

  assertEquals(one.entries.length, 1)
  assertEquals(two.entries.length, 1)
})

Deno.test('building and using one registers nothing and leaves no timer or listener behind', () => {
  const types = ['rest', 'ssr', 'graphql', 'socket'] as const
  const sizes = () =>
    types.map((type) => {
      const { guards, pipes, interceptors } = ProgramModule.middlewares.getMiddlewares(type)
      return [guards.size, pipes.size, interceptors.size]
    })
  const before = sizes()

  const { request } = build({ logAll: true, serverTiming: true })
  for (let i = 0; i < 20; i++) request(200)

  assertEquals(sizes(), before, 'creating it is not registering it')
  assertEquals(before, types.map(() => [0, 0, 0]), 'no default global middleware exists at all')
  // Deno's own test sanitizers (on by default) fail this test if a timer, a listener or an open
  // resource outlives it: the cap's window is timestamps, not a `setInterval`.
})
