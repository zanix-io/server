import { ZanixDatabaseConnector } from 'modules/infra/connectors/database.ts'
import { assert, assertEquals } from '@std/assert'
import { ZANIX_PROPS } from 'utils/constants.ts'

class DBConnector extends ZanixDatabaseConnector {
  public getModel(model: string): string {
    return model + ' processed'
  }

  public startConnection(): boolean {
    return true
  }

  public stopConnection(): boolean {
    return true
  }
}

Deno.test('ZanixDatabaseConnector: should define a database name', () => {
  const conn = new DBConnector()

  const dbName = conn['defaultDbName']
  assertEquals(dbName, 'zanix_server')
})

Deno.test('ZanixDatabaseConnector: should run seeders', async () => {
  const conn = new DBConnector()
  await conn.connectorReady

  assertEquals(conn['connected'], true)
  let seedExecution = 0
  let lastSeeder = ''
  await conn['runSeeders']([{
    model: 'model',
    handlers: [
      (model: string, context) => {
        assertEquals(model, 'model processed')
        seedExecution += 1
        context['connected'] = false
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

  assertEquals(conn['connected'], false)
  assertEquals(conn[ZANIX_PROPS].data['db'], 'model/db')
  assert(conn['secondSeeder' as never])
  assertEquals(seedExecution, 3)
  assertEquals(lastSeeder, '2')
})
