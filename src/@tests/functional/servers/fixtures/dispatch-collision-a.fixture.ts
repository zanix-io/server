// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * One half of `cross-application-dispatch-collision.test.ts`'s two-Application fixture pair — see
 * `dispatch-collision-b.fixture.ts` for the other. Both Applications are unanchored (no explicit
 * `id`), and neither ever passes an explicit `globalPrefix`/`port` — the real-world default
 * `@zanix/app`'s `bootstrapAppServer` and a process's own default REST server both leave unset.
 */
await ProgramModule.applications.define('dispatch-collision-a', () => {
  @Controller()
  class _DispatchCollisionAController extends ZanixController {
    @Get('hello-a')
    public helloA() {
      return 'response from Application A'
    }
  }
})
