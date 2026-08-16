import { assert } from '@std/assert'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import { registerApplicationMount } from 'modules/webserver/application-mount-registry.ts'
import Program from 'modules/program/mod.ts'

console.info = () => {}

/**
 * End-to-end: two different Applications both register `GET /health`, each with its own mount
 * prefix — `routeProcessor` composes each one's final, externally-exposed path independently, so
 * neither ever collides with the other despite sharing the same original path.
 */
Deno.test(
  'routeProcessor: two Applications with the same route path resolve to independently-mounted, non-colliding paths',
  () => {
    registerApplicationMount('billing', '/billing')
    registerApplicationMount('inventory', '/inventory')

    Program.routes.defineRoute(
      'rest',
      { path: '/health', handler: () => '' as never },
      'billing',
    )
    Program.routes.defineRoute(
      'rest',
      { path: '/health', handler: () => '' as never },
      'inventory',
    )

    const billing = routeProcessor('rest', 'billing')
    const inventory = routeProcessor('rest', 'inventory')

    assert(billing.absolutePaths['/billing/health/GET'])
    assert(billing.routePaths.absolute.has('/billing/health'))
    assert(inventory.absolutePaths['/inventory/health/GET'])
    assert(inventory.routePaths.absolute.has('/inventory/health'))

    // Neither result carries the other Application's mounted path — proves it's not just "both
    // happen to be present somewhere", each call is scoped to exactly its own Application.
    assert(!billing.absolutePaths['/inventory/health/GET'])
    assert(!inventory.absolutePaths['/billing/health/GET'])

    Program.routes.resetContainer()
  },
)

/**
 * An Application that never registers a mount prefix keeps today's unprefixed behavior exactly —
 * the additive/zero-cost guarantee for anything that doesn't opt into mounting.
 */
Deno.test(
  'routeProcessor: an Application with no registered mount prefix stays unprefixed',
  () => {
    Program.routes.defineRoute(
      'rest',
      { path: '/status', handler: () => '' as never },
      'unmounted-app',
    )

    const { absolutePaths, routePaths } = routeProcessor(
      'rest',
      'unmounted-app',
    )

    assert(absolutePaths['/status/GET'])
    assert(routePaths.absolute.has('/status'))

    Program.routes.resetContainer()
  },
)
