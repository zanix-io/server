import { assert, assertThrows } from '@std/assert'
import { HttpError, InternalError } from '@zanix/errors'
import { ZanixCacheProvider } from 'providers/core/cache.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import Program from 'modules/program/mod.ts'

console.error = () => {}

class TestCacheConnector extends ZanixConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}

class TestCacheProvider extends ZanixCacheProvider {}

Deno.test('ZanixCacheProvider: cache getter is blocked, use `this` instead', () => {
  const provider = new TestCacheProvider('id')

  assertThrows(
    () => provider['cache'],
    InternalError,
    'Direct access to `cache` is not allowed. Use `this` instead.',
  )
})

Deno.test({
  name: 'ZanixCacheProvider: use() / redis / local getters delegate to the matching connector',
  fn: () => {
    Program.targets.defineTarget('cache:redis', {
      Target: TestCacheConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })
    Program.targets.defineTarget('cache:local', {
      Target: TestCacheConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })

    const provider = new TestCacheProvider('id')

    assert(provider.use('redis') instanceof TestCacheConnector)
    assert(provider.redis instanceof TestCacheConnector)
    assert(provider.local instanceof TestCacheConnector)
  },
})

Deno.test({
  name:
    'ZanixCacheProvider: default getCachedOrFetch/getCachedOrRevalidate/saveToCaches/withLock throw',
  fn: () => {
    const provider = new TestCacheProvider('id')

    assertThrows(
      () => provider.getCachedOrFetch('redis', 'key'),
      HttpError,
      'An error occurred in the system',
    )
    assertThrows(
      () => provider.getCachedOrRevalidate('redis', 'key'),
      HttpError,
      'An error occurred in the system',
    )
    assertThrows(
      () => provider.saveToCaches({ provider: 'redis', key: 'key', value: 'value' }),
      HttpError,
      'An error occurred in the system',
    )
    assertThrows(
      () => provider.withLock('key', () => true),
      HttpError,
      'An error occurred in the system',
    )
  },
})
