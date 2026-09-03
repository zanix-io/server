import { assert, assertEquals, assertStrictEquals, assertThrows } from '@std/assert'
import PublicProgramModule from 'modules/program/public.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from 'providers/base.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { TargetBaseClass } from 'modules/infra/base/target.ts'
import { getTargetKey } from 'utils/targets.ts'
import { registerCoreProviderSlot } from 'modules/infra/providers/core/all.ts'
import { registerCoreConnectorSlot } from 'modules/infra/connectors/core/all.ts'
import { defineProviderDecorator } from 'modules/infra/providers/decorators/assembly.ts'
import { defineConnectorDecorator } from 'modules/infra/connectors/decorators/assembly.ts'
import { HttpError, InternalError } from '@zanix/errors'

console.error = () => {}

Deno.test('PublicProgramModule.registry: exposes the ProgramModule registry container', () => {
  assertEquals(PublicProgramModule.registry, ProgramModule.registry)
})

Deno.test({
  name:
    "PublicProgramModule.runBootSession: delegates to ProgramModule.sessions.runSession, returning setup's own result",
  fn: async () => {
    let releaseRunBootSession: () => void = () => {}
    const gate = new Promise<void>((
      resolve,
    ) => (releaseRunBootSession = resolve))

    const runBootSessionPromise = PublicProgramModule.runBootSession(
      async () => {
        ProgramModule.sessions.recordApplication(
          'public-run-boot-session-test',
        )
        await gate
        return 'setup-result'
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 0)) // let runBootSession actually start

    // Checked from a genuinely separate, concurrently-running session context — proves the ambient
    // session `runBootSession` established really is the one `recordApplication` above wrote into
    // (an unrelated session sees it as foreign/active while `runBootSession`'s own callback is still
    // in flight), not just that `recordApplication` happened to run without an active session at all.
    let sawApplications: Set<string> | undefined
    await ProgramModule.sessions.runSession(() => {
      sawApplications = ProgramModule.sessions.getForeignActiveApplications()
    })
    assert(sawApplications?.has('public-run-boot-session-test'))

    releaseRunBootSession()
    assertEquals(await runBootSessionPromise, 'setup-result')
  },
})

Deno.test({
  name:
    'PublicProgramModule.routes.getRoutes: delegates to ProgramModule.routes.getRoutes, exposing no other RouteContainer method',
  fn: () => {
    ProgramModule.routes.resetContainer()

    class PublicGetRoutesTarget extends TargetBaseClass {
      public handleGet() {}
    }

    ProgramModule.routes.setEndpoint({
      Target: PublicGetRoutesTarget,
      propertyKey: 'handleGet',
      endpoint: 'public-get-routes-test',
    })
    ProgramModule.targets.addProperty({
      Target: PublicGetRoutesTarget,
      propertyKey: 'handleGet',
    })
    ProgramModule.routes.defineRoute('rest', PublicGetRoutesTarget)

    assertEquals(
      PublicProgramModule.routes.getRoutes('rest'),
      ProgramModule.routes.getRoutes('rest'),
    )
    // The whole point of this accessor: read-only introspection, never the mutating
    // `RouteContainer` methods (`defineRoute`/`removeRoutesForTarget`/etc.) `unregisterRoutes`
    // already covers those individually via its own narrow, purpose-built wrapper.
    assertEquals(Object.keys(PublicProgramModule.routes), ['getRoutes', 'hasRoutesForTarget'])
  },
})

Deno.test('PublicProgramModule.unregisterRoutes: delegates to routes.removeRoutesForTarget', () => {
  ProgramModule.routes.resetContainer()

  class PublicUnregisterTarget extends TargetBaseClass {
    public handleGet() {}
  }

  ProgramModule.routes.setEndpoint({
    Target: PublicUnregisterTarget,
    propertyKey: 'handleGet',
    endpoint: 'public-unregister-routes-test',
  })
  ProgramModule.targets.addProperty({
    Target: PublicUnregisterTarget,
    propertyKey: 'handleGet',
  })
  ProgramModule.routes.defineRoute('rest', PublicUnregisterTarget)

  assertEquals(PublicProgramModule.unregisterRoutes(PublicUnregisterTarget), 1)
  // Already removed — delegated call is a safe no-op, same as the underlying container method.
  assertEquals(PublicProgramModule.unregisterRoutes(PublicUnregisterTarget), 0)
})

class PublicTestProvider extends ZanixProvider {
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
}

class PublicTestConnector extends ZanixConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}

Deno.test({
  name: 'PublicProgramModule.providers: shorthand resolves the same singleton as getProviders()',
  fn: () => {
    ProgramModule.targets.defineTarget(getTargetKey(PublicTestProvider), {
      Target: PublicTestProvider,
      type: 'provider',
      lifetime: 'SINGLETON',
    })

    const viaShorthand = PublicProgramModule.providers.get(PublicTestProvider)
    const viaMethod = PublicProgramModule.getProviders().get(
      PublicTestProvider,
    )

    assert(viaShorthand instanceof PublicTestProvider)
    assertStrictEquals(viaShorthand, viaMethod)
  },
})

