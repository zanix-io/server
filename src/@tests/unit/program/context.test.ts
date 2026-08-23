import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { ContextContainer } from 'modules/program/metadata/context.ts'

// Mock BaseContext and BaseContainer behavior for test
class MockBaseContext {
  constructor(public id: string, public value: unknown) {}
}

Deno.test('ContextContainer: addContext stores data correctly', () => {
  const container = new ContextContainer()
  const context = new MockBaseContext('123', { foo: 'bar' })

  container.addContext(context)

  const result = container.getContext<MockBaseContext>('123')
  assert(result)
  assertEquals(result.id, '123')
  assertEquals(result.value, { foo: 'bar' })
})

Deno.test('ContextContainer: getContext returns empty object for missing key', () => {
  const container = new ContextContainer()
  const result = container.getContext<MockBaseContext>('non-existent')
  assertEquals(result, {} as never)
})

Deno.test('ContextContainer: deleteContext removes stored context', () => {
  const container = new ContextContainer()
  const context = new MockBaseContext('456', { bar: 'baz' })

  container.addContext(context)

  const beforeDelete = container.getContext<MockBaseContext>('456')
  assert(beforeDelete)
  assertEquals(beforeDelete.id, '456')

  container.deleteContext('456')

  const afterDelete = container.getContext<MockBaseContext>('456')
  assertEquals(afterDelete, {} as never)
})
