// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * A THIRD Application sharing the same port as the anchored/unanchored fixtures — imported before
 * any `bootstrapServers()` call in `shared-port-three-way.test.ts`, mirroring three independently
 * anchored/unanchored servers sharing one listener (e.g. a business app's own server, its embedded
 * `admin` server, and a separately-started `ZanixAdminHub` server, all on one Heroku-style port).
 */
await ProgramModule.applications.define('admin-hub', () => {
  @Controller()
  class _SharedPortThirdController extends ZanixController {
    @Get('third-hello')
    public thirdHello() {
      return 'third response'
    }
  }
})