Deno.test({
  name: 'PublicProgramModule.connectors: shorthand resolves the same singleton as getConnectors()',
  fn: () => {
    ProgramModule.targets.defineTarget(getTargetKey(PublicTestConnector), {
      Target: PublicTestConnector,
      type: 'connector',
      lifetime: 'SINGLETON',
    })

    const viaShorthand = PublicProgramModule.connectors.get(
      PublicTestConnector,
    )
    const viaMethod = PublicProgramModule.getConnectors().get(
      PublicTestConnector,
    )

    assert(viaShorthand instanceof PublicTestConnector)
    assertStrictEquals(viaShorthand, viaMethod)
  },
})

abstract class PublicTestCoreProviderBase extends ZanixProvider {}
class PublicTestCoreProviderImpl extends PublicTestCoreProviderBase {
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
}

abstract class PublicTestCoreConnectorBase extends ZanixConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}
class PublicTestCoreConnectorImpl extends PublicTestCoreConnectorBase {}

Deno.test({
  name:
    "PublicProgramModule.providers: a decorated core-slot class resolves the same singleton as get('name')",
  fn: () => {
    registerCoreProviderSlot('public-test-core', PublicTestCoreProviderBase)
    defineProviderDecorator({ slot: 'public-test-core' })(
      PublicTestCoreProviderImpl as never,
    )

    const viaName = PublicProgramModule.providers.get('public-test-core')
    const viaClass = PublicProgramModule.providers.get(
      PublicTestCoreProviderImpl,
    )

    assert(viaName instanceof PublicTestCoreProviderImpl)
    assertStrictEquals(viaName, viaClass)
  },
})

/** A fresh `AuthRepository`-shaped Provider class, named identically on every call — the exact
 * shape a project-local Provider takes when re-evaluated a SECOND time (same source, same name,
 * a genuinely DIFFERENT class object) through `@zanix/space`'s SSR pipeline, never the same
 * reference the native `zanix space dev` process already loaded directly. Named via a computed
 * property so the class's own `.name` is real, not `'anonymous'` — `getTargetKey`/
 * `registerCustomProviderSlotAlias` both key off `.name` for exactly this reason. */
function makeCustomSlotProviderClass(name: string) {
  abstract class Base extends ZanixProvider {}
  return {
    [name]: class extends Base {
      public override use(_: unknown): ZanixConnector {
        throw new Error('Method not implemented.')
      }
    },
  }[name]
}

Deno.test({
  name:
    'PublicProgramModule.providers: a custom (non-core) slot lets TWO DIFFERENT class objects ' +
    "sharing the same name — the real module-identity-split shape, see defineProviderDecorator's " +
    'own doc — resolve the SAME cached singleton, from either class reference or the string key, ' +
    'never two independent instances',
  fn: () => {
    const NativeAuthRepository = makeCustomSlotProviderClass('AuthRepository')
    const SsrAuthRepository = makeCustomSlotProviderClass('AuthRepository')
    // Genuinely different class objects, never the same reference — proving this isn't trivially
    // working just because it's literally one class evaluated once.
    assert(NativeAuthRepository !== SsrAuthRepository)
    assertEquals(NativeAuthRepository.name, SsrAuthRepository.name)

    defineProviderDecorator({ slot: 'public-test-auth-repository' })(
      NativeAuthRepository as never,
    )
    const viaNative = PublicProgramModule.providers.get(NativeAuthRepository)

    // The regression check: decorating the SECOND (SSR-side) evaluation must not throw, and a
    // lookup through THAT class reference must resolve the exact same instance the first
    // evaluation already created and cached — never a second, independent one (the real
    // `[BaseInstancesContainer]: Target is not a constructor` failure this closes).
    defineProviderDecorator({ slot: 'public-test-auth-repository' })(SsrAuthRepository as never)
    const viaSsr = PublicProgramModule.providers.get(SsrAuthRepository)
    const viaName = PublicProgramModule.providers.get('public-test-auth-repository')

    assert(viaNative instanceof NativeAuthRepository)
    assertStrictEquals(viaNative, viaSsr)
    assertStrictEquals(viaNative, viaName)
  },
})

Deno.test({
  name: 'PublicProgramModule.providers: a custom slot rejects two GENUINELY DIFFERENT classes ' +
    '(different names) sharing the same slot string — only two evaluations of the SAME class ' +
    "are meant to share one, see registerCustomProviderSlotAlias's own doc",
  fn: () => {
    const ProviderA = makeCustomSlotProviderClass('PublicTestCollisionA')
    const ProviderB = makeCustomSlotProviderClass('PublicTestCollisionB')

    defineProviderDecorator({ slot: 'public-test-collision-slot' })(ProviderA as never)

    assertThrows(
      () => defineProviderDecorator({ slot: 'public-test-collision-slot' })(ProviderB as never),
      InternalError,
      'already registered by a different class',
    )
  },
})

