// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { assertSpyCalls, stub } from '@std/testing/mock'
import { InternalProgram as ProgramClass } from 'modules/program/mod.ts'
import { HANDLER_METADATA_PROPERTY_KEY } from 'utils/constants.ts'

Deno.test('Program class initializes all containers', () => {
  const program = new ProgramClass()

  assert(program.middlewares)
  assert(program.targets)
  assert(program.routes)
  assert(program.decorators)
  assert(program.context)
})

Deno.test('cleanupInitializationsMetadata calls resetContainer on all containers', () => {
  const program = new ProgramClass()

  // Stub the resetContainer methods
  const resetRoutesStub = stub(program.routes, 'resetContainer')
  const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
  const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
  const resetTargetsStub = stub(program.targets, 'resetContainer')

  // Call cleanupInitializationsMetadata
  program.cleanupInitializationsMetadata('onBoot')

  // Assert all resetContainer methods were called once
  assertSpyCalls(resetRoutesStub, 1)
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
