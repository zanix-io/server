import { assertEquals } from '@std/assert/assert-equals'
import { ZanixDatabaseConnector } from 'modules/infra/connectors/core/database.ts'

// `readConfig()` (from `@zanix/helpers`) memoizes its result the first time it's called
// with a given path. This is the first call in this isolated test file/module graph,
// so mocking `Deno.readTextFileSync` before it runs lets us control what it reads.
Deno.readTextFileSync = (() => '{"name": ""}') as typeof Deno.readTextFileSync

class DBConnector extends ZanixDatabaseConnector {
  protected override initialize() {}
  protected override close(): boolean {
    return true
  }
  public override isHealthy(): Promise<boolean> | boolean {
    return true
  }
  public getModel(model: string): string {
    return model
  }
}

Deno.test({
  name: 'ZanixDatabaseConnector: falls back to "zanix_system" when the project has no name',
  fn: () => {
    const conn = new DBConnector()

    assertEquals(conn['defaultDbName'], 'zanix_system')
  },
})
