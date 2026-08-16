import { assertEquals, assertThrows } from '@std/assert'
import { InternalProgram as ProgramClass } from 'modules/program/mod.ts'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { InternalError } from '@zanix/errors'

console.error = () => {}

/**
 * `RouteContainer.defineTargetRoutes`'s uniqueness key is `${application}:${path}/${httpMethod}`
 * — `application` participates in it, not just stored as metadata — so two DIFFERENT
 * Applications registering the same path/method no longer collide; each keeps its own entry.
 *
 * Uses the decorated-`Target` registration path (`setEndpoint`/`targets.addProperty` +
 * `defineRoute('rest', Target, applicationOverride)`), same as the existing same-Application
 * collision test (`integration/routes.test.ts`) — the raw `{path, handler}` object form of
 * `defineRoute` has NO collision check at all (it's a plain upsert, used only by the lazy-
 * registration escape hatch), so it can't stand in for this case.
 */
Deno.test(
  'defineRoute: two DIFFERENT Applications registering the same path/method do NOT collide — each keeps its own route',
  () => {
    const program = new ProgramClass()

    class BillingHealthController extends TargetBaseClass {}
    class InventoryHealthController extends TargetBaseClass {}

    program.routes.setEndpoint({
      Target: BillingHealthController,
      endpoint: '',
    })
    program.routes.setEndpoint({
      Target: BillingHealthController,
      propertyKey: 'health',
      endpoint: '/health',
    })
    program.targets.addProperty({
      Target: BillingHealthController,
      propertyKey: 'health',
    })

    program.routes.setEndpoint({
      Target: InventoryHealthController,
      endpoint: '',
    })
    program.routes.setEndpoint({
      Target: InventoryHealthController,
      propertyKey: 'health',
      endpoint: '/health',
    })
    program.targets.addProperty({
      Target: InventoryHealthController,
      propertyKey: 'health',
    })

    // Neither call throws — this is the assertion itself; a throw fails the test.
    program.routes.defineRoute('rest', BillingHealthController, 'billing')
    program.routes.defineRoute('rest', InventoryHealthController, 'inventory')

    const routes = program.routes.getRoutes('rest')
    assertEquals(routes?.['billing:/health/GET']?.application, 'billing')
    assertEquals(routes?.['inventory:/health/GET']?.application, 'inventory')
  },
)

/**
 * Same-Application collision detection is unaffected — two DIFFERENT classes registering the
 * same path/method under the SAME Application still collide, exactly as before.
 */
Deno.test(
  'defineRoute: two classes registering the same path/method under the SAME Application still collide',
  () => {
    const program = new ProgramClass()

    class FirstController extends TargetBaseClass {}
    class SecondController extends TargetBaseClass {}

    for (const Target of [FirstController, SecondController]) {
      program.routes.setEndpoint({ Target, endpoint: '' })
      program.routes.setEndpoint({
        Target,
        propertyKey: 'health',
        endpoint: '/health',
      })
      program.targets.addProperty({ Target, propertyKey: 'health' })
    }

    program.routes.defineRoute('rest', FirstController, 'billing')

    assertThrows(
      () => program.routes.defineRoute('rest', SecondController, 'billing'),
      InternalError,
      'Application "billing"',
    )
  },
)
