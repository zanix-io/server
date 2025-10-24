import './metadata.ts'

import type { ModuleTypes } from 'typings/program.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'

import Program from 'modules/program/mod.ts'
import { webServerManager } from '@zanix/server'
import { stub } from '@std/testing/mock'
import { assert } from '@std/assert/assert'
import logger from '@zanix/logger'
import { assertEquals } from '@std/assert/assert-equals'

/** mocks */
stub(console, 'info')
stub(console, 'error')

export const SOCKET_PORT = 9222
export const GQL_PORT = 9333

try {
  const id1 = webServerManager.create('rest', { server: { globalPrefix: '/api//' } })
  const id2 = webServerManager.create('socket', { server: { port: SOCKET_PORT } })
  const id3 = webServerManager.create('graphql', {
    server: { port: GQL_PORT, globalPrefix: '/gql//' },
  })

  const startConnection = async (key: string) => {
    const [type, id] = key.split(':') as [ModuleTypes, string]
    const instance = Program.targets.getInstance<ZanixConnector>(id, type)
    if (type !== 'connector') return
    await instance.connectorReady
    return instance['startConnection']()
  }

  await Promise.all(Program.targets.getTargetsByStartMode('onSetup').map(startConnection))
  await Promise.all(Program.targets.getTargetsByStartMode('onBoot').map(startConnection))

  webServerManager.start([id1, id2, id3])

  // check deleted metadata
  assert(!Object.keys(Program.middlewares).length)
  assert(!Object.keys(Program.decorators).length)
  assert(!Object.keys(Program.context).length)
  assert(!Object.keys(Program.routes).length)

  assertEquals(Object.keys(Program.targets).length, 14)

  await Promise.all(Program.targets.getTargetsByStartMode('postBoot').map(startConnection))

  Program.cleanupMetadata('postBoot')

  assertEquals(Object.keys(Program.targets).length, 11)
} catch (e) {
  logger.debug('An error ocurred', e)
  // ignore
}
