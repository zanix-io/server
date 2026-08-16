// deno-coverage-ignore-file

import ProgramModule from 'modules/program/mod.ts'

export const BODY = JSON.stringify({ value: 'x'.repeat(2000) })

await ProgramModule.applications.define('gzip-rest-buffered', () => {
  ProgramModule.routes.defineRoute('rest', {
    path: '/data',
    httpMethod: 'GET',
    handler: () =>
      new Response(BODY, {
        headers: { 'content-type': 'application/json' },
      }) as never,
  })
})
