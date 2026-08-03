import { assert, assertEquals } from '@std/assert'
import { InternalProgram as ProgramClass } from 'modules/program/mod.ts'
import { TargetBaseClass } from 'modules/infra/base/target.ts'

Deno.test(
  "RouteContainer.resetExceptApplications() removes every route EXCEPT the given (preserved) Applications'",
  () => {
    const program = new ProgramClass()

    program.routes.defineRoute('rest', {
      path: '/admin-route',
      handler: () => '' as never,
    }, 'admin')
    program.routes.defineRoute('rest', {
      path: '/hub-route',
      handler: () => '' as never,
    }, 'admin-hub')
    program.routes.defineRoute('rest', {
      path: '/main-route',
      handler: () => '' as never,
    }, 'main')

    // 'admin-hub' is a DIFFERENT, still-in-flight session's Application — preserved. 'admin' and
    // 'main' are swept, exactly like the original unscoped full wipe would.
    program.routes.resetExceptApplications(new Set(['admin-hub']))

    const routes = program.routes.getRoutes('rest')
    assert(routes)
    assertEquals(routes['/admin-route/GET'], undefined)
    assertEquals(routes['/main-route/GET'], undefined)
    assert(
      routes['/hub-route/GET'],
      "a different, still-in-flight session's Application must survive",
    )
  },
)

Deno.test(
  'RouteContainer.resetExceptApplications() is a no-op when no route was ever registered',
  () => {
    const program = new ProgramClass()

    // Nothing registered at all yet — the early `if (!routes) return` guard, and (once a `rest`
    // route exists but a DIFFERENT type never got one) the per-type `if (!byPath) continue` guard.
    program.routes.resetExceptApplications(new Set(['admin-hub']))
    assertEquals(program.routes.getRoutes('rest'), undefined)

    program.routes.defineRoute('rest', {
      path: '/only-rest-route',
      handler: () => '' as never,
    }, 'admin')
    // 'socket'/'graphql' never got a route — resetExceptApplications must skip those types
    // entirely rather than throw on a missing bucket.
    program.routes.resetExceptApplications(new Set(['admin-hub']))
    assertEquals(program.routes.getRoutes('rest'), {})
  },
)

Deno.test(
  "DiscoveryContainer.resetExceptApplications() removes every bucket EXCEPT the given (preserved) Applications'",
  () => {
    const program = new ProgramClass()

    program.discovery.define('admin', 'triggers', { provider: {} as never, guards: [] })
    program.discovery.define('admin-hub', 'triggers', { provider: {} as never, guards: [] })

    program.discovery.resetExceptApplications(new Set(['admin-hub']))

    assertEquals(program.discovery.getProviders('admin'), [])
    assertEquals(program.discovery.getProviders('admin-hub').length, 1)
  },
)

Deno.test(
  'DiscoveryContainer.resetExceptApplications() is a no-op when nothing was ever registered',
  () => {
    const program = new ProgramClass()

    // The early `if (!registry) return` guard — nothing to iterate yet.
    program.discovery.resetExceptApplications(new Set(['admin-hub']))
    assertEquals(program.discovery.getProviders('admin'), [])
  },
)

Deno.test(
  'TargetContainer.resetResolversExceptApplications() removes every resolver key EXCEPT those tagged with the given (preserved) Applications',
  () => {
    const program = new ProgramClass()

    class AdminResolver extends TargetBaseClass {
      public handle() {}
    }
    class HubResolver extends TargetBaseClass {
      public handle() {}
    }

    program.targets.defineTarget('admin-resolver-key', {
      type: 'resolver',
      Target: AdminResolver,
      dataProps: { application: 'admin' },
    } as never)
    program.targets.defineTarget('hub-resolver-key', {
      type: 'resolver',
      Target: HubResolver,
      dataProps: { application: 'admin-hub' },
    } as never)

    program.targets.resetResolversExceptApplications(new Set(['admin-hub']))

    assertEquals(program.targets.getTargetsByType('resolver', 'admin'), [])
    assertEquals(program.targets.getTargetsByType('resolver', 'admin-hub'), ['hub-resolver-key'])
    // Reading with no Application filter still sees only the survivor.
    assertEquals(program.targets.getTargetsByType('resolver'), ['hub-resolver-key'])
  },
)

Deno.test(
  'TargetContainer.resetResolversExceptApplications() removes an untagged resolver key too (never attributed to any session, so it falls back to the original full-wipe default)',
  () => {
    const program = new ProgramClass()

    class UntaggedResolver extends TargetBaseClass {
      public handle() {}
    }

    program.targets.defineTarget('untagged-resolver-key', {
      type: 'resolver',
      Target: UntaggedResolver,
      dataProps: {},
    } as never)

    program.targets.resetResolversExceptApplications(new Set(['admin-hub']))

    assertEquals(program.targets.getTargetsByType('resolver'), [])
  },
)

Deno.test(
  'TargetContainer.resetResolversExceptApplications() is a no-op when no resolver was ever registered',
  () => {
    const program = new ProgramClass()

    // The `|| []` fallback on the initial `getData<string[]>('type:resolver', ...)` read — nothing
    // registered yet.
    program.targets.resetResolversExceptApplications(new Set(['admin-hub']))
    assertEquals(program.targets.getTargetsByType('resolver'), [])
  },
)
