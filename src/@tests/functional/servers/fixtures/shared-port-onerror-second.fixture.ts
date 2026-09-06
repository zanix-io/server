// deno-coverage-ignore-file

import { HttpError } from '@zanix/errors'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { Guard } from 'modules/infra/middlewares/decorators/guard.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * Registered second, with its own `onError` — see `onerror-shared-port.test.ts`. Throws via
 * `@Guard`, not the route body: a plain handler throw never reaches `onError` at all
 * (`mainProcess`'s own doc, `helpers/handler.ts`).
 */
await ProgramModule.applications.define('onerror-second', () => {
  @Controller()
  class _SharedPortOnErrorSecondController extends ZanixController {
    @Get('protected')
    @Guard(() => {
      throw new HttpError('UNAUTHORIZED')
    })
    public protectedRoute() {
      return 'unreachable — the guard above always throws first'
    }
  }
})
