// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported, alongside the unanchored fixture, before either `bootstrapServers()` call in shared-port.test.ts. */
await ProgramModule.applications.define('admin', () => {
  @Controller()
  class _SharedPortAnchoredController extends ZanixController {
    @Get('anchored-hello')
    public anchoredHello() {
      return 'anchored response'
    }
  }
})
