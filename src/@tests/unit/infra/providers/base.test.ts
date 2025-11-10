import { ZanixProvider } from 'providers/base.ts'
import { ZanixConnector } from '@zanix/server'
import { assert } from '@std/assert'
import { getTargetKey } from 'utils/targets.ts'
import Program from 'modules/program/mod.ts'

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
