import { assertEquals } from '@std/assert/assert-equals'
import * as defs from 'modules/infra/middlewares/defs/base.ts'
import { registerGlobalInterceptor } from 'modules/infra/middlewares/defs/interceptors.ts'
import { registerGlobalPipe } from 'modules/infra/middlewares/defs/pipes.ts'
import { registerGlobalGuard } from 'modules/infra/middlewares/defs/guards.ts'

Deno.test('defs/base.ts re-exports the global middleware registration helpers', () => {
  assertEquals(defs.registerGlobalInterceptor, registerGlobalInterceptor)
  assertEquals(defs.registerGlobalPipe, registerGlobalPipe)
  assertEquals(defs.registerGlobalGuard, registerGlobalGuard)
})
