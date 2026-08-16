import { assert, assertEquals } from '@std/assert'
import { InternalProgram as ProgramClass } from 'modules/program/mod.ts'

/**
 * `removeRoutesForApplication` is the narrower sibling of `resetExceptApplications` — see its own
 * doc for why hot-uninstall needs this instead: a caller that only knows ONE app's own name (not
 * every OTHER Application currently active in the process) must be able to remove just that one
 * app's routes without risking wiping something it never even knew existed.
 */
Deno.test(
  "RouteContainer.removeRoutesForApplication: removes only the named Application's routes, " +
    'across every server type, leaving every other Application untouched',
  () => {
    const program = new ProgramClass()

    program.routes.defineRoute('rest', {
      path: '/a-route',
      handler: () => '' as never,
    }, 'app-a')
    program.routes.defineRoute('rest', {
      path: '/b-route',
      handler: () => '' as never,
    }, 'app-b')
    program.routes.defineRoute(
      'graphql',
      { path: '/a-graphql', handler: () => '' as never },
      'app-a',
    )

    const removed = program.routes.removeRoutesForApplication('app-a')

    assertEquals(
      removed,
      2,
      "both of app-a's own entries (rest + graphql) must be counted",
    )
    assertEquals(
      program.routes.getRoutes('rest')?.['app-a:/a-route/GET'],
      undefined,
    )
    assertEquals(
      program.routes.getRoutes('graphql')?.['app-a:/a-graphql/GET'],
      undefined,
    )
    assert(
      program.routes.getRoutes('rest')?.['app-b:/b-route/GET'],
      "a different Application's route must survive untouched",
    )
  },
)

Deno.test(
  'RouteContainer.removeRoutesForApplication: returns 0 and is a no-op for an Application with no routes',
  () => {
    const program = new ProgramClass()

    program.routes.defineRoute('rest', {
      path: '/only-route',
      handler: () => '' as never,
    }, 'app-a')

    const removed = program.routes.removeRoutesForApplication(
      'never-registered',
    )

    assertEquals(removed, 0)
    assert(program.routes.getRoutes('rest')?.['app-a:/only-route/GET'])
  },
)
