// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** See `dispatch-collision-a.fixture.ts`'s own doc — this is its counterpart, a second, entirely
 * independent Application, also unanchored, also with no explicit `globalPrefix`/`port`.
 */
await ProgramModule.applications.define('dispatch-collision-b', () => {
  @Controller()
  class _DispatchCollisionBController extends ZanixController {
    @Get('hello-b')
    public helloB() {
      return 'response from Application B'
    }
  }
})
