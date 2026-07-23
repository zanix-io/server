import { assertEquals } from '@std/assert/assert-equals'
import { ZanixDatabaseConnector } from 'modules/infra/connectors/core/database.ts'

// See database-name-empty.test.ts for why mocking `Deno.readTextFileSync` here
// controls the (memoized) result of `readConfig()` for this isolated test file.
Deno.readTextFileSync = (() => `{"name": "${'A'.repeat(100)}"}`) as typeof Deno.readTextFileSync

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

Deno.test('ZanixDatabaseConnector: truncates the sanitized project name to 64 characters', () => {
  const conn = new DBConnector()

  assertEquals(conn['defaultDbName'], 'a'.repeat(64))
})
