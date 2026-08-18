/**
 * Baseline evidence for the WebSocket handler's per-message path. No thresholds here — see
 * `src/@tests/performance/`.
 *
 * @module
 */
import { createSocketScenarios } from './scenarios/sockets.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createSocketScenarios())
