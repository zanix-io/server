import { assert, assertEquals } from '@std/assert'

import {
  buildLivenessHandler,
  buildReadinessHandler,
  resolveHealthOptions,
} from 'modules/webserver/health.ts'

console.error = () => {}

const fakeInfo = {} as Deno.ServeHandlerInfo<Deno.NetAddr>
const call = async (
  handler: (
    req: Request,
    info: typeof fakeInfo,
  ) => Response | Promise<Response>,
) => {
  const response = await handler(
    new Request('http://localhost/probe'),
    fakeInfo,
  )
  return { status: response.status, body: await response.json() }
}

Deno.test('resolveHealthOptions: false disables the feature', () => {
  assertEquals(resolveHealthOptions(false), undefined)
})

Deno.test('resolveHealthOptions: undefined/true resolve to full defaults', () => {
  const expected = { path: '/health', readyPath: '/ready', checks: {} }
  assertEquals(resolveHealthOptions(undefined), expected)
  assertEquals(resolveHealthOptions(true), expected)
})

Deno.test('resolveHealthOptions: an object overrides only what it sets', () => {
  const resolved = resolveHealthOptions({ path: '/healthz' })
  assertEquals(resolved, { path: '/healthz', readyPath: '/ready', checks: {} })
})

Deno.test('resolveHealthOptions: checks are passed through as-is', () => {
  const checks = { redis: () => true }
  const resolved = resolveHealthOptions({ checks })
  assertEquals(resolved?.checks, checks)
})

Deno.test('buildLivenessHandler: always 200, never runs a check', async () => {
  const { status, body } = await call(buildLivenessHandler())
  assertEquals(status, 200)
  assertEquals(body, { status: 'ok' })
})

Deno.test(
  'buildReadinessHandler: no connectors, no apps -> 200 with empty shared/apps',
  async () => {
    const { status, body } = await call(buildReadinessHandler(new Map()))
    assertEquals(status, 200)
    assertEquals(body, {
      status: 'ok',
      shared: { status: 'ok', checks: {} },
      apps: {},
    })
  },
)

Deno.test('buildReadinessHandler: every custom check passing -> 200', async () => {
  const { status, body } = await call(
    buildReadinessHandler(
      new Map([['main', { a: () => true, b: () => Promise.resolve(true) }]]),
    ),
  )
  assertEquals(status, 200)
  assertEquals(body, {
    status: 'ok',
    shared: { status: 'ok', checks: {} },
    apps: { main: { status: 'ok', checks: { a: true, b: true } } },
  })
})

Deno.test(
  'buildReadinessHandler: a custom check receives a HealthCheckContext with providers/connectors getters',
  async () => {
    let receivedContext: unknown
    const { status, body } = await call(
      buildReadinessHandler(
        new Map([['main', {
          probe: (context) => {
            receivedContext = context
            return true
          },
        }]]),
      ),
    )
    assertEquals(status, 200)
    assertEquals(body, {
      status: 'ok',
      shared: { status: 'ok', checks: {} },
      apps: { main: { status: 'ok', checks: { probe: true } } },
    })
    assert(
      typeof (receivedContext as { providers?: { get?: unknown } })?.providers
        ?.get === 'function',
    )
    assert(
      typeof (receivedContext as { connectors?: { get?: unknown } })?.connectors
        ?.get ===
        'function',
    )
  },
)

Deno.test('buildReadinessHandler: one custom check failing -> 503, degraded', async () => {
  const { status, body } = await call(
    buildReadinessHandler(
      new Map([['main', { good: () => true, bad: () => false }]]),
    ),
  )
  assertEquals(status, 503)
  assertEquals(body, {
    status: 'degraded',
    shared: { status: 'ok', checks: {} },
    apps: { main: { status: 'degraded', checks: { good: true, bad: false } } },
  })
})

Deno.test(
  'buildReadinessHandler: a throwing check counts as false, never crashes the handler',
  async () => {
    const { status, body } = await call(
      buildReadinessHandler(
        new Map([['main', {
          throws: () => {
            throw new Error('boom')
          },
        }]]),
      ),
    )
    assertEquals(status, 503)
    assertEquals(body, {
      status: 'degraded',
      shared: { status: 'ok', checks: {} },
      apps: { main: { status: 'degraded', checks: { throws: false } } },
    })
  },
)

Deno.test(
  'buildReadinessHandler: a rejecting async check counts as false, never crashes the handler',
  async () => {
    const { status, body } = await call(
      buildReadinessHandler(
        new Map([['main', {
          rejects: () => Promise.reject(new Error('boom')),
        }]]),
      ),
    )
    assertEquals(status, 503)
    assertEquals(body, {
      status: 'degraded',
      shared: { status: 'ok', checks: {} },
      apps: { main: { status: 'degraded', checks: { rejects: false } } },
    })
  },
)

Deno.test(
  'buildReadinessHandler: two Applications sharing a port each report their own checks, independently',
  async () => {
    const { status, body } = await call(
      buildReadinessHandler(
        new Map([
          ['app-a', { a: () => true }],
          ['app-b', { b: () => false }],
        ]),
      ),
    )
    assertEquals(status, 503)
    assertEquals(body, {
      status: 'degraded',
      shared: { status: 'ok', checks: {} },
      apps: {
        'app-a': { status: 'ok', checks: { a: true } },
        'app-b': { status: 'degraded', checks: { b: false } },
      },
    })
  },
)
