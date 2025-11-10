import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assertAlmostEquals, assertRejects } from '@std/assert'
import { stub } from '@std/testing/mock'
import { connectorModuleInitialization } from 'utils/targets.ts'
import { InternalError } from '@zanix/errors'
import { ZANIX_PROPS } from 'utils/constants.ts'

stub(console, 'error')

function wait(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms))
}
class TestConnector extends ZanixConnector {
  public async initialize() {
    await wait(10)
  }

  public isHealthy() {
    return wait(10)
  }

  public close() {
    return wait(10)
  }
}

Deno.test('ZanixConnector: should wait initialization connection on setup modes', async () => {
  TestConnector.prototype[ZANIX_PROPS] = {
    ...TestConnector.prototype[ZANIX_PROPS],
    data: {
      ...TestConnector.prototype[ZANIX_PROPS]?.data,
      autoInitialize: { timeoutConnection: 2000, retryInterval: 100 },
    },
  }

  const originalIsHealthy = TestConnector.prototype.isHealthy

  let attemps = 0
  TestConnector.prototype.isHealthy = () => {
    attemps++
    return false as never
  }

  const conn = new TestConnector()

  const time = Date.now()
  await assertRejects(
    () => connectorModuleInitialization(conn),
    InternalError,
    'Health check failed: Timeout reached',
  )

  assertAlmostEquals(Date.now() - time, 2000, 100)
  assertAlmostEquals(attemps, conn['timeoutConnection'] / conn['retryInterval'], 2)

  const waitTime = 300

  attemps = 0
  TestConnector.prototype.isHealthy = async () => {
    attemps++
    await wait(waitTime)
    return attemps === 3
  }

  const conn2 = new TestConnector()

  const time2 = Date.now()
  await connectorModuleInitialization(conn2)

  assertAlmostEquals(Date.now() - time2, attemps * waitTime + attemps * conn2['retryInterval'], 100)

  TestConnector.prototype.isHealthy = originalIsHealthy
})
