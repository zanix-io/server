import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert, assertEquals, assertThrows } from '@std/assert'
import Program from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'

function wait(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms))
}

class TestConnector extends ZanixConnector {
  public startConnection(): Promise<boolean> {
    return wait(10)
  }

  public stopConnection(): Promise<boolean> {
    return wait(10)
  }
}

class OtherConnector extends TestConnector {
}

Deno.test('ZanixConnector: should initialize with connected = false and autoconnect', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }

  const conn = new TestConnector('ctx-check')
  assertEquals(conn['connected'], false)

  await wait(100)
  assertEquals(conn['connected'], true)
})

Deno.test('ZanixConnector: should avoid autoconnect', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
    data: { autoConnectOnLazy: false },
  }

  const conn = new TestConnector('ctx-check')
  delete TestConnector.prototype['_znxProps'].data.autoConnectOnLazy
  assertEquals(conn['connected'], false)

  await wait(10)
  assertEquals(conn['connected'], false)
})

Deno.test('ZanixConnector: should not start connection if is not lazy', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const conn = new TestConnector('ctx-check')
  assertEquals(conn['connected'], false)

  await wait(10)
  assertEquals(conn['connected'], false)
})

Deno.test('ZanixConnector: should stop connection', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }
  const conn = new TestConnector('ctx-check')

  await wait(10)
  assertEquals(conn['connected'], true)

  const promise = conn.stopConnection()
  assert(promise instanceof Promise)
  await promise
  assertEquals(conn['connected'], false)
})

Deno.test('ZanixConnector: should not stop connection if is already disconnected', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }

  const conn = new TestConnector('ctx-check')
  assertEquals(conn['stopCalled'], false)
  assert(!(conn.stopConnection() instanceof Promise))
  assertEquals(conn['stopCalled'], false)

  await wait(10) // wait until is connected

  assert(conn.stopConnection() instanceof Promise)
  assertEquals(conn['stopCalled'], true)
  await wait(10)
  assertEquals(conn['stopCalled'], false)
})

Deno.test('ZanixConnector: should not start connection if is already connected', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const conn = new TestConnector('ctx-check')
  assertEquals(conn['startCalled'], false)
  conn.startConnection()
  assertEquals(conn['connected'], false)
  assertEquals(conn['startCalled'], true)
  assert(!(conn.startConnection() instanceof Promise))

  await wait(10)
  assertEquals(conn['startCalled'], false)
  assertEquals(conn['connected'], true)
  assert(!(conn.startConnection() instanceof Promise))
})

Deno.test('ZanixConnector: should initialize connection sync', () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const originalStart = TestConnector.prototype.startConnection
  const originalStop = TestConnector.prototype.stopConnection
  TestConnector.prototype.startConnection = () => true as never
  TestConnector.prototype.stopConnection = () => true as never

  const conn = new TestConnector('ctx-check')

  assertEquals(conn['connected'], false)
  assert(!(conn.startConnection() instanceof Promise))
  assertEquals(conn['connected'], true)

  assert(!(conn.stopConnection() instanceof Promise))
  assertEquals(conn['connected'], false)

  TestConnector.prototype.startConnection = originalStart
  TestConnector.prototype.stopConnection = originalStop
})

Deno.test('ZanixConnector: should interact with context and other conectors', async () => {
  Program.targets.toBeInstanced(getTargetKey(OtherConnector), {
    Target: OtherConnector,
    type: 'connector',
  })
  const conn = new TestConnector('ctx-check')
  const result = conn['connectors'].get(OtherConnector)

  assert(result['context'].id === undefined)
  assertEquals(result['_znxProps'].key, 'OtherConnector')

  await wait(10)
})

Deno.test('ZanixConnector: should validate uri', async () => {
  const conn = new TestConnector('ctx-check', 'iscam:2216@test.com')
  await conn.startConnection().then(() => assert(true)) // wait to the promise

  assertEquals(conn['url'].host, 'test.com')
  assertEquals(conn['url'].password, '')
  assertEquals(conn['url'].username, '')

  const conn2 = new TestConnector('ctx-check', 'i}~+´test.com')
  await assertThrows(() => conn2.startConnection())
})
