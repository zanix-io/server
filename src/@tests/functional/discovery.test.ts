import type { DiscoveryProvider } from 'typings/discovery.ts'

import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'
import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import ProgramModule from 'modules/program/public.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { DISCOVERY_PROTOCOL_HEADER } from 'utils/constants.ts'

stub(console, 'info')

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    'Discovery: a snapshot()-only provider is served at /.well-known/zanix/{resourceType}, envelope + protocol header',
  fn: async () => {
    const provider: DiscoveryProvider<{ name: string }> = {
      snapshot: () => Promise.resolve([{ name: 'welcome' }, { name: 'password-reset' }]),
    }

    await ProgramModule.defineApplication(DEFAULT_APPLICATION, () => {
      ProgramModule.defineDiscovery('e2e-templates', provider)
    })

    const servers = await bootstrapServers({ rest: { port: 1450 } })
    assert(servers.length > 0, 'a REST server should have started for the registered provider')

    const info = webServerManager.info(servers[0])
    assert(info.addr, 'the server should be listening')

    const res = await fetch(
      `http://${info.addr.hostname}:${info.addr.port}/api/.well-known/zanix/e2e-templates`,
    )
    assertEquals(res.status, 200)
    assertEquals(res.headers.get(DISCOVERY_PROTOCOL_HEADER), '1')

    const body = await res.json()
    assertEquals(body.resourceType, 'e2e-templates')
    assertEquals(body.items, [{ name: 'welcome' }, { name: 'password-reset' }])
    assert(typeof body.generatedAt === 'string')
    assertEquals(Object.keys(body).sort(), ['generatedAt', 'items', 'resourceType'])

    await webServerManager.stop(servers)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Discovery: a provider with no guards is reachable without any auth header',
  fn: async () => {
    const provider: DiscoveryProvider<unknown> = { snapshot: () => Promise.resolve([]) }

    await ProgramModule.defineApplication(DEFAULT_APPLICATION, () => {
      ProgramModule.defineDiscovery('e2e-no-auth', provider)
    })

    const servers = await bootstrapServers({ rest: { port: 1451 } })
    const info = webServerManager.info(servers[0])

    const res = await fetch(
      `http://${info.addr?.hostname}:${info.addr?.port}/api/.well-known/zanix/e2e-no-auth`,
    )
    assertEquals(res.status, 200)
    await res.body?.cancel()

    await webServerManager.stop(servers)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Discovery: an unrecognized declared protocol version is rejected with 400',
  fn: async () => {
    const provider: DiscoveryProvider<unknown> = { snapshot: () => Promise.resolve([]) }

    await ProgramModule.defineApplication(DEFAULT_APPLICATION, () => {
      ProgramModule.defineDiscovery('e2e-version-check', provider)
    })

    const servers = await bootstrapServers({ rest: { port: 1452 } })
    const info = webServerManager.info(servers[0])

    const res = await fetch(
      `http://${info.addr?.hostname}:${info.addr?.port}/api/.well-known/zanix/e2e-version-check`,
      { headers: { [DISCOVERY_PROTOCOL_HEADER]: '999' } },
    )
    assertEquals(res.status, 400)
    await res.body?.cancel()

    await webServerManager.stop(servers)
  },
})
