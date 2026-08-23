import { assertEquals } from '@std/assert/assert-equals'
import { assertArrayIncludes } from '@std/assert/assert-array-includes'
import { DecoratorsContainer } from 'modules/program/metadata/decorators.ts'

// Define mock types
type DecoratorTypes = 'generic' | 'custom'

interface BaseDecoratorData {
  name: string
  options?: Record<string, unknown>
}

type DecoratorsData<T extends DecoratorTypes> = T extends 'custom'
  ? { name: string; config: string }
  : BaseDecoratorData

Deno.test('DecoratorsContainer: addDecoratorData stores and retrieves data for default', () => {
  const container = new DecoratorsContainer()

  const decorator: DecoratorsData<'generic'> = {
    name: 'Auth',
    options: { required: true },
  }

  container.addDecoratorData(decorator)

  const result = container.getDecoratorsData('generic')
  assertEquals(result.length, 1)
  assertEquals(result[0], decorator)
})

Deno.test('DecoratorsContainer: addDecoratorData stores multiple decorators', () => {
  const container = new DecoratorsContainer()

  const d1: DecoratorsData<'generic'> = { name: 'Logger' }
  const d2: DecoratorsData<'generic'> = { name: 'Cache', options: { ttl: 60 } }

  container.addDecoratorData(d1)
  container.addDecoratorData(d2)

  const result = container.getDecoratorsData('generic')
  assertEquals(result.length, 2)
  assertArrayIncludes(result, [d1, d2])
})

Deno.test('DecoratorsContainer: works with custom decorator type', () => {
  const container = new DecoratorsContainer()

  const customDecorator: DecoratorsData<'custom'> = {
    name: 'MyDecorator',
    config: 'enabled',
  }

  container.addDecoratorData(customDecorator, 'generic')

  const result = container.getDecoratorsData('generic')
  assertEquals(result.length, 1)
  assertEquals(result[0], customDecorator)
})

Deno.test('DecoratorsContainer: getDecoratorsData returns empty array if none stored', () => {
  const container = new DecoratorsContainer()
  const result = container.getDecoratorsData('generic')
  assertEquals(result, [])
})

Deno.test('DecoratorsContainer: deleteDecorators removes stored decorators', () => {
  const container = new DecoratorsContainer()

  const decorator: DecoratorsData<'generic'> = { name: 'Trace' }
  container.addDecoratorData(decorator)

  const beforeDelete = container.getDecoratorsData('generic')
  assertEquals(beforeDelete.length, 1)

  container.deleteDecorators('generic')

  const afterDelete = container.getDecoratorsData('generic')
  assertEquals(afterDelete, [])
})
