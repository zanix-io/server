// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'

/** Imported BEFORE the internal `bootstrapServers()` call in shared-port.test.ts. */
@Controller({ isInternal: true })
export class _SharedPortInternalController extends ZanixController {
  @Get('internal-hello')
  public internalHello() {
    return 'internal response'
  }
}
