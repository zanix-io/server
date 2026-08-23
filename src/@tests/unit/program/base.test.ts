import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { RegistryContainer } from 'modules/program/metadata/registry.ts'

Deno.test('BaseContainer: has() reflects whether data and target keys are stored', () => {
  const container = new RegistryContainer()

  assert(!container['has']('missing-key', 'data'))

  container['setData']('present-key', { foo: 'bar' })
  assert(container['has']('present-key', 'data'))
  assert(!container['has']('present-key', 'target'))

  container['setTarget']('present-target', class {} as never)
  assert(container['has']('present-target', 'target'))
})

Deno.test({
  name: 'BaseContainer: setData/setTarget fall back to the key itself when no data is given',
  fn: () => {
    const container = new RegistryContainer()

    container['setData']('data-key')
    assertEquals(container['getData']('data-key'), 'data-key')

    container['setTarget']('target-key')
    assertEquals(container['getTarget']('target-key') as unknown, 'target-key')
  },
})

Deno.test('BaseContainer: resetContainer accepts a single string key, not just an array', () => {
  const container = new RegistryContainer()

  container['setData']('single-key', { foo: 'bar' })
  assert(container['has']('single-key', 'data'))

  container['resetContainer']('single-key')

  assert(!container['has']('single-key', 'data'))
})
