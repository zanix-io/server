import type { DiscoveryProvider } from 'typings/discovery.ts'

import { assertEquals, assertThrows } from '@std/assert'
import { InternalError } from '@zanix/errors'
import { DiscoveryContainer } from 'modules/program/metadata/discovery.ts'
import { compileDiscoveryContract, DISCOVERY_PROTOCOL_VERSION } from 'modules/discovery/provider.ts'

console.error = () => {}

const noopProvider: DiscoveryProvider<unknown> = {
  snapshot: () => Promise.resolve([]),
}

Deno.test('DiscoveryContainer: define/getProviders round-trips a registration', () => {
  const container = new DiscoveryContainer()

  container.define('main', 'templates', { provider: noopProvider, guards: [] })

  const registered = container.getProviders('main')
  assertEquals(registered.length, 1)
  assertEquals(registered[0][0], 'templates')
  assertEquals(registered[0][1].provider, noopProvider)
})

Deno.test('DiscoveryContainer: scopes registrations per Application', () => {
  const container = new DiscoveryContainer()

  container.define('main', 'templates', { provider: noopProvider, guards: [] })
  container.define('admin', 'triggers', { provider: noopProvider, guards: [] })

  assertEquals(container.getProviders('main').map(([type]) => type), [
    'templates',
  ])
  assertEquals(container.getProviders('admin').map(([type]) => type), [
    'triggers',
  ])
})

Deno.test(
  'DiscoveryContainer: getProviders returns [] for an Application with nothing registered',
  () => {
    const container = new DiscoveryContainer()
    assertEquals(container.getProviders('nobody-registered-here'), [])
  },
)

Deno.test(
  'DiscoveryContainer: throws on a duplicate (application, resourceType) registration',
  () => {
    const container = new DiscoveryContainer()
    container.define('main', 'templates', {
      provider: noopProvider,
      guards: [],
    })

    assertThrows(
      () =>
        container.define('main', 'templates', {
          provider: noopProvider,
          guards: [],
        }),
      InternalError,
      'already defined',
    )
  },
)

Deno.test(
  'DiscoveryContainer: the same resourceType is allowed under two different Applications',
  () => {
    const container = new DiscoveryContainer()
    container.define('main', 'templates', {
      provider: noopProvider,
      guards: [],
    })

    // Should not throw — different Application, same resourceType string.
    container.define('admin', 'templates', {
      provider: noopProvider,
      guards: [],
    })

    assertEquals(container.getProviders('main').length, 1)
    assertEquals(container.getProviders('admin').length, 1)
  },
)

Deno.test('compileDiscoveryContract: pure — identical input produces identical output', () => {
  const first = compileDiscoveryContract('templates')
  const second = compileDiscoveryContract('templates')

  assertEquals(first, second)
  assertEquals(first, {
    resourceType: 'templates',
    protocolVersion: DISCOVERY_PROTOCOL_VERSION,
  })
})

Deno.test('compileDiscoveryContract: resourceType is carried through unchanged', () => {
  assertEquals(compileDiscoveryContract('triggers').resourceType, 'triggers')
})
