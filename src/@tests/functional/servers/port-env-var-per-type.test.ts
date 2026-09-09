import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * Regression coverage: `bootstrapServerType` (`webserver/mod.ts`) forwards a type's own literal
 * port default (`SOCKET_PORT`/`STATIC_PORT`/`GRAPHQL_PORT`) to `WebServerManager.create` as its
 * own argument instead of folding it into `options.server.port` before `create` ever runs — the
 * fold would make an unset `port` look identical to that literal default, permanently outranking
 * the `PORT_<TYPE>`/`PORT` env-var lookup (`getEnvPort`) inside `create`'s own fallback chain.
 * Each step below leaves `port` unset in `bootstrapServers` and expects the env var — not the
 * type's hardcoded default (20201/20202/20203) — to win. REST is deliberately not covered here:
 * its own call site never had a `defaultPort` to fold in the first place.
 *
 * All three steps run inside ONE test, `finalize: false` on every call but the last, so that an
 * earlier step's own `postBoot` cleanup never wipes the routes/resolver `fixture.ts` registered
 * for a LATER step's Application — the same multi-call-boot-sequence contract
 * `bootstrapServers`'s own doc describes for `@zanix/core`'s `start.ts`.
 */

await import('./fixtures/port-env-var-per-type.fixture.ts')

Deno.test(
  "bootstrapServers: PORT_<TYPE> is honored for ssr/socket/graphql when that type's own `port` is left unset",
  async () => {
    const allServers: string[] = []
    try {
      Deno.env.set('PORT_SSR', '47001')
      const ssrServers = await bootstrapServers({ ssr: { application: 'port-env-ssr' } }, {
        finalize: false,
      })
      Deno.env.delete('PORT_SSR')
      allServers.push(...ssrServers)
      assertEquals(ssrServers.length, 1)
      const ssrAddr = webServerManager.info(ssrServers[0]).addr
      assert(ssrAddr, 'the ssr server should be listening')
      assertEquals(ssrAddr.port, 47001)

      Deno.env.set('PORT_SOCKET', '47002')
      const socketServers = await bootstrapServers({ socket: { application: 'port-env-socket' } }, {
        finalize: false,
      })
      Deno.env.delete('PORT_SOCKET')
      allServers.push(...socketServers)
      assertEquals(socketServers.length, 1)
      const socketAddr = webServerManager.info(socketServers[0]).addr
      assert(socketAddr, 'the socket server should be listening')
      assertEquals(socketAddr.port, 47002)

      Deno.env.set('PORT_GRAPHQL', '47003')
      const graphqlServers = await bootstrapServers({
        graphql: { application: 'port-env-graphql' },
      })
      Deno.env.delete('PORT_GRAPHQL')
      allServers.push(...graphqlServers)
      assertEquals(graphqlServers.length, 1)
      const graphqlAddr = webServerManager.info(graphqlServers[0]).addr
      assert(graphqlAddr, 'the graphql server should be listening')
      assertEquals(graphqlAddr.port, 47003)
    } finally {
      Deno.env.delete('PORT_SSR')
      Deno.env.delete('PORT_SOCKET')
      Deno.env.delete('PORT_GRAPHQL')
      await webServerManager.stop(allServers)
    }
  },
)
