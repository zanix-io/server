import { assert, assertEquals, assertStrictEquals } from '@std/assert'
import PublicProgramModule from 'modules/program/public.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from 'providers/base.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { getTargetKey } from 'utils/targets.ts'

Deno.test('PublicProgramModule.registry: exposes the ProgramModule registry container', () => {
  assertEquals(PublicProgramModule.registry, ProgramModule.registry)
})

class PublicTestProvider extends ZanixProvider {
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
}

class PublicTestConnector extends ZanixConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}

Deno.test({
  name: 'PublicProgramModule.providers: shorthand resolves the same singleton as getProviders()',
  fn: () => {
    ProgramModule.targets.defineTarget(getTargetKey(PublicTestProvider), {
      Target: PublicTestProvider,
      type: 'provider',
      lifetime: 'SINGLETON',
    })

    const viaShorthand = PublicProgramModule.providers.get(PublicTestProvider)
    const viaMethod = PublicProgramModule.getProviders().get(PublicTestProvider)

    assert(viaShorthand instanceof PublicTestProvider)
    assertStrictEquals(viaShorthand, viaMethod)
  },
})

Deno.test({
  name: 'PublicProgramModule.connectors: shorthand resolves the same singleton as getConnectors()',
  fn: () => {
    ProgramModule.targets.defineTarget(getTargetKey(PublicTestConnector), {
      Target: PublicTestConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })

    const viaShorthand = PublicProgramModule.connectors.get(PublicTestConnector)
    const viaMethod = PublicProgramModule.getConnectors().get(PublicTestConnector)

    assert(viaShorthand instanceof PublicTestConnector)
    assertStrictEquals(viaShorthand, viaMethod)
  },
})
