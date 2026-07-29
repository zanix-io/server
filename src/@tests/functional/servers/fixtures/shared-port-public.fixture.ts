// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'

/**
 * Imported AFTER the internal `bootstrapServers()` call in shared-port.test.ts — mirroring
 * `core/start.ts`'s real timing (`defineLocalMetadata()` runs, and thus registers public
 * handlers, only after the admin/internal `bootstrapServers()` call has already completed its own
 * `onBoot` cleanup, which wipes the routes metadata container).
 */
@Controller()
export class _SharedPortPublicController extends ZanixController {
  @Get('hello')
  public hello() {
    return 'public response'
  }
}
