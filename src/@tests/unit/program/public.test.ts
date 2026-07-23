import { assertEquals } from '@std/assert/assert-equals'
import PublicProgramModule from 'modules/program/public.ts'
import ProgramModule from 'modules/program/mod.ts'

Deno.test('PublicProgramModule.registry: exposes the ProgramModule registry container', () => {
  assertEquals(PublicProgramModule.registry, ProgramModule.registry)
})
