import { assertEquals } from '@std/assert'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

// Concrete subclass for testing
class TestTarget extends TargetBaseClass {
  public getZnxProps() {
    return this[ZANIX_PROPS]
  }
}

Deno.test('TargetBaseClass initializes Zanix Props with default values', () => {
  const instance = new TestTarget()

  const props = instance.getZnxProps()

  assertEquals(props.data, {})
  assertEquals(props.startMode, 'lazy')
  assertEquals(props.lifetime, 'TRANSIENT')
  assertEquals(props.type, '')
  assertEquals(props.key, '')
})

Deno.test({
  name: 'TargetBaseClass: Zanix Props is non-enumerable so it never leaks through serialization',
  fn: () => {
    const instance = new TestTarget()

    assertEquals(Object.keys(instance).includes(ZANIX_PROPS), false)
    assertEquals(JSON.stringify(instance).includes('_znx_props_'), false)
    assertEquals(Object.prototype.propertyIsEnumerable.call(instance, ZANIX_PROPS), false)

    // Direct access still works: only enumeration is affected, not readability.
    assertEquals(instance.getZnxProps().lifetime, 'TRANSIENT')
  },
})

Deno.test({
  name:
    "TargetBaseClass: a subclass without its own registered metadata keeps its own defaults, not an ancestor prototype's",
  fn: () => {
    class RegisteredParent extends TargetBaseClass {
      public getZnxProps() {
        return this[ZANIX_PROPS]
      }
    }
    RegisteredParent.prototype[ZANIX_PROPS] = {
      data: { foo: 'bar' },
      startMode: 'onBoot',
      lifetime: 'SINGLETON',
      type: 'connector' as never,
      key: 'parent-key',
    }

    class UnregisteredChild extends RegisteredParent {}

    const child = new UnregisteredChild()

    // Not inherited from RegisteredParent.prototype: falls back to the class's own defaults.
    assertEquals(child.getZnxProps().lifetime, 'TRANSIENT')
    assertEquals(child.getZnxProps().key, '')
  },
})
