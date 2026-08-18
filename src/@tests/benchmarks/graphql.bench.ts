/**
 * Baseline evidence for the GraphQL server type: schema assembly and the request handler. No
 * thresholds here — see `src/@tests/performance/`.
 *
 * @module
 */
import { createGraphqlScenarios } from './scenarios/graphql.ts'
import { registerScenarios } from './setup.ts'

registerScenarios(createGraphqlScenarios())
