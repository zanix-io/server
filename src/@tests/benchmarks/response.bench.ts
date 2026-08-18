/**
 * Baseline evidence for response generation, JSON serialization, error responses and gzip. No
 * thresholds here — see `src/@tests/performance/`.
 *
 * @module
 */
import { createResponseScenarios } from './scenarios/response.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createResponseScenarios())
