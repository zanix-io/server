// deno-coverage-ignore-file

/**
 * Routing — both halves of it, which have very different cost profiles and very different failure
 * modes:
 *
 * - **Compilation** (`routeProcessor`): once per server, at boot. Turns the global route registry
 *   into the three dispatch tables (`absolutePaths`, `relativePaths`, `catchAllPaths`). A
 *   regression here shows up as slower startup, never as slower requests.
 * - **Matching** (`findMatchingRoute` + the regexes `pathToRegex` compiles): once per request, on
 *   every request that isn't an exact static hit. `:param` matching is a LINEAR scan, so this is
 *   the one part of the runtime whose per-request cost genuinely scales with how many routes the
 *   application declares — measured here at three table sizes for exactly that reason.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'
import type { RouteDefinitionProps } from 'typings/router.ts'

import {
  bucketRoutesByMethod,
  EMPTY_ROUTES,
  findMatchingRoute,
  getParamNames,
  pathToRegex,
} from 'utils/routes.ts'
import { routeProcessor } from 'modules/webserver/helpers/routes.ts'
import ProgramModule from 'modules/program/mod.ts'

import {
  buildRouteTables,
  lastMixedRoute,
  lastParamRoutePath,
  mixedMethodRouteDefinitions,
  paramRouteDefinitions,
} from '../fixtures.ts'
import { ROUTE_TABLE_SIZES, type SizeLabel, withSilencedLogs } from '../setup.ts'

const NOOP_HANDLER = (() => 'ok') as unknown as RouteDefinitionProps['handler']

const SAMPLE_ROUTE = '/orgs/:orgId/teams/:teamId/members/:memberId/GET'

/** Builds the routing scenarios. See {@linkcode createContextScenarios} for why this is a factory. */
export function createRoutingScenarios(): Scenario[] {
  const scenarios: Scenario[] = [
    {
      key: 'routing:pathToRegex',
      name: 'pathToRegex() — compile one 3-param route pattern',
      group: 'route-compile-primitives',
      baseline: true,
      run: () => pathToRegex(SAMPLE_ROUTE),
    },
    {
      key: 'routing:getParamNames',
      name: 'getParamNames() — extract 3 param names from a route',
      group: 'route-compile-primitives',
      run: () => getParamNames(SAMPLE_ROUTE),
    },
  ]

  // --- Compilation, at three table sizes -------------------------------------------------------
  // `routeProcessor` reads the global registry, so each iteration has to re-register its own
  // routes. That registration is `@zanix/server`'s own `RouteContainer.defineRoute` — real
  // boot-time work on the same code path a real application takes — but it IS included in the
  // number, which is therefore "register + compile", not "compile" in isolation. Documented here
  // rather than engineered away: isolating the compile alone would require reaching past the
  // registry into internals no real boot sequence ever bypasses.
  for (const size of Object.keys(ROUTE_TABLE_SIZES) as SizeLabel[]) {
    const count = ROUTE_TABLE_SIZES[size]
    const definitions = paramRouteDefinitions(count, NOOP_HANDLER)

    scenarios.push({
      key: `routing:compile:${size}`,
      name: `routeProcessor() — register + compile ${count} :param routes (${size})`,
      group: 'route-compile',
      baseline: size === 'small',
      run: () =>
        withSilencedLogs(() => {
          ProgramModule.routes.resetContainer()
          for (const definition of definitions) {
            ProgramModule.routes.defineRoute('rest', definition)
          }
          const tables = routeProcessor('rest')
          ProgramModule.routes.resetContainer()
          return tables
        }),
    })
  }

  // --- Matching, at three table sizes ----------------------------------------------------------
  for (const size of Object.keys(ROUTE_TABLE_SIZES) as SizeLabel[]) {
    const count = ROUTE_TABLE_SIZES[size]
    const { relativePaths } = buildRouteTables(paramRouteDefinitions(count, NOOP_HANDLER))
    // Worst case on purpose — see `paramRouteDefinitions`'s own doc.
    const hitPath = `${lastParamRoutePath(count)}/GET`
    const missPath = '/no-such-resource/9876/GET'

    scenarios.push({
      key: `routing:match:hit:${size}`,
      name: `findMatchingRoute() — hit on the LAST of ${count} :param routes (${size})`,
      group: 'route-match',
      baseline: size === 'small',
      run: () => findMatchingRoute(relativePaths, hitPath),
    })

    if (size === 'large') {
      scenarios.push({
        key: 'routing:match:miss:large',
        name: `findMatchingRoute() — full-scan MISS over ${count} :param routes (404 path)`,
        group: 'route-match',
        run: () => findMatchingRoute(relativePaths, missPath),
      })
    }
  }

  // --- Matching against a MIXED-METHOD table ---------------------------------------------------
  // The shape a real REST application has, and the one that shows whether the scan is wasting work
  // on routes the request's method can never match. Measured beside the all-GET tables above, so a
  // routing change has to prove it helps here without hurting those.
  for (const size of ['medium', 'large'] as SizeLabel[]) {
    const count = ROUTE_TABLE_SIZES[size]
    const tables = buildRouteTables(mixedMethodRouteDefinitions(count, NOOP_HANDLER))
    const { path, method } = lastMixedRoute(count)
    const buckets = bucketRoutesByMethod(tables.relativePaths)
    const hitPath = `${path}/${method}`

    scenarios.push({
      key: `routing:match:hit:mixed:${size}`,
      name: `findMatchingRoute() — hit on the LAST of ${count} routes across 5 methods (${size})`,
      group: 'route-match-mixed',
      baseline: size === 'medium',
      run: () => findMatchingRoute(buckets[method] ?? EMPTY_ROUTES, hitPath),
    })

    if (size === 'large') {
      scenarios.push({
        key: 'routing:match:miss:mixed:large',
        name: `findMatchingRoute() — MISS over ${count} routes across 5 methods`,
        group: 'route-match-mixed',
        run: () => findMatchingRoute(buckets['GET'] ?? EMPTY_ROUTES, '/no-such/9876/GET'),
      })
    }
  }

  // --- Catch-all matching ----------------------------------------------------------------------
  {
    const { catchAllPaths } = buildRouteTables([
      { path: '/assets/:path*', httpMethod: 'GET', handler: NOOP_HANDLER },
    ])
    const path = '/assets/img/icons/logo-dark.svg/GET'

    scenarios.push({
      key: 'routing:match:catchall',
      name: 'findMatchingRoute() — catch-all (:path*) across 3 nested segments',
      group: 'route-match',
      run: () => findMatchingRoute(catchAllPaths, path),
    })
  }

  return scenarios
}
