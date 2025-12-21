import './metadata.ts'

import type { StartMode } from 'typings/program.ts'

import { assertEquals } from '@std/assert/assert-equals'
import { targetInitializations } from 'utils/targets.ts'
import Program from 'modules/program/mod.ts'
import { webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert } from '@std/assert/assert'
import { assertFalse } from '@std/assert'
import logger from '@zanix/logger'

/** mocks */
stub(console, 'info')
console.error = () => {}

export const SOCKET_PORT = 9222
export const GQL_PORT = 9333

const originalFetch = globalThis.fetch

globalThis.fetch = (url, options = {}) => {
  const baseOptions = { headers: { 'Origin': '*', ...options.headers } }

  return originalFetch(url, { ...options, ...baseOptions })
}

try {
  const id1 = webServerManager.create('rest', {
    server: { globalPrefix: '/api//', cors: { origins: ['*'] } },
  })
  const id2 = webServerManager.create('socket', {
    server: { port: SOCKET_PORT, globalPrefix: 'sock', cors: { origins: ['*'] } },
  })
  const id3 = webServerManager.create('graphql', {
    server: { port: GQL_PORT, globalPrefix: '/gql//' },
  })

  // Prioritize connectors first, then providers, with the interactor as the last option.
  const modes: Exclude<StartMode, 'lazy'>[] = ['onSetup', 'onBoot']

  for await (const mode of modes) {
    await targetInitializations(mode)
  }

  webServerManager.start([id1, id2, id3])

  // check deleted metadata
  assert(!Object.keys(Program.middlewares).length)
  assert(!Object.keys(Program.decorators).length)
  assert(!Object.keys(Program.context).length)
  assert(!Object.keys(Program.routes).length)

  // All instantiated classes
  assertEquals(Object.keys(Program.targets).length, 22)

  await targetInitializations('postBoot')

  Program.cleanupInitializationsMetadata('postBoot')

  // check deleted metadata
  assertFalse(Program.targets.getTargetsByStartMode('postBoot', 'connector').length)
  assertFalse(Program.targets.getTargetsByStartMode('postBoot', 'interactor').length)
  assertFalse(Program.targets.getTargetsByStartMode('postBoot', 'provider').length)
  assertFalse(Program.targets.getTargetsByStartMode('onBoot', 'connector').length)
  assertFalse(Program.targets.getTargetsByStartMode('onBoot', 'interactor').length)
  assertFalse(Program.targets.getTargetsByStartMode('onBoot', 'provider').length)
  assertFalse(Program.targets.getTargetsByStartMode('onSetup', 'connector').length)
  assertFalse(Program.targets.getTargetsByStartMode('onSetup', 'interactor').length)
  assertFalse(Program.targets.getTargetsByStartMode('onSetup', 'provider').length)

  // Persisted instances
  assertEquals(Object.keys(Program.targets).length, 16)
} catch (e) {
  logger.debug('An error ocurred', e)
  // ignore
}
