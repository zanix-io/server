import type { ConnectorOptions } from 'typings/targets.ts'

import { assert, assertEquals } from '@std/assert'
import { ZanixProvider } from 'providers/base.ts'
import { ZanixCacheProvider } from 'providers/core/cache.ts'
import { ZanixCacheConnector } from 'connectors/core/cache.ts'
import Program from 'modules/program/mod.ts'
import { registerCoreConnectorSlot } from 'connectors/core/all.ts'
import { registerCoreProviderSlot } from 'providers/core/all.ts'

/**
 * Verifies a real hypothesis, not assumed from reading the code: can a consumer narrow
 * `ZanixCacheProvider`'s own `Connectors` generic (its `redis`/`memcached` connector types) from
 * OUTSIDE any `ZanixCacheProvider` subclass — as a pure type annotation on the `cache` key of the
 * `CoreModules` generic a `ZanixProvider`/`ZanixInteractor` subclass already declares — with no new
 * mechanism, no real `ZanixCacheProvider` subclass of their own, and no per-call generic?
 *
 * `CoreBaseClass<T>`'s `cache` getter (`modules/infra/base/core.ts`) already resolves as
 * `T['cache'] extends ZanixCacheProvider ? T['cache'] : ZanixCacheProvider` — the same
 * `T[K] extends X ? T[K] : X` shape it uses for `database`/`asyncmq`/`worker`/`search`/`kvLocal`.
 * `ZanixCacheProvider<Base, Connectors>` (with `Connectors` narrowed) is structurally assignable to
 * the bare `ZanixCacheProvider` (via `Connectors`' own default) precisely because `Connectors` is
 * used only in COVARIANT position (`redis`/`memcached` getter RETURN types) — a narrower return
 * type is a valid subtype. `Program.targets`' runtime resolution is completely untouched by any of
 * this: the REAL registered provider instance is a plain `ZanixCacheProvider` (or any of its real
 * subclasses) either way — `Connectors` is a phantom, type-only parameter, never read at runtime.
 *
 * Tested via `ZanixProvider` rather than `ZanixInteractor` — both extend the identical
 * `CoreBaseClass<T>` (`this.cache`'s own mechanism lives there, not duplicated per subclass), and
 * `ZanixProvider` has no extra constructor requirement (`ZanixInteractor`'s own constructor reads
 * `this[ZANIX_PROPS].key`, which needs real decorator/target metadata this unit test has no reason
 * to set up) — so this is an equally valid, simpler proof for both.
 */

function withDefaultTtl(options: ConnectorOptions = {}): ConnectorOptions & { ttl: number } {
  return { ttl: 60, ...options }
}

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

// Deliberately a BARE, unparameterized `ZanixCacheProvider` subclass — the real, registered
// RUNTIME provider class. It never itself declares `Connectors` — the narrowing under test is
// applied purely from the CONSUMING `ZanixProvider` subclass below, on the `CoreModules` generic.
class TestCacheProvider extends ZanixCacheProvider {}

registerCoreProviderSlot('cache', ZanixCacheProvider)
registerCoreConnectorSlot('cache:redis', ConcreteRedisConnector)
Program.targets.defineTarget('cache', {
  Target: TestCacheProvider,
  type: 'provider',
  lifetime: 'SINGLETON',
})
Program.targets.defineTarget('cache:redis', {
  Target: ConcreteRedisConnector,
  type: 'connector',
  lifetime: 'SINGLETON',
})

/**
 * The actual hypothesis under test: `cache` narrowed to `ZanixCacheProvider<object, { redis:
 * ConcreteRedisConnector }>` on `ZanixProvider`'s own `CoreModules` generic — no
 * `ZanixCacheProvider` subclass of `MyProvider`'s own, no per-call generic anywhere.
 *
 * `ZanixCacheProvider`'s FIRST generic here is `object` (its own default), never `MyProvider`'s own
 * `CoreModules` — that first generic describes the cache provider CLASS's own dependencies
 * (normally none), not the consuming class's context; passing the consumer's own `T` there would
 * be a real, self-referential circular type (the interactor/provider's type defining itself inside
 * its own `cache` field) — confirmed real by trying it in an isolated `deno check` before writing
 * this the correct way.
 *
 * Two negative cases confirmed via the same isolated `deno check` (not shipped inline here, to
 * match this repo's existing convention — see `providers/core/cache.ts`'s own test file for the
 * identical prose-plus-out-of-band-verification pattern, not an inline `@ts-expect-error`, which
 * has no precedent elsewhere in this suite):
 * - `cache: ZanixCacheProvider` (bare, no `Connectors` narrowed at all) makes `this.cache.redis`
 *   fall back to the loose `ZanixCacheConnectorGeneric<'redis'>` — `.marker` fails to compile.
 * - `cache: ZanixCacheProvider<object, { redis: ConcreteRedisConnector }>` (redis narrowed,
 *   memcached omitted) still leaves `this.cache.memcached` at the loose default — `.marker` on it
 *   fails to compile too, exactly like narrowing one `ZanixCacheProvider` shortcut never requires
 *   declaring the other (already covered for a real `ZanixCacheProvider` subclass in
 *   `cache-connector-generics.test.ts`; confirmed here to compose identically one level up, through
 *   `CoreModules`).
 */
class MyProvider extends ZanixProvider<
  { cache: ZanixCacheProvider<object, { redis: ConcreteRedisConnector }> }
> {
  public getRedisMarker() {
    // Compile-time proof: `.marker` only exists on `ConcreteRedisConnector`, not the loose
    // `ZanixCacheConnectorGeneric<'redis'>` default — this line only type-checks if `this.cache`
    // really does resolve as the fully narrowed `ZanixCacheProvider<..., { redis: ... }>` type,
    // with ITS OWN `redis` getter narrowed in turn. No cast, no generic passed at this call site.
    return this.cache.redis.marker
  }

  public getRedisConnector() {
    return this.cache.redis
  }
}

Deno.test(
  "CoreBaseClass.cache: a ZanixProvider subclass can narrow ZanixCacheProvider's own Connectors " +
    'generic (redis/memcached) purely via the CoreModules `cache` key — no ZanixCacheProvider ' +
    'subclass of its own required',
  () => {
    const provider = new MyProvider('id')

    const marker: 'redis' = provider.getRedisMarker()
    assertEquals(marker, 'redis')
    assert(provider.getRedisConnector() instanceof ConcreteRedisConnector)
  },
)
