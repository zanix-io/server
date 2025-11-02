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
