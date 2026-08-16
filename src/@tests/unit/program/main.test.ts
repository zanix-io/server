// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { assertSpyCalls, stub } from '@std/testing/mock'
import { InternalProgram as ProgramClass } from 'modules/program/mod.ts'
import { HANDLER_METADATA_PROPERTY_KEY } from 'utils/constants.ts'
import { TargetBaseClass } from 'modules/infra/base/target.ts'

Deno.test('Program class initializes all containers', () => {
  const program = new ProgramClass()

  assert(program.middlewares)
  assert(program.targets)
  assert(program.routes)
  assert(program.decorators)
  assert(program.context)
})

Deno.test(
  'cleanupInitializationsMetadata(onBoot) with finalize:true (default) resets everything except routes',
  () => {
    const program = new ProgramClass()

    // Stub the resetContainer methods
    const resetRoutesStub = stub(program.routes, 'resetContainer')
    const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
    const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
    const resetTargetsStub = stub(program.targets, 'resetContainer')

    // Call cleanupInitializationsMetadata with the default finalize:true
    program.cleanupInitializationsMetadata('onBoot')

    // Routes are deliberately never reset here — a consumer calling `bootstrapServers` more than
    // once in the same boot (the `admin` Application's server first, then `main`'s) needs every
    // not-yet-claimed route to still be there for the later call, regardless of which Application it
    // belongs to. See the regression test below for the concrete scenario this protects.
    assertSpyCalls(resetRoutesStub, 0)
    assertSpyCalls(resetMiddlewaresStub, 1)
    assertSpyCalls(resetDecoratorsStub, 1)
    assertSpyCalls(resetTargetsStub, 1)

    // Assert resetTargets called with argument ['properties']
    const calledWith = resetTargetsStub.calls[0].args[0] as any

    assertEquals(
      calledWith,
      [HANDLER_METADATA_PROPERTY_KEY, 'startMode:onSetup', 'startMode:onBoot'],
    )

    // Restore stubs
    resetRoutesStub.restore()
    resetMiddlewaresStub.restore()
    resetDecoratorsStub.restore()
    resetTargetsStub.restore()
  },
)

Deno.test(
  'cleanupInitializationsMetadata(onBoot, finalize:false) preserves middlewares/decorators',
  () => {
    const program = new ProgramClass()

    const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
    const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
    const resetTargetsStub = stub(program.targets, 'resetContainer')

    // A non-final call in a multi-call boot sequence (e.g. `@zanix/core`'s internal admin server,
    // followed by its public one) must not purge global middlewares/decorators a later call's own
    // composition might still register into before its own `webServerManager.create()` reads them.
    program.cleanupInitializationsMetadata('onBoot', false)

    assertSpyCalls(resetMiddlewaresStub, 0)
    assertSpyCalls(resetDecoratorsStub, 0)
    // The per-request handler/target bookkeeping still runs regardless of `finalize` — it's inert
    // per-call cleanup, not part of the multi-call-sequence survival concern this flag protects.
    assertSpyCalls(resetTargetsStub, 1)

    resetMiddlewaresStub.restore()
    resetDecoratorsStub.restore()
    resetTargetsStub.restore()
  },
)

Deno.test(
  'cleanupInitializationsMetadata("onBoot") does not break routes.defineRoute for later Target-based registrations',
  () => {
    const program = new ProgramClass()

    program.cleanupInitializationsMetadata('onBoot')

    // Regression: this used to throw ("Cannot read properties of undefined (reading
    // 'getProperties')") because cleanupInitializationsMetadata('onBoot') deleted the
    // constructor-injected `middlewares`/`targets` fields directly off the `routes` container
    // instance, instead of only resetting their keyed metadata. Only the Target-based overload of
    // `defineRoute` (used by `@Controller`/`@Socket`) exercises `this.targets`, so a plain
    // path+handler call (which doesn't) wouldn't have caught this.
    class AfterCleanupTarget extends TargetBaseClass {
      public handle() {}
    }
    program.routes.setEndpoint({
      Target: AfterCleanupTarget,
      propertyKey: 'handle',
    })
    program.targets.addProperty({
      Target: AfterCleanupTarget,
      propertyKey: 'handle',
    })

    program.routes.defineRoute('rest', AfterCleanupTarget)

    const routes = program.routes.getRoutes('rest')
    // Storage key is `${application}:${path}/${httpMethod}` — `application` defaults to
    // `DEFAULT_APPLICATION` ('main') here, no `applicationOverride`/active `define()` scope.
    assert(routes?.['main:/handle/GET'])
  },
)

