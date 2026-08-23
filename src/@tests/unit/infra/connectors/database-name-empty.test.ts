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
  'ZanixDatabaseConnector: falls back to "zanix_system" when the project has no name',
  async () => {
    // `readConfig()` (`@zanix/helpers`) memoizes its result process-wide, keyed by resolved
    // config path — a distinct `Deno.cwd()` (with its own real config file) gets its own cache
    // entry, so this test controls what it resolves to without depending on being the first
    // caller in the process (mocking `Deno.readTextFileSync` at module load time, as this file
    // used to, raced anything else that happened to import the logger first and read the real
    // config before this file's own mock ever installed).
    const dir = getTemporaryFolder(import.meta.url, 'db-empty-')
    await Deno.writeTextFile(dir + '/deno.json', '{"name": ""}')
    const cwdStub = stub(Deno, 'cwd', () => dir)

    try {
      const conn = new DBConnector()
      assertEquals(conn['defaultDbName'], 'zanix_system')
    } finally {
      cwdStub.restore()
      await Deno.remove(dir, { recursive: true })
    }
  },
)
