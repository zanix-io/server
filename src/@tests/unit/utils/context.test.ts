import { assertEquals, assertMatch } from '@std/assert'
import { assertSpyCalls, spy } from '@std/testing/mock'
import { UUID_REGEX } from '@zanix/regex'
import { contextId, payloadAccessorDefinition, processScopedPayload } from 'utils/context.ts'
import { pathToRegex } from 'utils/routes.ts'

Deno.test('processScopedPayload: body accessor reads from the payload body by key', () => {
  const scoped = processScopedPayload({
    params: { id: '1' },
    search: { q: 'x' },
    body: { name: 'ismael' },
  } as never)

  assertEquals((scoped.body as (key: string) => unknown)('name'), 'ismael')
})

Deno.test('contextId should return a correct uuid', () => {
  assertMatch(contextId(), UUID_REGEX)
})

// --- payloadAccessorDefinition: case-preserved param VALUES -------------------------------------

Deno.test(
  'payloadAccessorDefinition: a single ordinary :param reads its case-preserved VALUE from ' +
    "getRawPath()'s result, not the lowercased match",
  () => {
    const regex = pathToRegex('/files/:name/GET')
    const path = '/files/readme/GET' // Lowercased — what real request-path matching runs against.
    const rawPath = '/files/README/GET' // Case-preserved mirror of the SAME request.
    const match = regex.exec(path) as RegExpExecArray

    const payload = {} as Record<string, unknown>
    Object.defineProperty(
      payload,
      'params',
      payloadAccessorDefinition(match, ['name'], () => rawPath),
    )

    assertEquals(payload.params, { name: 'README' })
  },
)

Deno.test(
  'payloadAccessorDefinition: every param in a multi-param route independently preserves its ' +
    'own real casing — no bleed-over between params',
  () => {
    const regex = pathToRegex('/triggers/:serviceId/:model/GET')
    const path = '/triggers/billing/invoice/GET'
    const rawPath = '/triggers/Billing/Invoice/GET'
    const match = regex.exec(path) as RegExpExecArray

    const payload = {} as Record<string, unknown>
    Object.defineProperty(
      payload,
      'params',
      payloadAccessorDefinition(match, ['serviceId', 'model'], () => rawPath),
    )

    assertEquals(payload.params, { serviceId: 'Billing', model: 'Invoice' })
  },
)

Deno.test(
  'payloadAccessorDefinition: a catch-all (:name*) param is unaffected by this change — same ' +
    'case-preserved value extraction as before, via the same uniform mechanism',
  () => {
    const regex = pathToRegex('/assets/:path*/GET')
    const path = '/assets/icons/logo.svg/GET'
    const rawPath = '/assets/Icons/Logo.svg/GET'
    const match = regex.exec(path) as RegExpExecArray

    const payload = {} as Record<string, unknown>
    Object.defineProperty(
      payload,
      'params',
      payloadAccessorDefinition(match, ['path'], () => rawPath),
    )

    assertEquals(payload.params, { path: 'Icons/Logo.svg' })
  },
)

Deno.test(
  'payloadAccessorDefinition: without a getRawPath (e.g. a route with zero params), falls back ' +
    'to whatever match itself captured — the lowercased request path, in real use',
  () => {
    const regex = pathToRegex('/files/:name/GET')
    // `pathToRegex`'s own capture group is case-agnostic (its character class allows both cases) —
    // what makes real request matching case-insensitive is that `getMainHandler` always matches
    // against an already-lowercased path, never anything `payloadAccessorDefinition` itself does.
    // Mirroring that here (rather than matching against a mixed-case path) is what actually proves
    // the fallback path used in production.
    const path = '/files/readme/GET'
    const match = regex.exec(path) as RegExpExecArray

    const payload = {} as Record<string, unknown>
    Object.defineProperty(payload, 'params', payloadAccessorDefinition(match, ['name']))

    assertEquals(payload.params, { name: 'readme' })
  },
)

Deno.test(
  'payloadAccessorDefinition: the computed params object is cached — reading it twice does not ' +
    're-slice rawPath, nor call getRawPath a second time',
  () => {
    const regex = pathToRegex('/files/:name/GET')
    const match = regex.exec('/files/readme/GET') as RegExpExecArray
    const getRawPath = spy(() => '/files/README/GET')

    const payload = {} as Record<string, unknown>
    Object.defineProperty(
      payload,
      'params',
      payloadAccessorDefinition(match, ['name'], getRawPath),
    )

    const first = payload.params
    const second = payload.params
    assertEquals(first, second)
    assertEquals(first === second, true)
    // Called at most once total, even across two reads AND (implicitly, via the loop inside the
    // getter) two params in the multi-param case — never once per param, never once per read.
    assertSpyCalls(getRawPath, 1)
  },
)

Deno.test(
  'payloadAccessorDefinition: getRawPath is a THUNK, never invoked eagerly — only if/when ' +
    '`params` is actually read',
  () => {
    const regex = pathToRegex('/files/:name/GET')
    const match = regex.exec('/files/readme/GET') as RegExpExecArray
    const getRawPath = spy(() => '/files/README/GET')

    const payload = {} as Record<string, unknown>
    Object.defineProperty(
      payload,
      'params',
      payloadAccessorDefinition(match, ['name'], getRawPath),
    )

    // `params` is deliberately never read here.
    assertSpyCalls(getRawPath, 0)
  },
)
