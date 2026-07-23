import { assert, assertEquals } from '@std/assert'
import { ZanixCacheConnector } from 'modules/infra/connectors/core/cache.ts'

class TestCacheConnector extends ZanixCacheConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
  public getClient<T = Map<never, never>>(): T {
    return new Map() as T
  }
  public override set(): void {}
  public override get(): undefined {
    return undefined
  }
  public override has(): boolean {
    return false
  }
  public override delete(): boolean {
    return false
  }
  public override clear(): void {}
  public override size(): number {
    return 0
  }
  public override keys(): unknown[] {
    return []
  }
  public override values<O = unknown>(): O[] {
    return []
  }

  public callGetTTLWithOffset(
    ttlValue: number,
    maxOffsetSeconds?: number,
    minTTLForOffset?: number,
  ) {
    return this['getTTLWithOffset'](ttlValue, maxOffsetSeconds, minTTLForOffset)
  }
}

Deno.test({
  name: 'ZanixCacheConnector: returns the raw TTL when below the minimum threshold for offset',
  fn: () => {
    const conn = new TestCacheConnector({ ttl: 60, minTTLForOffset: 10, maxOffsetSeconds: 5 })

    assertEquals(conn.callGetTTLWithOffset(5), 5)
  },
})

Deno.test({
  name: 'ZanixCacheConnector: returns the raw TTL when maxOffset is 0, regardless of minTTL',
  fn: () => {
    const conn = new TestCacheConnector({ ttl: 60, minTTLForOffset: 10, maxOffsetSeconds: 0 })

    assertEquals(conn.callGetTTLWithOffset(2, 0), 2)
  },
})

Deno.test({
  name: 'ZanixCacheConnector: applies a bounded random offset when TTL is above the minimum',
  fn: () => {
    const conn = new TestCacheConnector({ ttl: 60, minTTLForOffset: 5, maxOffsetSeconds: 9 })

    // ttlValue=100 -> relativeOffset = floor(100*0.2) = 20, effectiveOffset = min(9, 20) = 9
    for (let i = 0; i < 20; i++) {
      const ttl = conn.callGetTTLWithOffset(100)
      assert(ttl >= 100 && ttl <= 109)
    }
  },
})

Deno.test({
  name: 'ZanixCacheConnector: honors explicit maxOffsetSeconds/minTTLForOffset overrides',
  fn: () => {
    const conn = new TestCacheConnector({ ttl: 60, minTTLForOffset: 5, maxOffsetSeconds: 9 })

    // ttlValue=50, override maxOffsetSeconds=2 -> relativeOffset = floor(50*0.2)=10, effectiveOffset=min(2,10)=2
    for (let i = 0; i < 20; i++) {
      const ttl = conn.callGetTTLWithOffset(50, 2, 1)
      assert(ttl >= 50 && ttl <= 52)
    }
  },
})
