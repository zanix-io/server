import { assertEquals } from '@std/assert/assert-equals'
import { bootstrapServers } from 'modules/webserver/mod.ts'

Deno.test('bootstrapServers: returns no servers when nothing is registered to serve', async () => {
  const servers = await bootstrapServers()
  assertEquals(servers, [])
})

// The other `bootstrapServers()` tests that used to live here all bind a real port (some via a
// real `fetch()` too, some only via `webServerManager.stop()` on the bound server) — either one
// already disqualifies from unit-tier. They moved to:
//   - functional/servers/ssr-prehandler-intercept.test.ts
//   - functional/servers/ssr-server-at-site-root.test.ts
//   - functional/servers/application-scoped-rest-route.test.ts
//   - functional/servers/explicit-server-id.test.ts
//   - functional/servers/server-option-scoping.test.ts
// The test above never binds a port — `bootstrapServers()` with nothing registered returns `[]`
// before any server is created — so it's the only one that's genuinely unit-tier.
