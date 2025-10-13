import { assertEquals } from '@std/assert'
import { TargetBaseClass } from 'modules/infra/base/target.ts'

// Concrete subclass for testing
class TestTarget extends TargetBaseClass {
  public getZnxProps() {
    return this['_znxProps']
  }
}

Deno.test('TargetBaseClass initializes _znxProps with default values', () => {
  const instance = new TestTarget()

  const props = instance.getZnxProps()

  assertEquals(props.data, {})
  assertEquals(props.startMode, 'lazy')
  assertEquals(props.lifetime, 'TRANSIENT')
  assertEquals(props.type, '')
  assertEquals(props.key, '')
})
