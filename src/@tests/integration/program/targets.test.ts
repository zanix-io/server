// deno-lint-ignore-file no-explicit-any
import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import { assertArrayIncludes } from '@std/assert/assert-array-includes'
import { TargetContainer } from 'modules/program/metadata/targets.ts'

// Type mocks
type ClassConstructor = new (...args: unknown[]) => unknown

interface MetadataTargetsProps<T extends ClassConstructor> {
  Target: T
  dataProps?: Record<string, unknown>
  type: string
}

Deno.test('TargetContainer: defineTarget stores target class and options', () => {
  const container = new TargetContainer()

  class TestClass {}
  const opts: MetadataTargetsProps<typeof TestClass> = {
    Target: TestClass,
    dataProps: { foo: 'bar' },
    type: 'interactor',
  }

  container.defineTarget('serviceA', opts as never)

  assert(container.getTargetsByType('interactor').includes('serviceA'))
  assertEquals(container.getInstance('serviceA', 'interactor'), new TestClass())
  assertEquals(container.getInstance('serviceA', 'interactor')['_znxProps'].data, { foo: 'bar' })
})

Deno.test('TargetContainer: addProperty adds single property', () => {
  const container = new TargetContainer()
  const Target = {} as any

  container.addProperty({ Target, propertyKey: 'handleRequest' })

  const properties = container.getProperties({ Target })
  assertEquals(properties, ['handleRequest'])
})

Deno.test('TargetContainer: addProperty prevents duplicates', () => {
  const container = new TargetContainer()
  const Target = {} as any

  container.addProperty({ Target, propertyKey: 'init' })
  container.addProperty({ Target, propertyKey: 'init' }) // Duplicate

  const properties = container.getProperties({ Target })
  assertEquals(properties.length, 1)
  assertEquals(properties[0], 'init')
})

Deno.test('TargetContainer: addProperty supports multiple distinct properties', () => {
  const container = new TargetContainer()
  const Target = {} as any

  container.addProperty({ Target, propertyKey: 'start' })
  container.addProperty({ Target, propertyKey: 'stop' })

  const properties = container.getProperties({ Target })
  assertEquals(properties.length, 2)
  assertArrayIncludes(properties, ['start', 'stop'])
})

Deno.test('TargetContainer: getProperties returns empty array if none added', () => {
  const container = new TargetContainer()
  const Target = {} as any

  const properties = container.getProperties({ Target })
  assertEquals(properties, [])
})
