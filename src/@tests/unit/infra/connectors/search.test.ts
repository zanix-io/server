import { assert, assertEquals } from '@std/assert'
import { RestClient } from 'modules/infra/connectors/core/rest.ts'
import { ZanixSearchConnector } from 'modules/infra/connectors/core/search.ts'

class MySearchConnector extends ZanixSearchConnector {
  public indexed: Array<{ doc: Record<string, unknown>; index?: string }> = []

  public override index(
    doc: Record<string, unknown>,
    opts?: { index?: string },
  ): Promise<void> {
    this.indexed.push({ doc, index: opts?.index })
    return Promise.resolve()
  }

  public override bulkIndex(
    docs: Record<string, unknown>[],
    opts?: { index?: string },
  ): Promise<{ errors: boolean; failedCount: number }> {
    for (const doc of docs) this.indexed.push({ doc, index: opts?.index })
    return Promise.resolve({ errors: false, failedCount: 0 })
  }
}

Deno.test('ZanixSearchConnector: extends RestClient, inheriting its lifecycle/http helpers', () => {
  const connector = new MySearchConnector({ autoInitialize: false })

  assert(connector instanceof RestClient)
  assertEquals(connector.isHealthy(), true)
  assert(typeof connector.http.get === 'function')
  assert(typeof connector.http.post === 'function')
})

Deno.test('ZanixSearchConnector: concrete subclass implements index/bulkIndex', async () => {
  const connector = new MySearchConnector({ autoInitialize: false })

  await connector.index({ message: 'hi' }, { index: 'logs' })
  const result = await connector.bulkIndex([{ a: 1 }, { a: 2 }])

  assertEquals(connector.indexed, [
    { doc: { message: 'hi' }, index: 'logs' },
    { doc: { a: 1 }, index: undefined },
    { doc: { a: 2 }, index: undefined },
  ])
  assertEquals(result, { errors: false, failedCount: 0 })
})
