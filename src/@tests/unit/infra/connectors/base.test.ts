import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert, assertEquals, assertThrows } from '@std/assert'
import Program from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'

function wait(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms))
}

const waiting = 20 // wait more time because of queueMicrotask

class TestConnector extends ZanixConnector {
  public startConnection(): Promise<boolean> {
    return wait(10)
  }

  public stopConnection(): Promise<boolean> {
    return wait(10)
  }
}

class PrivateFieldTestConnector extends ZanixConnector {
  constructor(id: string, private field = 4) {
    super(id)
  }
  #private = 0
  public startConnection(): Promise<boolean> {
    this.field++
    this.#private++
    return wait(10)
  }

  public async stopConnection(): Promise<boolean> {
    await wait(10)
    return this.field === 4 && this.#private === 1
  }
}

class OtherConnector extends TestConnector {
}

Deno.test(
  'ZanixConnector: should initialize with connected = false and autoconnect',
  async () => {
    TestConnector.prototype['_znxProps'] = {
      ...TestConnector.prototype['_znxProps'],
      startMode: 'lazy',
    }

    const conn = new TestConnector('ctx-check')
    assertEquals(conn['connected'], false)

    await wait(waiting)
    assertEquals(conn['connected'], true)
  },
)

Deno.test('ZanixConnector: should work with private fields by queueMicrotask', async () => {
  PrivateFieldTestConnector.prototype['_znxProps'] = {
    ...PrivateFieldTestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }

  const conn = new PrivateFieldTestConnector('ctx-check')

  await wait(waiting)

  assert(await conn.stopConnection() === false)
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

  await wait(waiting)
  assertEquals(conn['connected'], false)
})

Deno.test('ZanixConnector: should not start connection if is not lazy', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const conn = new TestConnector('ctx-check')
  assertEquals(conn['connected'], false)

  await wait(waiting)
  assertEquals(conn['connected'], false)
})

Deno.test('ZanixConnector: should stop connection', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'lazy',
  }
  const conn = new TestConnector('ctx-check')

  await wait(waiting) // wait until lazy connected

  assertEquals(conn['connected'], true)

  const promise = conn.stopConnection()
  assert(promise instanceof Promise)
  await promise
  assertEquals(conn['connected'], false)
})

Deno.test(
  'ZanixConnector: should not stop connection if is already disconnected',
  async () => {
    TestConnector.prototype['_znxProps'] = {
      ...TestConnector.prototype['_znxProps'],
      startMode: 'lazy',
    }

    const conn = new TestConnector('ctx-check')

    await wait(waiting) // wait until lazy connected

    assertEquals(conn['stopCalled'], false)
    assert(conn.stopConnection() instanceof Promise)
    assertEquals(conn['stopCalled'], true)

    await wait(waiting) // wait until is connected

    assert(!(conn.stopConnection() instanceof Promise)) // is already stopped and returns true
    assertEquals(conn['stopCalled'], false)
    await wait(waiting)
    assertEquals(conn['stopCalled'], false)
  },
)

Deno.test(
  'ZanixConnector: should not start connection if is already connected',
  async () => {
    TestConnector.prototype['_znxProps'] = {
      ...TestConnector.prototype['_znxProps'],
      startMode: 'onBoot',
    }
    const conn = new TestConnector('ctx-check')
    await conn.connectorReady

    assertEquals(conn['startCalled'], false)
    conn.startConnection()
    assertEquals(conn['connected'], false)
    assertEquals(conn['startCalled'], true)
    assert(!(conn.startConnection() instanceof Promise))

    await wait(waiting)
    assertEquals(conn['startCalled'], false)
    assertEquals(conn['connected'], true)
    assert(!(conn.startConnection() instanceof Promise))
  },
)

Deno.test('ZanixConnector: should initialize connection sync', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const originalStart = TestConnector.prototype.startConnection
  const originalStop = TestConnector.prototype.stopConnection
  TestConnector.prototype.startConnection = () => true as never
  TestConnector.prototype.stopConnection = () => true as never

  const conn = new TestConnector('ctx-check')
  await conn.connectorReady

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
  await conn.connectorReady

  const result = conn['connectors'].get(OtherConnector)

  // freeze validation when connector is ready
  result.stopConnection = (() => {}) as never
  await result.connectorReady
  assertThrows(() => {
    result.stopConnection = (() => {}) as never
  })

  // props validations
  assert(result['context'].id === undefined)
  assertEquals(result['_znxProps'].key, 'OtherConnector')

  await wait(waiting)
})

Deno.test('ZanixConnector: should validate uri', async () => {
  TestConnector.prototype['_znxProps'] = {
    ...TestConnector.prototype['_znxProps'],
    startMode: 'onBoot',
  }
  const conn = new TestConnector('ctx-check', { uri: 'iscam:2216@test.com' })
  await conn.connectorReady
  await conn.startConnection().then(() => assert(true)) // wait to the promise

  assertEquals(conn['url'].host, 'test.com')
  assertEquals(conn['url'].password, '')
  assertEquals(conn['url'].username, '')

  const conn2 = new TestConnector('ctx-check', { uri: 'i}~+´test.com' })
  await wait(waiting) // wait because of queueMicrotask
  await assertThrows(() => conn2.startConnection())
})
