// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before either `bootstrapServers()` call in internal-global-prefix.test.ts. */
await ProgramModule.applications.define('admin', () => {
  @Controller()
  class _AnchoredGlobalPrefixController extends ZanixController {
    @Get('probe')
    public probe() {
      return 'probe response'
    }
  }
})
