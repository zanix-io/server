import { assert, assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { HttpError, InternalError } from '@zanix/errors'
import { ZanixCacheProvider } from 'providers/core/cache.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import Program from 'modules/program/mod.ts'
import { registerCoreConnectorSlot } from 'connectors/core/all.ts'
import { ZanixCacheConnector } from 'connectors/core/cache.ts'

// `'cache:redis'`/`'cache:local'` are no longer self-registered by `@zanix/server` itself
// (ownership moved to `@zanix/datamaster`'s own `/core`) — this test simulates that registration
// directly, since this suite doesn't depend on that package.
registerCoreConnectorSlot('cache:redis', ZanixCacheConnector)
registerCoreConnectorSlot('cache:local', ZanixCacheConnector)

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
    'ZanixCacheProvider: use("memcached") never silently resolves the "cache:local" connector ' +
    "when memcached itself was never registered (regression for connectorCoreModules' " +
    "'cache:memcached' entry once pointing its own `key` at 'cache:local')",
  fn: () => {
    // Deliberately asymmetric setup, matching the one real window this bug is reachable through:
    // `registerCoreConnectorSlot` always re-derives `.key` from its own call argument, so once a
    // slot is legitimately registered, a stale/wrong pre-seeded `key` self-heals — a "both slots
    // properly registered" test (see below) can never observe this regression. The only place a
    // wrong `connectorCoreModules['cache:memcached'].key` is actually observable is exactly here:
    // 'cache:local' is registered (the common case, it's the default cache), 'cache:memcached'
    // itself never was. `ZanixCacheProvider.use('memcached')` reads
    // `connectorCoreModules['cache:memcached'].key` directly (bypassing `getCoreConnectorSlot`
    // entirely) to build the connector lookup key — if that `key` field were ever wrong again (e.g.
    // pointing back at `'cache:local'`), this call would silently return the registered LOCAL
    // connector instead of throwing the correct "cache:memcached instance is not available" error.
    //
    // Must run before the "both properly registered" test below: once `'cache:memcached'` is
    // legitimately registered anywhere in this file, it stays registered (and its singleton
    // instance stays cached) for the rest of the file's run, masking this exact regression.
    class TestLocalOnlyConnector extends TestCacheConnector {}

    // `'cache:local'` is already registered at module top (`registerCoreConnectorSlot`,
    // shared across this file's tests) — re-registering it here with a different base class would
    // throw the slot's own conflict guard, so only the runtime instantiation target is redefined.
    Program.targets.defineTarget('cache:local', {
      Target: TestLocalOnlyConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })

    const provider = new TestCacheProvider('id')

    // Must throw, naming the real missing slot ('cache:memcached') — never silently succeed with
    // the 'cache:local' connector instance instead.
    const thrown = assertThrows(
      () => provider.use('memcached'),
      HttpError,
      'An error occurred in the system',
    ) as unknown as { cause?: unknown; meta?: { connector?: unknown } }

    assertEquals(thrown.meta?.connector, 'cache:memcached')
    assertStringIncludes(String(thrown.cause), 'cache:memcached')
  },
})

Deno.test({
  name:
    'ZanixCacheProvider: use("memcached") resolves its own dedicated connector, distinct from "local"' +
    ', when both are properly registered',
  fn: () => {
    // Two DISTINCT connector classes, one registered per slot — a happy-path/completeness check
    // for `use('memcached')` (previously untested; only 'redis'/'local' had coverage). Note this
    // alone can't catch a `connectorCoreModules['cache:memcached'].key` typo regression: legitimate
    // registration via `registerCoreConnectorSlot` always re-derives `.key` from its own call
    // argument, so it self-heals any stale/wrong `key` the pre-seed might have carried — see the
    // regression test above for the scenario that actually catches that class of bug.
    class TestMemcachedOnlyConnector extends TestCacheConnector {}
    class TestLocalOnlyConnector extends TestCacheConnector {}

    registerCoreConnectorSlot('cache:memcached', TestMemcachedOnlyConnector)

    Program.targets.defineTarget('cache:memcached', {
      Target: TestMemcachedOnlyConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })
    Program.targets.defineTarget('cache:local', {
      Target: TestLocalOnlyConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })

    const provider = new TestCacheProvider('id')
    const resolved = provider.use('memcached')

    assert(resolved instanceof TestMemcachedOnlyConnector)
    assert(!(resolved instanceof TestLocalOnlyConnector))

    // The `memcached` convenience getter (same shortcut shape as `redis`/`local`) delegates to the
    // same `use('memcached')` call, not a separate lookup.
    assert(provider.memcached instanceof TestMemcachedOnlyConnector)
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
      () =>
        provider.saveToCaches({
          provider: 'redis',
          key: 'key',
          value: 'value',
        }),
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
