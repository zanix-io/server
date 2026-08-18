/**
 * Baseline evidence for route-table compilation and per-request route matching. No thresholds
 * here — see `src/@tests/performance/`.
 *
 * @module
 */
import { createRoutingScenarios } from './scenarios/routing.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createRoutingScenarios())
