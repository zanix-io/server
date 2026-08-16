// deno-coverage-ignore-file

import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'

/** Mutated directly by health-connector-readiness.test.ts, between requests, to flip this
 * connector's own `isHealthy()` result — this is what lets that test observe a live readiness
 * transition without tearing the server down and rebuilding it. */
export const connectorState = { healthy: true }

/** `startMode: 'onBoot'` — instantiated (and thus reachable via `useExistingInstance: true`) as
 * part of this test's own `bootstrapServers()` call, via `targetInitializations('onBoot')`
 * (`webserver/mod.ts`'s own `bootstrapServersImpl`) — see `buildReadinessHandler`'s own doc
 * (`health.ts`) for why a never-instantiated connector would otherwise be skipped entirely. */
@Connector({ startMode: 'onBoot' })
class _HealthReadinessProbeConnector extends ZanixConnector {
  protected override initialize() {}
  public override isHealthy() {
    return connectorState.healthy
  }
  protected override close() {
    return true
  }
}

await ProgramModule.applications.define('health-connector-readiness', () => {
  @Controller()
  class _HealthConnectorReadinessController extends ZanixController {
    @Get('/ping')
    public ping() {
      return 'pong'
    }
  }
})
