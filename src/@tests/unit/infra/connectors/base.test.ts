import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert, assertAlmostEquals, assertEquals, assertThrows } from '@std/assert'
import Program from 'modules/program/mod.ts'
import { getTargetKey } from 'utils/targets.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'
import { spy } from '@std/testing/mock'
import logger from '@zanix/logger'
import { asyncContext } from 'modules/infra/base/storage.ts'

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
    data: {
      autoInitialize: false,
      ...TestConnector.prototype[ZANIX_PROPS]?.data,
    },
  }

  const conn = new TestConnector()

  const time = Date.now()
  const ready = await conn['isReady']
  assertAlmostEquals(Date.now() - time, 0, 5) // No waiting for initialization is needed (tolerance for CI jitter).
  assert(ready)
})

Deno.test({
  name:
    'ZanixConnector: with autoInitialize disabled, initialize() is never called — the retry loop only ever engages on the auto-init path',
  fn: async () => {
    let calls = 0

    class ManualConnector extends ZanixConnector {
      public initialize() {
        calls++
        throw new Error('should never run')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const conn = new ManualConnector({ autoInitialize: false })
    await conn.isReady // resolves to `true` immediately — no auto-init, so nothing to retry

    assertEquals(calls, 0)
  },
})

Deno.test({
  name:
    "ZanixConnector: 'onSetup'/'onBoot' connectors do NOT retry — a single failed attempt rejects immediately (fail-fast, unaffected by retryInterval/timeoutConnection)",
  fn: async () => {
    const results = await Promise.all(
      (['onSetup', 'onBoot'] as const).map(async (startMode) => {
        let calls = 0

        class NoRetryConnector extends ZanixConnector {
          public initialize() {
            calls++
            throw new Error(`${startMode} boom`)
          }
          public isHealthy() {
            return false
          }
          public close() {
            return true
          }
        }

        NoRetryConnector.prototype[ZANIX_PROPS] = {
          ...NoRetryConnector.prototype[ZANIX_PROPS],
          startMode,
          data: {
            ...NoRetryConnector.prototype[ZANIX_PROPS]?.data,
            // A retry budget wide enough that a single retry (if it were ever consulted, which it
            // shouldn't be) would clearly overshoot the timing tolerance below — comfortably wider
            // than that tolerance so this isn't flaky under a loaded/shared CI machine.
            autoInitialize: { timeoutConnection: 1000, retryInterval: 200 },
          },
        }

        const time = Date.now()
        const conn = new NoRetryConnector()
        await conn.isReady.catch((error) => {
          assertEquals(error.message, `${startMode} boom`)
        })

        return { startMode, calls, elapsed: Date.now() - time }
      }),
    )

    for (const { startMode, calls, elapsed } of results) {
      assertEquals(calls, 1, `${startMode}: initialize() should be called exactly once`)
      // Rejects almost immediately — never waits out retryInterval/timeoutConnection. Tolerance
      // (80ms) stays well under retryInterval (200ms) so a single retry, if it wrongly happened,
      // would still clearly fail this — while staying generous enough for a loaded CI machine.
      assertAlmostEquals(elapsed, 0, 85, `${startMode}: should reject without retrying`)
    }
  },
})

Deno.test(
  'ZanixConnector: should auto-initialize with isReady = true',
  async () => {
    TestConnector.prototype[ZANIX_PROPS] = {
      ...TestConnector.prototype[ZANIX_PROPS],
      data: {
        autoInitialize: false,
        ...TestConnector.prototype[ZANIX_PROPS]?.data,
      },
    }

    delete TestConnector.prototype[ZANIX_PROPS]?.data?.autoInitialize

    const conn = new TestConnector({ autoInitialize: true })

    const time = Date.now()
    const ready = await conn['isReady']
    assertAlmostEquals(Date.now() - time, 10, 30) // Should wait for the initialization process to finish (tolerance for CI jitter).

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

  const conn3 = new TestConnector({
    autoInitialize: { timeoutConnection: 500, retryInterval: 30 },
  })
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

Deno.test({
  name:
    'ZanixConnector: initialize failure retries until timeoutConnection, then logs once and rejects isReady',
  fn: async () => {
    let calls = 0

    class FailingConnector extends ZanixConnector {
      public initialize() {
        calls++
        throw new Error('boom')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const conn = new FailingConnector({
      autoInitialize: { timeoutConnection: 100, retryInterval: 20 },
    })

    const time = Date.now()
    await conn.isReady.catch((error) => {
      assertEquals(error.message, 'boom')
      // The rejection reason is stamped `_logged: true` by `logAppError` once it's been logged —
      // asserts the failure isn't printed again by a later, independent consumer of the same
      // `isReady` rejection (`instanceFreeze`, `targetInitializations('postBoot')`, ...).
      assert((error as Record<string, unknown>)._logged === true)
    })
    assertAlmostEquals(Date.now() - time, 100, 60) // retried across the whole timeout window
    assert(calls > 1, 'initialize should have been retried at least once before giving up')
  },
})

Deno.test({
  name:
    "ZanixConnector: the outer retry loop stays bounded by timeoutConnection even when a connector's own initialize() does non-trivial work per attempt (e.g. its own internal reconnect/backoff)",
  fn: async () => {
    let calls = 0
    const perAttemptWork = 15 // simulates a connector with its own internal retry/backoff cost

    class SlowInternalRetryConnector extends ZanixConnector {
      public async initialize() {
        calls++
        await wait(perAttemptWork)
        throw new Error('still unreachable')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const timeoutConnection = 60
    const conn = new SlowInternalRetryConnector({
      autoInitialize: { timeoutConnection, retryInterval: 5 },
    })

    const time = Date.now()
    await conn.isReady.catch(() => {})
    const elapsed = Date.now() - time

    // Bounded by timeoutConnection + at most one in-flight attempt's own duration — never
    // "attempts × timeoutConnection" or anything resembling runaway/compounding growth, no
    // matter how slow (or how much internal retrying) each individual attempt itself does.
    assert(
      elapsed <= timeoutConnection + perAttemptWork + 50, // + scheduling tolerance
      `expected elapsed (${elapsed}ms) to stay bounded, not compound with each attempt`,
    )
    assert(calls >= 1)
  },
})

Deno.test('ZanixConnector: coreDisplayName resolves an ordinary subclass to its class name', () => {
  const conn = new TestConnector({ autoInitialize: false })
  assertEquals(conn['coreDisplayName'](), 'TestConnector')
  assertEquals(conn['coreDisplayName']('custom label'), 'TestConnector')
})

Deno.test({
  name:
    'ZanixConnector: coreDisplayName resolves a `_Zanix`-prefixed synthetic subclass to its label, or `${connectorKey} core`',
  fn: () => {
    class _ZanixSyntheticConnector extends ZanixConnector {
      protected override initialize() {}
      protected override close() {
        return true
      }
      public override isHealthy() {
        return true
      }
    }

    const conn = new _ZanixSyntheticConnector({ autoInitialize: false })
    assertEquals(conn['coreDisplayName']('asyncmq core'), 'asyncmq core')
    // No label given: falls back to `${connectorKey} core` — `connectorKey` defaults to `''` for
    // a connector that was never registered through the `@Connector` decorator, as here.
    assertEquals(conn['coreDisplayName'](), ' core')
  },
})

Deno.test({
  name:
    "ZanixConnector: a `_Zanix`-prefixed connector's init-failure log uses coreDisplayName('from core') in the message, and coreDisplayName() (no label) in meta.connectorName",
  fn: async () => {
    class _ZanixLoggedFailingConnector extends ZanixConnector {
      public initialize() {
        throw new Error('boom')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const logSpy = spy(logger, 'error')

    const conn = new _ZanixLoggedFailingConnector({
      autoInitialize: { timeoutConnection: 30, retryInterval: 10 },
    })
    await conn.isReady.catch(() => {})

    assertEquals(logSpy.calls.length, 1)
    const [message, error] = logSpy.calls[0].args as [string, { meta?: { connectorName?: string } }]

    // The message: explicit 'from core' label, never the raw `_Zanix...` constructor name.
    assert(message.includes("'from core'"), `expected 'from core' in: ${message}`)
    assert(!message.includes('_Zanix'), `did not expect '_Zanix' in: ${message}`)

    // meta.connectorName: coreDisplayName with NO label — falls back to `${connectorKey} core`
    // (empty connectorKey here, since this connector was never `@Connector`-decorated), NOT
    // 'from core' — that label is scoped to the message above only.
    assertEquals(error.meta?.connectorName, ' core')

    logSpy.restore()
  },
})

Deno.test({
  name:
    'ZanixConnector: the init-failure log carries the ALS-resolved contextId when the connector is constructed inside a request context (e.g. a `postBoot`/`lazy` connector resolved on demand)',
  fn: async () => {
    class FailingConnector extends ZanixConnector {
      public initialize() {
        throw new Error('boom')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const logSpy = spy(logger, 'error')

    const conn = asyncContext.runWith(
      'req-context-id',
      () =>
        new FailingConnector({
          autoInitialize: { timeoutConnection: 30, retryInterval: 10 },
        }),
    )
    await conn.isReady.catch(() => {})

    assertEquals(logSpy.calls.length, 1)
    const [, error] = logSpy.calls[0].args as [string, { contextId?: string }]
    assertEquals(error.contextId, 'req-context-id')

    logSpy.restore()
  },
})

Deno.test({
  name:
    'ZanixConnector: the init-failure log has no contextId when constructed outside any AsyncContext (e.g. onSetup/onBoot, boot-time)',
  fn: async () => {
    class FailingConnector extends ZanixConnector {
      public initialize() {
        throw new Error('boom')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const logSpy = spy(logger, 'error')

    const conn = new FailingConnector({
      autoInitialize: { timeoutConnection: 30, retryInterval: 10 },
    })
    await conn.isReady.catch(() => {})

    assertEquals(logSpy.calls.length, 1)
    const [, error] = logSpy.calls[0].args as [string, { contextId?: string }]
    assertEquals(error.contextId, undefined)

    logSpy.restore()
  },
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
