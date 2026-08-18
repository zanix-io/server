/**
 * Baseline evidence for the guard/pipe/interceptor pipeline. No thresholds here — see
 * `src/@tests/performance/`.
 *
 * @module
 */
import { createMiddlewareScenarios } from './scenarios/middleware.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createMiddlewareScenarios())
