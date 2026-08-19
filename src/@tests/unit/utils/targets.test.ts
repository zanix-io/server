import { assert } from '@std/assert/assert'
import { assertAlmostEquals } from '@std/assert/assert-almost-equals'
import {
  closeAllConnections,
  connectorModuleInitialization,
  getConnectorKey,
  getTargetKey,
  targetInitializations,
} from 'utils/targets.ts'
import { cleanupInitializationsMetadata } from 'utils/targets.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import Program from 'modules/program/mod.ts'
import { assertEquals } from '@std/assert/assert-equals'
import { assertRejects } from '@std/assert/assert-rejects'
import { InternalError } from '@zanix/errors'
import { ZANIX_PROPS } from 'utils/constants.ts'
import { spy } from '@std/testing/mock'
import logger from '@zanix/logger'

console.error = () => {}

Deno.test('closeAllConnections: closes every existing connector instance', async () => {
  let closed = false

  class TestConnector extends ZanixConnector {
    protected override initialize(): Promise<void> | void {}
    protected override close(): unknown {
      closed = true
      return true
    }
    public override isHealthy() {
      return true
    }
  }

  const key = getTargetKey(TestConnector)
  Program.targets.defineTarget(key, {
    Target: TestConnector,
    type: 'connector',
    lifetime: 'SINGLETON',
  })

  // Instantiate it so an existing instance is available to close.
  Program.targets.getConnector(key)

  await closeAllConnections()

  assert(closed)
})

Deno.test('cleanupInitializationsMetadata: resets onBoot and postBoot metadata', () => {
  cleanupInitializationsMetadata()
})

Deno.test('getConnectorKey returns the connector key', () => {
  class Target {}

  ;(Target.prototype as Record<PropertyKey, unknown>)[ZANIX_PROPS] = {
    key: 'my-connector',
  }

  assertEquals(getConnectorKey(Target), 'my-connector')
})

Deno.test('getConnectorKey returns undefined when metadata does not exist', () => {
  class Target {}

  assertEquals(getConnectorKey(Target), undefined)
})

Deno.test(
  "targetInitializations('postBoot'): a connector failure never rejects, and is logged only once",
  async () => {
    class PostBootFailingConnector extends ZanixConnector {
      public initialize() {
        throw new Error('postboot boom')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    PostBootFailingConnector.prototype[ZANIX_PROPS] = {
      ...PostBootFailingConnector.prototype[ZANIX_PROPS],
      data: {
        ...PostBootFailingConnector.prototype[ZANIX_PROPS]?.data,
        autoInitialize: { timeoutConnection: 30, retryInterval: 10 },
      },
    }

    const key = getTargetKey(PostBootFailingConnector)
    Program.targets.defineTarget(key, {
      Target: PostBootFailingConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
      startMode: 'postBoot',
    })

    const logSpy = spy(logger, 'error')

    // Must resolve, not throw — postBoot never blocks/fails the caller.
    await targetInitializations('postBoot')

    // Logged once by the connector's own init-failure handler (`connectors/base.ts`); the
    // `postBoot` safety net in `targetInitializations` itself is a no-op here since the error was
    // already stamped `_logged: true` by that first call — see `logAppError`'s own doc.
    assertEquals(logSpy.calls.length, 1)

    logSpy.restore()
  },
)

Deno.test(
  "targetInitializations('onBoot'): a connector failure still rejects (fail-fast is unchanged)",
  async () => {
    class OnBootFailingConnector extends ZanixConnector {
      public initialize() {
        throw new Error('onboot boom')
      }
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    OnBootFailingConnector.prototype[ZANIX_PROPS] = {
      ...OnBootFailingConnector.prototype[ZANIX_PROPS],
      data: {
        ...OnBootFailingConnector.prototype[ZANIX_PROPS]?.data,
        // A retry budget wide enough that a single retry (if it wrongly happened) would clearly
        // overshoot the timing tolerance below — comfortably wider than that tolerance so this
        // isn't flaky under a loaded/shared CI machine.
        autoInitialize: { timeoutConnection: 1000, retryInterval: 200 },
      },
    }

    const key = getTargetKey(OnBootFailingConnector)
    Program.targets.defineTarget(key, {
      Target: OnBootFailingConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
      startMode: 'onBoot',
    })

    const time = Date.now()
    await assertRejects(() => targetInitializations('onBoot'), Error, 'onboot boom')
    // `onBoot` never retries `initialize()` (see `ZanixConnector`'s own doc) — rejects almost
    // immediately, not after waiting out retryInterval/timeoutConnection. Tolerance (80ms) stays
    // well under retryInterval (200ms), so a single wrongly-triggered retry would still fail this.
    assertAlmostEquals(Date.now() - time, 0, 80)
  },
)

Deno.test({
  name:
    "connectorModuleInitialization: the health-check-timeout error's meta.connectorName resolves via coreDisplayName (no label), never the raw `_Zanix...` constructor name",
  fn: async () => {
    class _ZanixNeverHealthyConnector extends ZanixConnector {
      public initialize() {}
      public isHealthy() {
        return false
      }
      public close() {
        return true
      }
    }

    const conn = new _ZanixNeverHealthyConnector({
      autoInitialize: { timeoutConnection: 30, retryInterval: 10 },
    })

    const error = await connectorModuleInitialization(conn).catch((e) => e)

    assert(error instanceof InternalError)
    // No label passed at this call site — falls back to `${connectorKey} core`, `connectorKey`
    // defaulting to `''` here since this connector was never `@Connector`-decorated.
    assertEquals(error.meta?.connectorName, ' core')
    assert(
      !String(error.meta?.connectorName).includes('_Zanix'),
      'the raw synthetic subclass name must never leak into meta.connectorName',
    )
  },
})
