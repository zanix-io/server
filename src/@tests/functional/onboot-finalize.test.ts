import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'
import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { registerGlobalInterceptor } from 'modules/infra/middlewares/defs/interceptors.ts'
import type { MiddlewareGlobalInterceptor } from 'typings/middlewares.ts'

stub(console, 'info')

// Real repro for the bug fixed this session: `cleanupInitializationsMetadata('onBoot')` used to
// wipe global middlewares unconditionally after every single `WebServerManager.start()` call, with
// no `finalize` gate — unlike `postBoot`'s routes/discovery, which already respected it. A global
// interceptor registered ONCE, before a multi-`bootstrapServers()`-call boot sequence (the exact
// shape `@zanix/core`'s own `start.ts` uses for its admin+main servers), would silently stop being
// baked into any `@Controller`-decorated route defined for a LATER call in that sequence, since
// `RouteContainer.defineTargetRoutes` only bakes in whatever `this.middlewares.getMiddlewares(...)`
// returns at the exact moment each controller class decorator runs. This test proves a controller
// decorated for the SECOND application in the sequence still gets the interceptor.
Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    'a global interceptor registered before a multi-call bootstrapServers() sequence is still baked into a controller decorated for the LATER call',
  fn: async () => {
    const stampingInterceptor: MiddlewareGlobalInterceptor = (
      _ctx,
      response,
    ) => {
      response.headers.set('X-Onboot-Finalize-Test', 'applied')
      return response
    }
    registerGlobalInterceptor(stampingInterceptor)

    await ProgramModule.applications.define('onboot-finalize-first', () => {
      @Controller()
      class _FirstController extends ZanixController {
        @Get('first')
        public first() {
          return { ok: true }
        }
      }
    })
    // Not the last call of the sequence — mirrors `@zanix/core`'s own admin-then-main shape.
    const firstServers = await bootstrapServers(
      { rest: { application: 'onboot-finalize-first', port: 1500 } },
      { finalize: false },
    )
    assert(firstServers.length > 0, 'the first server should have started')

    // Decorated AFTER the first bootstrapServers() call — the exact moment `defineTargetRoutes`
    // bakes in whatever global interceptors are still registered.
    await ProgramModule.applications.define('onboot-finalize-second', () => {
      @Controller()
      class _SecondController extends ZanixController {
        @Get('second')
        public second() {
          return { ok: true }
        }
      }
    })
    // The last call of the sequence — default finalize:true.
    const secondServers = await bootstrapServers({
      rest: { application: 'onboot-finalize-second', port: 1501 },
    })
    assert(secondServers.length > 0, 'the second server should have started')

    const info = webServerManager.info(secondServers[0])
    assert(info.addr, 'the second server should be listening')

    const res = await fetch(
      `http://${info.addr.hostname}:${info.addr.port}/api/second`,
    )
    assertEquals(res.headers.get('X-Onboot-Finalize-Test'), 'applied')
    await res.body?.cancel()

    await webServerManager.stop([...firstServers, ...secondServers])
  },
})
