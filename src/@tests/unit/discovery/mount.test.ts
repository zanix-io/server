import type { DiscoveryProvider } from 'typings/discovery.ts'
import type { MiddlewareGuard } from 'typings/middlewares.ts'

import { assert, assertEquals } from '@std/assert'
import { compileDiscoveryContract } from 'modules/discovery/provider.ts'
import { buildDiscoveryHandler, compileHttpRuntime } from 'modules/discovery/mount.ts'
import { DISCOVERY_PROTOCOL_HEADER } from 'utils/constants.ts'

Deno.test('compileHttpRuntime: resolves the .well-known/zanix/{resourceType} path', () => {
  const contract = compileDiscoveryContract('templates')
  const runtime = compileHttpRuntime(contract)

  assertEquals(runtime.path, '.well-known/zanix/templates')
})

Deno.test('compileHttpRuntime: pure — identical input produces an equivalent plan', () => {
  const contract = compileDiscoveryContract('templates')

  const first = compileHttpRuntime(contract)
  const second = compileHttpRuntime(contract)

  assertEquals(first.path, second.path)
  assertEquals(first.guards.length, second.guards.length)
  assertEquals(first.interceptors.length, second.interceptors.length)
})

Deno.test('compileHttpRuntime: no guards supplied leaves only the protocol-version guard', () => {
  const runtime = compileHttpRuntime(compileDiscoveryContract('templates'))
  // Only the protocol-version guard this function appends itself — see its own doc: Discovery
  // endpoints are unauthenticated by default when the caller supplies no guards.
  assertEquals(runtime.guards.length, 1)
})

Deno.test(
  'compileHttpRuntime: caller-supplied guards are forwarded, protocol guard appended last',
  () => {
    const callerGuard: MiddlewareGuard = () => ({})
    const runtime = compileHttpRuntime(compileDiscoveryContract('templates'), [callerGuard])

    assertEquals(runtime.guards.length, 2)
    assertEquals(runtime.guards[0], callerGuard)
  },
)

Deno.test(
  'compileHttpRuntime: interceptor stamps the negotiated Discovery protocol header',
  async () => {
    const runtime = compileHttpRuntime(compileDiscoveryContract('templates'))
    const response = new Response(null)

    const stamped = await runtime.interceptors[0](
      { locals: {} } as never,
      response,
    )

    assertEquals(stamped.headers.get(DISCOVERY_PROTOCOL_HEADER), '1')
  },
)

Deno.test(
  'buildDiscoveryHandler: envelope carries resourceType/generatedAt/items, snapshot only',
  async () => {
    const provider: DiscoveryProvider<{ name: string }> = {
      snapshot: () => Promise.resolve([{ name: 'welcome' }]),
    }
    const contract = compileDiscoveryContract('templates')
    const handler = buildDiscoveryHandler(contract, provider)

    const response = await handler({} as never) as Record<string, unknown>

    assertEquals(response.resourceType, 'templates')
    assertEquals(response.items, [{ name: 'welcome' }])
    assert(typeof response.generatedAt === 'string')
    assertEquals(Object.keys(response).sort(), ['generatedAt', 'items', 'resourceType'])
  },
)

Deno.test('buildDiscoveryHandler: works with a provider that has no version()', async () => {
  const provider: DiscoveryProvider<string> = { snapshot: () => Promise.resolve(['a', 'b']) }
  const handler = buildDiscoveryHandler(compileDiscoveryContract('templates'), provider)

  const response = await handler({} as never) as Record<string, unknown>
  assertEquals(response.items, ['a', 'b'])
})