Deno.test({
  name:
    'PublicProgramModule.providers: a custom slot string that was never registered throws the ' +
    "same clear 'missing' error a core slot does — never a raw, confusing " +
    "'not a constructor'/'unknown metadata' one",
  fn: () => {
    assertThrows(
      () => PublicProgramModule.providers.get('public-test-never-registered-custom-slot'),
      InternalError,
      'Missing core provider slot',
    )
  },
})

Deno.test({
  name:
    "PublicProgramModule.connectors: a decorated core-slot class resolves the same singleton as get('name')",
  fn: () => {
    registerCoreConnectorSlot('public-test-core', PublicTestCoreConnectorBase)
    defineConnectorDecorator({ slot: 'public-test-core' })(
      PublicTestCoreConnectorImpl as never,
    )

    const viaName = PublicProgramModule.connectors.get('public-test-core')
    const viaClass = PublicProgramModule.connectors.get(
      PublicTestCoreConnectorImpl,
    )

    assert(viaName instanceof PublicTestCoreConnectorImpl)
    assertStrictEquals(viaName, viaClass)
  },
})

abstract class UnresolvedTestProviderBase extends ZanixProvider {}
abstract class UnresolvedTestConnectorBase extends ZanixConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}

class ThrowingTestProviderImpl extends UnresolvedTestProviderBase {
  constructor(contextId?: string) {
    super(contextId)
    throw new Error('boom')
  }
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
}

class ThrowingTestConnectorImpl extends UnresolvedTestConnectorBase {
  constructor(contextId?: string) {
    super(contextId)
    throw new Error('boom')
  }
}

Deno.test({
  name:
    'PublicProgramModule.providers: a key that was never registered as a core slot throws "missing core slot" (no source package to name)',
  fn: () => {
    const error = assertThrows(
      () => PublicProgramModule.providers.get('never-registered-provider-core'),
      InternalError,
      'Missing core provider slot "never-registered-provider-core". No provider was registered ' +
        'for this slot. Check that the package owning this capability was imported.',
    )
    assertEquals(
      (error as InstanceType<typeof InternalError>).meta?.slot,
      'never-registered-provider-core',
    )
  },
})

Deno.test({
  name:
    'PublicProgramModule.providers: a registered slot with no defined target rewords the error into "missing core slot" (naming the source package)',
  fn: () => {
    registerCoreProviderSlot(
      'unresolved-test-provider-core',
      UnresolvedTestProviderBase,
      {
        sourcePackage: '@zanix/unresolved-test-provider',
      },
    )

    const error = assertThrows(
      () => PublicProgramModule.providers.get('unresolved-test-provider-core'),
      InternalError,
      'Core provider slot "unresolved-test-provider-core" is registered but no implementation ' +
        'was found for it in the current process. Did you forget to import ' +
        '"@zanix/unresolved-test-provider"?',
    )
    assertEquals(
      (error as InstanceType<typeof InternalError>).meta?.slot,
      'unresolved-test-provider-core',
    )
  },
})

Deno.test({
  name:
    'PublicProgramModule.providers: an already-resolved target whose constructor fails propagates the original error unchanged',
  fn: () => {
    registerCoreProviderSlot(
      'throwing-test-provider-core',
      UnresolvedTestProviderBase,
    )
    ProgramModule.targets.defineTarget('throwing-test-provider-core', {
      Target: ThrowingTestProviderImpl,
      type: 'provider',
      lifetime: 'SINGLETON',
    })

    assertThrows(
      () => PublicProgramModule.providers.get('throwing-test-provider-core'),
      HttpError,
      'This action cannot be completed at the moment.',
    )
  },
})

Deno.test({
  name:
    'PublicProgramModule.connectors: a registered slot with no defined target rewords the error into "missing core slot" (naming the source package)',
  fn: () => {
    registerCoreConnectorSlot(
      'unresolved-test-connector-core',
      UnresolvedTestConnectorBase,
      {
        sourcePackage: '@zanix/unresolved-test-connector',
      },
    )

    const error = assertThrows(
      () => PublicProgramModule.connectors.get('unresolved-test-connector-core'),
      InternalError,
      'Core connector slot "unresolved-test-connector-core" is registered but no implementation ' +
        'was found for it in the current process. Did you forget to import ' +
        '"@zanix/unresolved-test-connector"?',
    )
    assertEquals(
      (error as InstanceType<typeof InternalError>).meta?.slot,
      'unresolved-test-connector-core',
    )
  },
})

Deno.test({
  name:
    'PublicProgramModule.connectors: an already-resolved target whose constructor fails propagates the original error unchanged',
  fn: () => {
    registerCoreConnectorSlot(
      'throwing-test-connector-core',
      UnresolvedTestConnectorBase,
    )
    ProgramModule.targets.defineTarget('throwing-test-connector-core', {
      Target: ThrowingTestConnectorImpl,
      type: 'connector',
      lifetime: 'SINGLETON',
    })

    assertThrows(
      () => PublicProgramModule.connectors.get('throwing-test-connector-core'),
      HttpError,
      'This action cannot be completed at the moment.',
    )
  },
})
