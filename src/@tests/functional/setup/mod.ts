import './metadata.ts'

import type { ModuleTypes } from 'typings/program.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'

import { assertEquals } from '@std/assert/assert-equals'
import Program from 'modules/program/mod.ts'
import { webServerManager } from 'webserver/mod.ts'
import { stub } from '@std/testing/mock'
import { assert } from '@std/assert/assert'
import logger from '@zanix/logger'
import { connectorModuleInitialization } from 'utils/targets.ts'
import { INSTANCE_KEY_SEPARATOR } from 'utils/constants.ts'

/** mocks */
stub(console, 'info')
stub(console, 'error')

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

  /** Target module setup startup initialization */
  const startConnection = (key: string) => {
    const [type, id] = key.split(INSTANCE_KEY_SEPARATOR) as [ModuleTypes, string]
    const instance = Program.targets['getInstance']<ZanixConnector>(id, type)

    if (type !== 'connector') return

    return connectorModuleInitialization(instance)
  }

  await Promise.all(Program.targets.getTargetsByStartMode('onSetup').map(startConnection))
  await Promise.all(Program.targets.getTargetsByStartMode('onBoot').map(startConnection))

  webServerManager.start([id1, id2, id3])

  // check deleted metadata
  assert(!Object.keys(Program.middlewares).length)
  assert(!Object.keys(Program.decorators).length)
  assert(!Object.keys(Program.context).length)
  assert(!Object.keys(Program.routes).length)

  // All instantiated classes
  assertEquals(Object.keys(Program.targets).length, 19)

  await Promise.all(Program.targets.getTargetsByStartMode('postBoot').map(startConnection))

  Program.cleanupMetadata('postBoot')

  // Persisted instances
  assertEquals(Object.keys(Program.targets).length, 16)
} catch (e) {
  logger.debug('An error ocurred', e)
  // ignore
}
