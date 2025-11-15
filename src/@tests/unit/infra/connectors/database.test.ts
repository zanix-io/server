import { ZanixDatabaseConnector } from 'modules/infra/connectors/core/database.ts'
import { assert, assertEquals } from '@std/assert'
import { ZANIX_PROPS } from 'utils/constants.ts'

class DBConnector extends ZanixDatabaseConnector {
  protected override initialize() {
  }

  protected override close(): boolean {
    return true
  }
  public override isHealthy(): Promise<boolean> | boolean {
    throw new Error('Method not implemented.')
  }
  public getModel(model: string): string {
    return model + ' processed'
  }
}

Deno.test('ZanixDatabaseConnector: should define a database name', () => {
  const conn = new DBConnector()

  const dbName = conn['defaultDbName']
  assertEquals(dbName, 'zanix_server')
})

Deno.test('ZanixDatabaseConnector: should run seeders', async () => {
  const conn = new DBConnector()
  assert(await conn.isReady)

  let seedExecution = 0
  let lastSeeder = ''
  await conn['runSeeders']([{
    model: 'model',
    handlers: [
      (model: string, context) => {
        assertEquals(model, 'model processed')
        seedExecution += 1
        context.constructor.prototype['firstSeeder'] = true
        lastSeeder = '1'
      },
      function (model, context) {
        assertEquals(model, 'model processed')
        seedExecution += 1
        context.constructor.prototype['secondSeeder'] = true
        lastSeeder = '2'
      },
    ],
  }, {
    model: 'second model',
    handlers: [
      function (model: string, context) {
        assertEquals(model, 'second model processed')
        context[ZANIX_PROPS].data['db'] = 'model/db'
        seedExecution += 1
      },
    ],
  }])

  assert(conn['firstSeeder' as never])
  assertEquals(conn[ZANIX_PROPS].data['db'], 'model/db')
  assert(conn['secondSeeder' as never])
  assertEquals(seedExecution, 3)
  assertEquals(lastSeeder, '2')
})
