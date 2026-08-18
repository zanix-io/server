/**
 * Every measured scenario in the `@zanix/server` backend benchmark suite, in one list.
 *
 * The `*.bench.ts` files each register their own area's scenarios independently (so
 * `deno bench --filter` stays useful per area); this aggregate exists for the performance
 * regression test, which needs the complete set in order to look each recorded baseline back up by
 * key.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'

import { createContextScenarios } from './context.ts'
import { createRoutingScenarios } from './routing.ts'
import { createMiddlewareScenarios } from './middleware.ts'
import { createResponseScenarios } from './response.ts'
import { createLifecycleScenarios } from './lifecycle.ts'
import { createGraphqlScenarios } from './graphql.ts'
import { createSocketScenarios } from './sockets.ts'

/** Builds every scenario. Call once — building route tables is real work, and repeat calls would
 * pointlessly re-register and re-clear the global route registry. */
export function createAllScenarios(): Scenario[] {
  return [
    ...createContextScenarios(),
    ...createRoutingScenarios(),
    ...createMiddlewareScenarios(),
    ...createResponseScenarios(),
    ...createLifecycleScenarios(),
    ...createGraphqlScenarios(),
    ...createSocketScenarios(),
  ]
}
