// deno-coverage-ignore-file

import ProgramModule from 'modules/program/mod.ts'

/** A real SSR page whose OWN literal path IS `/health` — the exact-collision edge case. Detected
 * as a genuine override (this page wins, not the framework default) by checking `ProgramModule
 * .routes` for this Application's own registered route at the exact resolved path — see
 * `WebServerManager.create`'s own doc. */
await ProgramModule.applications.define('health-ssr-exact-collision', () => {
  ProgramModule.routes.defineRoute('ssr', {
    path: '/health',
    handler: () =>
      new Response(
        '<html>a real page someone built at /health</html>',
      ) as never,
  })
})