Deno.test(
  'cleanupInitializationsMetadata("onBoot") preserves routes registered before it ran',
  () => {
    const program = new ProgramClass()

    // Regression: a route registered BEFORE an earlier `bootstrapServers` call (e.g. `@zanix/core`
    // registering both `'admin'`-Application and default-Application admin routes up front, then
    // calling `bootstrapServers` for the admin server first) used to vanish once that first call
    // triggered this cleanup — even though it belonged to a DIFFERENT scope and was never served by
    // that call. `onBoot` cleanup must never wipe routes another, later `bootstrapServers` call
    // still needs to find.
    class BeforeCleanupTarget extends TargetBaseClass {
      public handle() {}
    }
    program.routes.setEndpoint({
      Target: BeforeCleanupTarget,
      propertyKey: 'handle',
    })
    program.targets.addProperty({
      Target: BeforeCleanupTarget,
      propertyKey: 'handle',
    })
    program.routes.defineRoute('rest', BeforeCleanupTarget)

    program.cleanupInitializationsMetadata('onBoot')

    const routes = program.routes.getRoutes('rest')
    // Storage key is `${application}:${path}/${httpMethod}` — see the sibling test above for the
    // same note.
    assert(
      routes?.['main:/handle/GET'],
      'route registered before cleanup must still be gettable after',
    )
  },
)

Deno.test({
  name:
    'cleanupInitializationsMetadata(postBoot) with finalize:true (default) also clears type:resolver and routes',
  fn: () => {
    const program = new ProgramClass()

    // Stub the resetContainer methods
    const resetRoutesStub = stub(program.routes, 'resetContainer')
    const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
    const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
    const resetTargetsStub = stub(program.targets, 'resetContainer')

    // Call cleanupInitializationsMetadata with the default finalize:true
    program.cleanupInitializationsMetadata('postBoot')

    assertSpyCalls(resetMiddlewaresStub, 0)
    assertSpyCalls(resetDecoratorsStub, 0)

    // `type:connector` is intentionally never reset here — see `closeAllConnections`, which clears
    // it at actual process shutdown instead, since that's its only reader after boot.
    const calledWithPostBoot = resetTargetsStub.calls[0].args[0] as any
    assertEquals(calledWithPostBoot, [
      'provider:startMode:postBoot',
      'connector:startMode:postBoot',
      'interactor:startMode:postBoot',
      'provider:startMode:onBoot',
      'connector:startMode:onBoot',
      'interactor:startMode:onBoot',
      'provider:startMode:onSetup',
      'connector:startMode:onSetup',
      'interactor:startMode:onSetup',
    ])

    // `type:resolver` and the route registry are only safe to purge once the whole multi-call boot
    // sequence is finished — with finalize:true (the default, meaning "this is the last call"),
    // both get cleared too.
    assertSpyCalls(resetTargetsStub, 2)
    assertEquals(resetTargetsStub.calls[1].args[0], ['type:resolver'])
    assertSpyCalls(resetRoutesStub, 1)

    // Restore stubs
    resetRoutesStub.restore()
    resetMiddlewaresStub.restore()
    resetDecoratorsStub.restore()
    resetTargetsStub.restore()
  },
})

