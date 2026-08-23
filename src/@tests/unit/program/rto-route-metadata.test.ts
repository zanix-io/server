import { assertEquals, assertStrictEquals } from '@std/assert'
import { BaseRTO, IsString } from '@zanix/validator'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Post } from 'modules/infra/handlers/rest/decorators/post.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'

/**
 * Locks in the class-level route-metadata contract a static consumer (e.g. an OpenAPI generator)
 * needs: `ProgramModule.routes.getRoutes('rest')`'s entry for a route carries the exact `rto`
 * passed to its own method decorator, without having to validate a real payload or construct any
 * instance — it's plain, persisted metadata from registration time.
 */

class CreateUserBody extends BaseRTO {
  @IsString({ expose: true })
  accessor email!: string
}

Deno.test('getRoutes("rest") entry.rto resolves to the exact RTO passed to @Post', () => {
  @Controller({ prefix: 'rto-route-metadata-users' })
  class _UsersController extends ZanixController {
    @Post('', { Body: CreateUserBody })
    public createUser() {
      return {}
    }
  }

  const routes = ProgramModule.routes.getRoutes('rest')
  const entry = routes?.['main:/rto-route-metadata-users/POST']

  assertStrictEquals(entry?.rto?.Body, CreateUserBody)
})

Deno.test('getRoutes("rest") entry.rto is undefined for a route with no RTO', () => {
  @Controller({ prefix: 'rto-route-metadata-health' })
  class _HealthController extends ZanixController {
    @Get('')
    public check() {
      return { ok: true }
    }
  }

  const routes = ProgramModule.routes.getRoutes('rest')
  const entry = routes?.['main:/rto-route-metadata-health/GET']

  assertEquals(entry?.rto, undefined)
})
