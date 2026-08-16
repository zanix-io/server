// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** First of two Applications sharing one port in health-cross-application-shared-port.test.ts. */
await ProgramModule.applications.define('health-shared-a', () => {
  @Controller()
  class _HealthSharedAController extends ZanixController {
    @Get('a-hello')
    public hello() {
      return 'a response'
    }
  }
})
