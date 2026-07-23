import { assert } from '@std/assert/assert'
import { closeAllConnections, getTargetKey } from 'utils/targets.ts'
import { cleanupInitializationsMetadata } from 'utils/targets.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import Program from 'modules/program/mod.ts'

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
