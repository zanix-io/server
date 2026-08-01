// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'

/**
 * Imported, alongside the anchored fixture, before either `bootstrapServers()` call in
 * shared-port.test.ts — mirroring `core/start.ts`'s real timing (`defineLocalMetadata()`, and thus
 * default-Application handler registration, completes before either the anchored/admin or the
 * unanchored `bootstrapServers()` call runs).
 */
@Controller()
export class _SharedPortUnanchoredController extends ZanixController {
  @Get('hello')
  public hello() {
    return 'unanchored response'
  }
}
