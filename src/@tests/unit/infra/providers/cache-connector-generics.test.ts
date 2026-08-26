import { assert, assertEquals } from '@std/assert'
import { ZanixCacheProvider } from 'providers/core/cache.ts'
import { ZanixCacheConnector } from 'connectors/core/cache.ts'
import Program from 'modules/program/mod.ts'
import { registerCoreConnectorSlot } from 'connectors/core/all.ts'
import type { ConnectorOptions } from 'typings/targets.ts'

/**
 * `ZanixCacheProvider`'s `Connectors` generic (a single object-shaped parameter — see
 * `ZanixCacheProviderConnectors`'s own doc — not one class-level generic per cache backend).
 * Separate file from `cache.test.ts` on purpose: `'cache:redis'`/`'cache:memcached'` are
 * `SINGLETON`-lifetime connector slots, so once EITHER is resolved once (as `cache.test.ts` already
 * does, with its own `TestCacheConnector`), the cached instance survives for the rest of that
 * file's run — `deno test` isolates module state PER FILE (confirmed via a real repro), so a fresh
 * file is what actually gets a fresh, unresolved singleton for each of these two slots.
 */

// `ZanixCacheConnector`'s own constructor requires `ttl` (no default) — DI instantiates a
// connector target with no cache-specific options, so this override supplies one. A plain
// function, not a shared generic base class: `P`'s own conditional return types
// (`Async<V>['local' extends P ? 'sync' : 'async']`) only resolve to a concrete branch once `P`
// itself is a literal, not while still a class-level generic parameter.
function withDefaultTtl(options: ConnectorOptions = {}): ConnectorOptions & { ttl: number } {
  return { ttl: 60, ...options }
}

/**
 * Two DISTINCT, fully-concrete `ZanixCacheConnector` implementations narrowing
 * `ZanixCacheProvider`'s `Connectors` generic — the mechanism a real consumer uses to get
 * `this.redis`/`this.memcached` typed as that concrete class (including its own `getClient`
 * override) instead of the loose `ZanixCacheConnectorGeneric<'redis' | 'memcached'>` default.
 * Declared once here, at the class level, instead of per-call.
 */
class ConcreteRedisConnector extends ZanixCacheConnector<never, unknown, 'redis'> {
  public marker = 'redis' as const
  constructor(options: ConnectorOptions = {}) {
    super(withDefaultTtl(options))
  }
  protected override initialize(): void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy(): boolean {
    return true
  }
  public override getClient<T = Map<never, never>>(): T {
    return new Map() as T
  }
  public override set(): Promise<void> {
    return Promise.resolve()
  }
  public override get(): Promise<undefined> {
    return Promise.resolve(undefined)
  }
  public override has(): Promise<boolean> {
    return Promise.resolve(false)
  }
  public override delete(): Promise<boolean> {
    return Promise.resolve(false)
  }
  public override clear(): Promise<void> {
    return Promise.resolve()
  }
  public override size(): Promise<number> {
    return Promise.resolve(0)
  }
  public override keys(): Promise<never[]> {
    return Promise.resolve([])
  }
  public override values<O = unknown>(): Promise<O[]> {
    return Promise.resolve([])
  }
}

class ConcreteMemcachedConnector extends ZanixCacheConnector<never, unknown, 'memcached'> {
  public marker = 'memcached' as const
  constructor(options: ConnectorOptions = {}) {
    super(withDefaultTtl(options))
  }
  protected override initialize(): void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy(): boolean {
    return true
  }
  public override getClient<T = Map<never, never>>(): T {
    return new Map() as T
  }
  public override set(): Promise<void> {
    return Promise.resolve()
  }
  public override get(): Promise<undefined> {
    return Promise.resolve(undefined)
  }
  public override has(): Promise<boolean> {
    return Promise.resolve(false)
  }
  public override delete(): Promise<boolean> {
    return Promise.resolve(false)
  }
  public override clear(): Promise<void> {
    return Promise.resolve()
  }
  public override size(): Promise<number> {
    return Promise.resolve(0)
  }
  public override keys(): Promise<never[]> {
    return Promise.resolve([])
  }
  public override values<O = unknown>(): Promise<O[]> {
    return Promise.resolve([])
  }
}

class NarrowedCacheProvider extends ZanixCacheProvider<object, {
  redis: ConcreteRedisConnector
  memcached: ConcreteMemcachedConnector
}> {}

/** Only `redis` narrowed — `memcached` is deliberately omitted to prove it still falls back to the
 * loose `ZanixCacheConnectorGeneric<'memcached'>` default rather than requiring both keys. */
class RedisOnlyNarrowedCacheProvider
  extends ZanixCacheProvider<object, { redis: ConcreteRedisConnector }> {}

registerCoreConnectorSlot('cache:redis', ConcreteRedisConnector)
registerCoreConnectorSlot('cache:memcached', ConcreteMemcachedConnector)
Program.targets.defineTarget('cache:redis', {
  Target: ConcreteRedisConnector,
  type: 'connector',
  lifetime: 'SINGLETON',
})
Program.targets.defineTarget('cache:memcached', {
  Target: ConcreteMemcachedConnector,
  type: 'connector',
  lifetime: 'SINGLETON',
})

Deno.test(
  'ZanixCacheProvider: a subclass declaring both keys on its own single object-shaped ' +
    'Connectors generic gets `this.redis`/`this.memcached` typed (and resolving) as those ' +
    'concrete connectors, not the loose ZanixCacheConnectorGeneric default',
  () => {
    const provider = new NarrowedCacheProvider('id')

    // Compile-time proof: `redis`/`memcached` are statically typed as the concrete subclasses
    // declared above — `.marker` doesn't exist on the loose `ZanixCacheConnectorGeneric` default,
    // so this would fail `deno check` if the generic narrowing stopped working.
    const redisMarker: 'redis' = provider.redis.marker
    const memcachedMarker: 'memcached' = provider.memcached.marker

    assertEquals(redisMarker, 'redis')
    assertEquals(memcachedMarker, 'memcached')
    assert(provider.redis instanceof ConcreteRedisConnector)
    assert(provider.memcached instanceof ConcreteMemcachedConnector)
  },
)

Deno.test(
  'ZanixCacheProvider: a subclass narrowing only `redis` on its Connectors generic still ' +
    'resolves `this.memcached` at runtime (same registered connector) — narrowing one key never ' +
    'requires declaring the other',
  () => {
    const provider = new RedisOnlyNarrowedCacheProvider('id')

    // Compile-time proof for the narrowed key: same as above.
    const redisMarker: 'redis' = provider.redis.marker
    assertEquals(redisMarker, 'redis')
    assert(provider.redis instanceof ConcreteRedisConnector)

    // `memcached` was never declared on `Connectors` here — its STATIC type stays the loose
    // `ZanixCacheConnectorGeneric<'memcached'>` default (accessing `.marker` on it, like the test
    // above does for the narrowed case, would fail `deno check` — that absence is the point).
    // Runtime resolution is unaffected by the missing type narrowing: it's still the same
    // registered `'cache:memcached'` singleton.
    assert(provider.memcached instanceof ConcreteMemcachedConnector)
  },
)
