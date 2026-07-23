import { ZanixProvider } from 'providers/base.ts'
import { assert, assertThrows } from '@std/assert'
import { getTargetKey } from 'utils/targets.ts'
import Program from 'modules/program/mod.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { HttpError } from '@zanix/errors'

console.error = () => {}

class TestProvider extends ZanixProvider {
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
}

class OtherProvider extends TestProvider {
}

class TestConnector extends ZanixConnector {
  protected override initialize(): Promise<void> | void {
  }
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}

Deno.test('ZanixConnector: should interact with other connectors and providers', () => {
  Program.targets.defineTarget(getTargetKey(OtherProvider), {
    Target: OtherProvider,
    type: 'provider',
    lifetime: 'SINGLETON',
  })
  Program.targets.defineTarget(getTargetKey(TestConnector), {
    Target: TestConnector,
    type: 'connector',
    lifetime: 'SINGLETON',
  })

  const base = new TestProvider('id')

  const connector = base['connectors'].get(TestConnector)
  assert(connector instanceof TestConnector)

  const provider = base['providers'].get(OtherProvider)
  assert(provider instanceof OtherProvider)
})

Deno.test({
  name: 'ZanixProvider: getProviderConnector returns the connector instance when available',
  fn: () => {
    const base = new TestProvider('id')

    const connector = base['getProviderConnector'](TestConnector)
    assert(connector instanceof TestConnector)
  },
})

Deno.test({
  name: 'ZanixProvider: getProviderConnector throws CONNECTOR_INSTANCE_NOT_FOUND when missing',
  fn: () => {
    const base = new TestProvider('id')

    class MissingConnector extends ZanixConnector {
      protected override initialize(): Promise<void> | void {}
      protected override close(): unknown {
        return true
      }
      public override isHealthy() {
        return true
      }
    }

    assertThrows(
      () => base['getProviderConnector'](MissingConnector),
      HttpError,
      'An error occurred in the system',
    )

    // string identifier variant
    assertThrows(
      () => base['getProviderConnector']('unknownCoreConnector' as never),
      HttpError,
      'An error occurred in the system',
    )
  },
})

Deno.test('ZanixProvider: default use() throws METHOD_NOT_IMPLEMENTED', () => {
  class DefaultProvider extends ZanixProvider {}

  const provider = new DefaultProvider('id')

  assertThrows(
    () => provider.use('anything'),
    HttpError,
    'An error occurred in the system',
  )
})
