import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'

stub(console, 'info')

// No `ProgramModule.defineApplication` wrapper — registers under the DEFAULT Application, exactly
// matching `bootstrapServers({ health: false })`'s own implicit target below (no `application`
// named on either side).
@Controller()
class _AutoDiscoveryHealthProbeController extends ZanixController {
  @Get('/orders')
  public list() {
    return { orders: [] }
  }
}

/**
 * Regression for a real bug: `hasExplicitServerConfig` used to be `Object.keys(server).length >
 * 0` — since `health` is a sibling key on the SAME object as `rest`/`graphql`/`socket`/`ssr`,
 * setting `server.health` at all (even matching the default, `health: true`) made this `true`
 * even though no TYPE was actually named, which then made `shouldServeType` reject every real
 * type (none of them were in the "named types" set). Net effect: `bootstrapServers({ health:
 * false })` — "auto-discover everything, just skip health" — silently discovered NOTHING at all.
 * Fixed by checking only `applications`'s own keys (the 4 real `WebServerTypes`), never `health`
 * or any other future sibling field.
 */
Deno.test(
  'health: setting only `health` (no type named) still auto-discovers everything else',
  async () => {
    const servers = await bootstrapServers({ health: false })

    try {
      assertEquals(servers.length, 1)
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the auto-discovered REST server should be listening')
      const base = `http://${addr.hostname}:${addr.port}`

      const orders = await fetch(`${base}/api/orders`)
      assertEquals(orders.status, 200)
      assertEquals(await orders.json(), { orders: [] })

      const health = await fetch(`${base}/health`)
      assertEquals(health.status, 404)
      await health.body?.cancel()
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
