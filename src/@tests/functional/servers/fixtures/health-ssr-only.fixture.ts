// deno-coverage-ignore-file

import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in health-ssr-only.test.ts — no REST/graphql/
 * socket content registered anywhere in this Application, on purpose (see hecho #1 of the
 * Health/Readiness design doc, extended to `ssr`: the multiplexer's `''`-catch-all dispatch key
 * SSR's own unprefixed server uses never shadows an exact-match key like `'health'`/`'ready'`). */
await ProgramModule.applications.define('health-ssr-only', () => {
  ProgramModule.routes.defineRoute('ssr', {
    path: '/products/:id',
    handler: () =>
      new Response('<html>ssr page</html>', {
        headers: { 'content-type': 'text/html' },
      }) as never,
  })
})