Deno.test({
  name:
    "cleanupInitializationsMetadata(postBoot, finalize:true) called while a DIFFERENT session is still active preserves that session's Applications instead of wiping everything",
  fn: async () => {
    const program = new ProgramClass()

    const resetExceptRoutesStub = stub(
      program.routes,
      'resetExceptApplications',
    )
    const resetExceptDiscoveryStub = stub(
      program.discovery,
      'resetExceptApplications',
    )
    const resetResolversExceptStub = stub(
      program.targets,
      'resetResolversExceptApplications',
    )
    const resetRoutesStub = stub(program.routes, 'resetContainer')
    const resetDiscoveryStub = stub(program.discovery, 'resetContainer')

    let releaseOtherSession: () => void = () => {}
    const otherSessionGate = new Promise<void>((resolve) => {
      releaseOtherSession = resolve
    })

    // Simulates a different, concurrently-running boot session (e.g. `ZanixAdminHub.start()`)
    // that has registered `'admin-hub'` but hasn't finished yet.
    const otherSession = program.sessions.runSession(async () => {
      program.sessions.recordApplication('admin-hub')
      await otherSessionGate
    })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the other session actually start

    // Cleanup runs OUTSIDE that other session (mirrors any caller — a raw call, or a third
    // session) while it's still in flight.
    program.cleanupInitializationsMetadata('postBoot')

    // The exclude-scoped methods run, preserving the still-active OTHER session's Applications —
    // never the unconditional full-registry wipe.
    assertSpyCalls(resetExceptRoutesStub, 1)
    assertEquals([...(resetExceptRoutesStub.calls[0].args[0] as Set<string>)], [
      'admin-hub',
    ])
    assertSpyCalls(resetExceptDiscoveryStub, 1)
    assertSpyCalls(resetResolversExceptStub, 1)
    assertSpyCalls(resetRoutesStub, 0)
    assertSpyCalls(resetDiscoveryStub, 0)

    releaseOtherSession()
    await otherSession

    resetExceptRoutesStub.restore()
    resetExceptDiscoveryStub.restore()
    resetResolversExceptStub.restore()
    resetRoutesStub.restore()
    resetDiscoveryStub.restore()
  },
})

Deno.test({
  name:
    'cleanupInitializationsMetadata(postBoot, finalize:true) INSIDE one session, with no other session active, still does the full unscoped wipe (including Applications this same session itself touched)',
  fn: async () => {
    const program = new ProgramClass()

    const resetExceptRoutesStub = stub(
      program.routes,
      'resetExceptApplications',
    )
    const resetRoutesStub = stub(program.routes, 'resetContainer')
    const resetDiscoveryStub = stub(program.discovery, 'resetContainer')

    await program.sessions.runSession(() => {
      program.sessions.recordApplication('admin')
      program.cleanupInitializationsMetadata('postBoot')
    })

    // No OTHER session was ever concurrently active, so `getForeignActiveApplications()` is
    // empty and cleanup falls back to the original full wipe — exactly matching the existing
    // single-sequence multi-call pattern (e.g. `'admin'` then `'main'`, both in one session).
    assertSpyCalls(resetExceptRoutesStub, 0)
    assertSpyCalls(resetRoutesStub, 1)
    assertSpyCalls(resetDiscoveryStub, 1)

    resetExceptRoutesStub.restore()
    resetRoutesStub.restore()
    resetDiscoveryStub.restore()
  },
})

Deno.test({
  name:
    'cleanupInitializationsMetadata(postBoot, finalize:false) preserves type:resolver and routes',
  fn: () => {
    const program = new ProgramClass()

    const resetRoutesStub = stub(program.routes, 'resetContainer')
    const resetTargetsStub = stub(program.targets, 'resetContainer')

    // A non-final call in a multi-call boot sequence (e.g. `@zanix/core`'s internal admin server,
    // followed by its public one) must not purge metadata the later call still needs to read.
    program.cleanupInitializationsMetadata('postBoot', false)

    assertSpyCalls(resetRoutesStub, 0)
    // Only the startMode lists are cleared — `type:resolver` is left untouched.
    assertSpyCalls(resetTargetsStub, 1)
    assertEquals(resetTargetsStub.calls[0].args[0], [
      'provider:startMode:postBoot',
      'connector:startMode:postBoot',
      'interactor:startMode:postBoot',
      'provider:startMode:onBoot',
      'connector:startMode:onBoot',
      'interactor:startMode:onBoot',
      'provider:startMode:onSetup',
      'connector:startMode:onSetup',
      'interactor:startMode:onSetup',
    ])

    resetRoutesStub.restore()
    resetTargetsStub.restore()
  },
})
