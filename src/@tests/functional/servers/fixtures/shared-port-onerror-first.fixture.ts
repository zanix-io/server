// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Registered first, with no `onError` of its own — see `onerror-shared-port.test.ts`. */
await ProgramModule.applications.define('onerror-first', () => {
  @Controller()
  class _SharedPortOnErrorFirstController extends ZanixController {
    @Get('ok')
    public ok() {
      return 'first-app response'
    }
  }
})
