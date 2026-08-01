// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in rotation.test.ts. */
await ProgramModule.applications.define('admin', () => {
  @Controller()
  class _RotationProbeController extends ZanixController {
    @Get('probe')
    public probe() {
      return 'probe response'
    }
  }
})
