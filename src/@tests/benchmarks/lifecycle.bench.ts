/**
 * Baseline evidence for the full in-process request lifecycle (`Request` → `Response`). No
 * thresholds here — see `src/@tests/performance/`.
 *
 * @module
 */
import { createLifecycleScenarios } from './scenarios/lifecycle.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createLifecycleScenarios())
