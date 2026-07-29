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

Deno.test('cleanupInitializationsMetadata(onBoot) resets everything except routes', () => {
  const program = new ProgramClass()

  // Stub the resetContainer methods
  const resetRoutesStub = stub(program.routes, 'resetContainer')
  const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
  const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
  const resetTargetsStub = stub(program.targets, 'resetContainer')

  // Call cleanupInitializationsMetadata
  program.cleanupInitializationsMetadata('onBoot')

  // Routes are deliberately never reset here — a consumer calling `bootstrapServers` more than
  // once in the same boot (internal server first, then public) needs every not-yet-claimed route
  // to still be there for the later call, regardless of `isInternal` scope. See the regression
  // test below for the concrete scenario this protects.
  assertSpyCalls(resetRoutesStub, 0)
  assertSpyCalls(resetMiddlewaresStub, 1)
  assertSpyCalls(resetDecoratorsStub, 1)
  assertSpyCalls(resetTargetsStub, 1)

  // Assert resetTargets called with argument ['properties']
  const calledWith = resetTargetsStub.calls[0].args[0] as any

  assertEquals(calledWith, [HANDLER_METADATA_PROPERTY_KEY, 'startMode:onSetup', 'startMode:onBoot'])

  // Restore stubs
  resetRoutesStub.restore()
  resetMiddlewaresStub.restore()
  resetDecoratorsStub.restore()
  resetTargetsStub.restore()
})

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
    program.routes.setEndpoint({ Target: AfterCleanupTarget, propertyKey: 'handle' })
    program.targets.addProperty({ Target: AfterCleanupTarget, propertyKey: 'handle' })

    program.routes.defineRoute('rest', AfterCleanupTarget)

    const routes = program.routes.getRoutes('rest')
    assert(routes?.['/handle/GET'])
  },
)

Deno.test(
  'cleanupInitializationsMetadata("onBoot") preserves routes registered before it ran',
  () => {
    const program = new ProgramClass()

    // Regression: a route registered BEFORE an earlier `bootstrapServers` call (e.g. `@zanix/core`
    // registering both isInternal:true and isInternal:false admin routes up front, then calling
    // `bootstrapServers` for the internal server first) used to vanish once that first call
    // triggered this cleanup — even though it belonged to a DIFFERENT scope and was never served by
    // that call. `onBoot` cleanup must never wipe routes another, later `bootstrapServers` call
    // still needs to find.
    class BeforeCleanupTarget extends TargetBaseClass {
      public handle() {}
    }
    program.routes.setEndpoint({ Target: BeforeCleanupTarget, propertyKey: 'handle' })
    program.targets.addProperty({ Target: BeforeCleanupTarget, propertyKey: 'handle' })
    program.routes.defineRoute('rest', BeforeCleanupTarget)

    program.cleanupInitializationsMetadata('onBoot')

    const routes = program.routes.getRoutes('rest')
    assert(routes?.['/handle/GET'], 'route registered before cleanup must still be gettable after')
  },
)

Deno.test('cleanupInitializationsMetadata calls resetContainer on post boot', () => {
  const program = new ProgramClass()

  // Stub the resetContainer methods
  const resetRoutesStub = stub(program.routes, 'resetContainer')
  const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
  const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
  const resetTargetsStub = stub(program.targets, 'resetContainer')

  // Call cleanupInitializationsMetadata
  program.cleanupInitializationsMetadata('postBoot')

  // Assert all resetContainer methods were called once
  assertSpyCalls(resetRoutesStub, 0)
  assertSpyCalls(resetMiddlewaresStub, 0)
  assertSpyCalls(resetDecoratorsStub, 0)
  assertSpyCalls(resetTargetsStub, 1)

  // Assert resetTargets called with argument ['properties']
  const calledWithPostBoot = resetTargetsStub.calls[0].args[0] as any

  assertEquals(calledWithPostBoot, [
    'type:connector',
    'type:resolver',
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

  // Restore stubs
  resetRoutesStub.restore()
  resetMiddlewaresStub.restore()
  resetDecoratorsStub.restore()
  resetTargetsStub.restore()
})
