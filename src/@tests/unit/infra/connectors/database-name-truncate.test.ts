import { assertEquals } from '@std/assert/assert-equals'
import { stub } from '@std/testing/mock'
import { getTemporaryFolder } from '@zanix/helpers'
import { ZanixDatabaseConnector } from 'modules/infra/connectors/core/database.ts'

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

Deno.test(
  'ZanixDatabaseConnector: truncates the sanitized project name to 64 characters',
  async () => {
    // See database-name-empty.test.ts for why a distinct `Deno.cwd()`/config file, not a
    // process-wide `Deno.readTextFileSync` mock, is what actually isolates this test.
    const dir = getTemporaryFolder(import.meta.url, 'db-truncate-')
    await Deno.writeTextFile(dir + '/deno.json', `{"name": "${'A'.repeat(100)}"}`)
    const cwdStub = stub(Deno, 'cwd', () => dir)

    try {
      const conn = new DBConnector()
      assertEquals(conn['defaultDbName'], 'a'.repeat(64))
    } finally {
      cwdStub.restore()
      await Deno.remove(dir, { recursive: true })
    }
  },
)
