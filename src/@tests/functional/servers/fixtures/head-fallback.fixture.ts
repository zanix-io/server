// deno-coverage-ignore-file

import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { Post } from 'modules/infra/handlers/rest/decorators/post.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in `head-fallback.test.ts`. */
await ProgramModule.applications.define('head-fallback', () => {
  @Controller()
  class _HeadFallbackController extends ZanixController {
    // A plain `Get()` route with no `Head()` counterpart — `HEAD` requests against it fall back
    // to this handler's own `GET` response, body stripped.
    @Get('items')
    public list() {
      return new Response(JSON.stringify({ items: [1, 2, 3] }), {
        headers: { 'content-type': 'application/json', 'x-fixture': 'head-fallback' },
      })
    }

    // A `:param` route — exercises the RELATIVE bucket's own `GET` fallback (`relativeByMethod`),
    // not just the absolute-path one `list()` above already covers.
    @Get('items/:id')
    public getOne(ctx: { payload: { params: { id: string } } }) {
      return { id: ctx.payload.params.id }
    }

    // `POST`-only — no `GET` registered at this exact path at all, so a `HEAD` here must still
    // 405 (never silently matches a route that only exists for a different, non-`GET` method).
    @Post('orders')
    public create() {
      return { created: true }
    }
  }
})
