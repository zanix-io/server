/**
 * Baseline evidence for request/context setup and URL/query/header parsing. No thresholds live
 * here by design — see `src/@tests/performance/` for the regression gate built on the same
 * scenarios.
 *
 * @module
 */
import { createContextScenarios } from './scenarios/context.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createContextScenarios())
