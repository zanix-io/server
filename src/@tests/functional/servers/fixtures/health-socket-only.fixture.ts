// deno-coverage-ignore-file

import { ZanixWebSocket } from 'handlers/sockets/base.ts'
import { Socket } from 'handlers/sockets/decorators/base.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Imported before the `bootstrapServers()` call in health-socket-only.test.ts — no REST content
 * registered anywhere in this Application, on purpose (see hecho #1 of the Health/Readiness design
 * doc: socket never occupies the port's root, so `/health`/`/ready` can ride alongside it). */
await ProgramModule.applications.define('health-socket-only', () => {
  @Socket('echo')
  class _HealthSocketOnly extends ZanixWebSocket {
    protected override onmessage(ev: MessageEvent) {
      return { echo: ev.data }
    }
  }
})
