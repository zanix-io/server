// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in health-disabled.test.ts. */
await ProgramModule.applications.define('health-disabled', () => {
  @Controller()
  class _HealthDisabledController extends ZanixController {
    @Get('/orders')
    public list() {
      return { orders: [] }
    }
  }
})
