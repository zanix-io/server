import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert, assertAlmostEquals, assertEquals, assertThrows } from '@std/assert'
import Program from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

// mocks
console.error = () => {}

function wait(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms))
}

const waiting = 20 // wait more time because of queueMicrotask

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

class PrivateFieldTestConnector extends ZanixConnector {
  constructor(id: string, private field = 4) {
    super(id)
  }
  #private = 0

  public async initialize() {
    this.field++
    this.#private++
    await wait(10)
  }

  public async isHealthy(): Promise<boolean> {
    await wait(10)
    return this.field === 5 && this.#private === 1
  }

  public close() {}
}

class OtherConnector extends TestConnector {
}

Deno.test('ZanixConnector: should avoid autoconnect', async () => {
  TestConnector.prototype[ZANIX_PROPS] = {
    ...TestConnector.prototype[ZANIX_PROPS],
    data: { autoInitialize: false, ...TestConnector.prototype[ZANIX_PROPS]?.data },
  }

  const conn = new TestConnector()

  const time = Date.now()
  const ready = await conn['isReady']
  assertAlmostEquals(Date.now() - time, 0) // No waiting for initialization is needed.
  assert(ready)
})

Deno.test(
  'ZanixConnector: should auto-initialize with isReady = true',
  async () => {
    TestConnector.prototype[ZANIX_PROPS] = {
      ...TestConnector.prototype[ZANIX_PROPS],
      data: { autoInitialize: false, ...TestConnector.prototype[ZANIX_PROPS]?.data },
    }

    delete TestConnector.prototype[ZANIX_PROPS]?.data?.autoInitialize

    const conn = new TestConnector({ autoInitialize: true })

    const time = Date.now()
    const ready = await conn['isReady']
    assertAlmostEquals(Date.now() - time, 10, 5) // Should wait for the initialization process to finish.

    assert(ready)

    const conn2 = new TestConnector()
    assert(await conn2['isReady'])
  },
)

Deno.test(
  'ZanixConnector `initialize` should work with private fields by queueMicrotask',
  async () => {
    const conn = new PrivateFieldTestConnector('ctx-check')

    await wait(waiting)

    assert(await conn.isHealthy())
  },
)

Deno.test('ZanixConnector: should have correct timeout and retries values', async () => {
  delete TestConnector.prototype[ZANIX_PROPS]?.data?.autoInitialize

  const conn = new TestConnector()
  await conn.isReady
  assertEquals(conn['timeoutConnection'], 10000)
  assertEquals(conn['retryInterval'], 500)

  const conn2 = new TestConnector({ autoInitialize: false })
  await conn2.isReady
  assertEquals(conn2['timeoutConnection'], 10000)
  assertEquals(conn2['retryInterval'], 500)

  const conn3 = new TestConnector({ autoInitialize: { timeoutConnection: 500, retryInterval: 30 } })
  await conn3.isReady
  assertEquals(conn3['timeoutConnection'], 500)
  assertEquals(conn3['retryInterval'], 30)

  TestConnector.prototype[ZANIX_PROPS] = {
    ...TestConnector.prototype[ZANIX_PROPS],
    data: {
      ...TestConnector.prototype[ZANIX_PROPS]?.data,
      autoInitialize: { timeoutConnection: 100, retryInterval: 10 },
    },
  }
  const conn4 = new TestConnector()
  await conn4.isReady
  assertEquals(conn4['timeoutConnection'], 100)
  assertEquals(conn4['retryInterval'], 10)
})

Deno.test('ZanixConnector: should interact with context', async () => {
  const conn = new TestConnector({ contextId: 'id' })
  await conn.isReady

  // props validations
  assert(conn['context'].id === undefined)

  const errorContext = new OtherConnector()

  assertThrows(
    () => errorContext['context'],
    Deno.errors.Http,
    'The system could not find the required information to proceed',
  )
  await wait(waiting)
})

Deno.test('ZanixConnector: be freeze after auto-initialize', async () => {
  const targetKey = getTargetKey(TestConnector)
  Program.targets.defineTarget(targetKey, {
    Target: TestConnector,
    type: 'connector',
    lifetime: 'TRANSIENT',
  })

  const conn = Program.targets.getConnector<TestConnector>(targetKey)

  assertEquals(conn[ZANIX_PROPS].key, targetKey)

  // freeze validation when connector is ready
  conn.close = (() => {}) as never
  await conn.isReady
  assertThrows(
    () => {
      conn.close = (() => {}) as never
    },
    TypeError,
    "Cannot assign to read only property 'close' of object",
  )
})
