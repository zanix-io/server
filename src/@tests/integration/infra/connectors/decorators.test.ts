// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import Program from 'modules/program/mod.ts'
import { defineConnectorDecorator } from 'modules/infra/connectors/decorators/assembly.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import ConnectorCoreModules from 'modules/infra/connectors/core/all.ts'

class CacheConnector extends ZanixConnector {
  protected override initialize(): Promise<void> | void {
    throw new Error('Method not implemented.')
  }
  protected override close(): unknown {
    throw new Error('Method not implemented.')
  }
  public override isHealthy(): Promise<boolean> | boolean {
    throw new Error('Method not implemented.')
  }
}
class DbConnector extends ZanixConnector {
  protected override initialize(): Promise<void> | void {
    throw new Error('Method not implemented.')
  }
  protected override close(): unknown {
    throw new Error('Method not implemented.')
  }
  public override isHealthy(): Promise<boolean> | boolean {
    throw new Error('Method not implemented.')
  }
}
class InvalidConnector {} // Doesn't extend ZanixConnector

const mockGetTargetKey = (_Target: any) => 'CustomConnector'

const mockDefineTarget = {
  calls: [] as unknown[],
  defineTarget(key: string, opts: Record<string, unknown>) {
    this.calls.push({ key, opts })
  },
  reset() {
    this.calls = []
  },
}

// deno-lint-ignore camelcase
const mockCORE_CONNECTORS = {
  cache: { Target: CacheConnector },
  database: { Target: DbConnector },
}

// Inject into global (mocking actual imports)
Program.targets.defineTarget = mockDefineTarget.defineTarget.bind(mockDefineTarget)
ConnectorCoreModules['cache:local'] = mockCORE_CONNECTORS.cache as any
ConnectorCoreModules['database'] = mockCORE_CONNECTORS.database as any // Override imported `getTargetKey` (simulate the import)
;(globalThis as any).getTargetKey = mockGetTargetKey

Deno.test('defineConnectorDecorator: registers non-core connector with default settings', () => {
  mockDefineTarget.reset()

  class CustomConnector extends ZanixConnector {
    protected override initialize(): Promise<void> | void {
      throw new Error('Method not implemented.')
    }
    protected override close(): unknown {
      throw new Error('Method not implemented.')
    }
    public override isHealthy(): Promise<boolean> | boolean {
      throw new Error('Method not implemented.')
    }
  }

  const decorator = defineConnectorDecorator({ type: 'custom' })
  decorator(CustomConnector)

  const call = mockDefineTarget.calls[0] as any
  assertEquals(call.key, 'Z$CustomConnector$1')
  assertEquals(call.opts.Target, CustomConnector)
  assertEquals(call.opts.type, 'connector')
  assertEquals(call.opts.dataProps.type, 'custom')
  assertEquals(call.opts.startMode, 'postBoot') // default
  assertEquals(call.opts.lifetime, 'SINGLETON') // default
})

Deno.test('defineConnectorDecorator: registers core connector with correct base', () => {
  mockDefineTarget.reset()

  class CacheImpl extends CacheConnector {}

  const decorator = defineConnectorDecorator({ type: 'cache:local' })
  decorator(CacheImpl as never)

  const call = mockDefineTarget.calls[0] as any
  assertEquals(call.key, 'cache:local')
  assertEquals(call.opts.Target, CacheImpl)
  assertEquals(call.opts.dataProps.type, 'cache:local')
})

Deno.test("defineConnectorDecorator: throws if class doesn't extend ZanixConnector", () => {
  const decorator = defineConnectorDecorator({ type: 'custom' })

  assertThrows(() => {
    decorator(InvalidConnector as any)
  }, Deno.errors.Interrupted)
})

Deno.test("defineConnectorDecorator: throws if core connector doesn't extend required base", () => {
  class WrongHttpBase extends ZanixConnector {
    protected override initialize(): Promise<void> | void {
      throw new Error('Method not implemented.')
    }
    protected override close(): unknown {
      throw new Error('Method not implemented.')
    }
    public override isHealthy(): Promise<boolean> | boolean {
      throw new Error('Method not implemented.')
    }
  }

  const decorator = defineConnectorDecorator({ type: 'cache:local' })

  assertThrows(() => {
    decorator(WrongHttpBase as any)
  }, Deno.errors.Interrupted)
})

Deno.test('defineConnectorDecorator: supports short string syntax', () => {
  mockDefineTarget.reset()

  class DbImpl extends DbConnector {}

  const decorator = defineConnectorDecorator('database')
  decorator(DbImpl as never)

  const call = mockDefineTarget.calls[0] as any
  assertEquals(call.key, 'database')
  assertEquals(call.opts.Target, DbImpl)
})
