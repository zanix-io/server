import { assertEquals, assertStrictEquals } from '@std/assert'
import { RegistryContainer } from 'modules/program/metadata/registry.ts'

Deno.test('set() stores and get() returns a registry', () => {
  const registry = new RegistryContainer()

  registry.set('users', { foo: 'bar' })

  assertEquals(registry.get('users'), { foo: 'bar' })
})

Deno.test('get() returns undefined for unknown registry', () => {
  const registry = new RegistryContainer()

  assertStrictEquals(registry.get('missing'), undefined)
})

Deno.test('delete() removes a registry', () => {
  const registry = new RegistryContainer()

  registry.set('users', { foo: 'bar' })
  registry.delete('users')

  assertStrictEquals(registry.get('users'), undefined)
})

Deno.test('push() creates a registry automatically', () => {
  const registry = new RegistryContainer()

  registry.push('plugins', 'a')

  assertEquals(registry.array('plugins'), ['a'])
})

Deno.test('push() appends values', () => {
  const registry = new RegistryContainer()

  registry.push('plugins', 'a')
  registry.push('plugins', 'b')

  assertEquals(registry.array('plugins'), ['a', 'b'])
})

Deno.test('array() returns an empty array when missing', () => {
  const registry = new RegistryContainer()

  assertEquals(registry.array('plugins'), [])
})

Deno.test('setEntry() creates an object registry automatically', () => {
  const registry = new RegistryContainer()

  registry.setEntry('actions', 'mail', { enabled: true })

  assertEquals(registry.get('actions'), {
    mail: { enabled: true },
  })
})

Deno.test('setEntry() replaces an existing entry', () => {
  const registry = new RegistryContainer()

  registry.setEntry('actions', 'mail', { enabled: true })
  registry.setEntry('actions', 'mail', { enabled: false })

  assertEquals(registry.getEntry('actions', 'mail'), {
    enabled: false,
  })
})

Deno.test('getEntry() returns undefined when missing', () => {
  const registry = new RegistryContainer()

  assertStrictEquals(
    registry.getEntry('actions', 'mail'),
    undefined,
  )
})

Deno.test('deleteEntry() removes an existing entry', () => {
  const registry = new RegistryContainer()

  registry.setEntry('actions', 'mail', { enabled: true })
  registry.deleteEntry('actions', 'mail')

  assertStrictEquals(
    registry.getEntry('actions', 'mail'),
    undefined,
  )
})

Deno.test('deleteEntry() is a no-op for unknown registries', () => {
  const registry = new RegistryContainer()

  registry.deleteEntry('missing', 'mail')

  assertStrictEquals(registry.get('missing'), undefined)
})
