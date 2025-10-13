// deno-lint-ignore-file no-explicit-any
import { assert } from '@std/assert'
import { assertSpyCalls, stub } from '@std/testing/mock'
import { Program as ProgramClass } from 'modules/program/main.ts'

Deno.test('Program class initializes all containers', () => {
  const program = new ProgramClass()

  assert(program.middlewares)
  assert(program.targets)
  assert(program.routes)
  assert(program.decorators)
  assert(program.context)
})

Deno.test('cleanupMetadata calls resetContainer on all containers', () => {
  const program = new ProgramClass()

  // Stub the resetContainer methods
  const resetRoutesStub = stub(program.routes, 'resetContainer')
  const resetMiddlewaresStub = stub(program.middlewares, 'resetContainer')
  const resetDecoratorsStub = stub(program.decorators, 'resetContainer')
  const resetTargetsStub = stub(program.targets, 'resetContainer')

  // Call cleanupMetadata
  program.cleanupMetadata()

  // Assert all resetContainer methods were called once
  assertSpyCalls(resetRoutesStub, 1)
  assertSpyCalls(resetMiddlewaresStub, 1)
  assertSpyCalls(resetDecoratorsStub, 1)
  assertSpyCalls(resetTargetsStub, 1)

  // Assert resetTargets called with argument ['properties']
  const calledWith = resetTargetsStub.calls[0].args[0] as any
  assert(calledWith.length === 1 && calledWith[0] === 'properties')

  // Restore stubs (optional but good practice)
  resetRoutesStub.restore()
  resetMiddlewaresStub.restore()
  resetDecoratorsStub.restore()
  resetTargetsStub.restore()
})
