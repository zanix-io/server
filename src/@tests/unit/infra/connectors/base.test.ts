import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert, assertEquals } from '@std/assert'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class TestConnector extends ZanixConnector {
  public startConnection(): void | Promise<void> {
    return wait(10)
  }

  public stopConnection(): void | Promise<void> {
    return wait(10)
  }
}

Deno.test('ZanixConnector: should initialize with connected = false', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }

  const conn = new TestConnector()
  assertEquals(conn.connected, false)

  await wait(10)
  assertEquals(conn.connected, true)
})

Deno.test('ZanixConnector: should not start connection if is not lazy', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const conn = new TestConnector()
  assertEquals(conn.connected, false)

  await wait(10)
  assertEquals(conn.connected, false)
})

Deno.test('ZanixConnector: should stop connection', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }
  const conn = new TestConnector()

  await wait(10)
  assertEquals(conn.connected, true)

  const promise = conn.stopConnection()
  assert(promise instanceof Promise)
  await promise
  assertEquals(conn.connected, false)
})

Deno.test('ZanixConnector: should not stop connection if is already disconnected', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }

  const conn = new TestConnector()
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
  const conn = new TestConnector()
  assertEquals(conn['startCalled'], false)
  conn.startConnection()
  assertEquals(conn.connected, false)
  assertEquals(conn['startCalled'], true)
  assert(!(conn.startConnection() instanceof Promise))

  await wait(10)
  assertEquals(conn['startCalled'], false)
  assertEquals(conn.connected, true)
  assert(!(conn.startConnection() instanceof Promise))
})

Deno.test('ZanixConnector: should initialize connection sync', () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  TestConnector.prototype.startConnection = () => {}
  TestConnector.prototype.stopConnection = () => {}

  const conn = new TestConnector()

  assertEquals(conn.connected, false)
  assert(!(conn.startConnection() instanceof Promise))
  assertEquals(conn.connected, true)

  assert(!(conn.stopConnection() instanceof Promise))
  assertEquals(conn.connected, false)
})
