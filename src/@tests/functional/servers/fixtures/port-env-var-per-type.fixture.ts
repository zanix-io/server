// deno-coverage-ignore-file

import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'
import { ZanixWebSocket } from 'handlers/sockets/base.ts'
import { Socket } from 'handlers/sockets/decorators/base.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before every `bootstrapServers()` call in port-env-var-per-type.test.ts — one
 * Application per type, each with the bare minimum registration needed for that type's own
 * `serve.<type>` gate (`hasRoutesForScope`/a real resolver target) to pass, so each test can name
 * only its own type and get exactly one server. */
await ProgramModule.applications.define('port-env-ssr', () => {
  ProgramModule.routes.defineRoute('ssr', {
    path: '/port-env-ssr-probe',
    handler: () =>
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      }) as never,
  })
})

await ProgramModule.applications.define('port-env-socket', () => {
  @Socket('echo')
  class _PortEnvSocketProbe extends ZanixWebSocket {
    protected override onmessage(ev: MessageEvent) {
      return { echo: ev.data }
    }
  }
})

await ProgramModule.applications.define('port-env-graphql', () => {
  @Resolver()
  class _PortEnvGraphqlProbe extends ZanixResolver {
    @Query()
    public portenvprobe() {
      return 'probe response'
    }
  }
})
