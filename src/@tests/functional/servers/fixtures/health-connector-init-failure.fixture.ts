// deno-coverage-ignore-file

import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'

/** `startMode: 'postBoot'` connector whose `initialize()` always fails — deliberately `postBoot`,
 * not `onBoot`: a failing `onBoot`/`onSetup` connector still fails `bootstrapServers()` itself
 * (fail-fast is unchanged for those, see `targetInitializations`'s own doc), so it would never
 * reach a point where `/ready` could be polled at all. `postBoot` is also what
 * `@zanix/asyncmq`'s real `ZanixRabbitMQConnector` registration uses. Eagerly instantiated as part
 * of this test's own `bootstrapServers()` call (`targetInitializations('postBoot')` is awaited
 * before `bootstrapServers()` returns), so it's reachable later via `useExistingInstance: true` —
 * see `health-connector-readiness.fixture.ts` for why that matters. A short
 * `timeoutConnection`/`retryInterval` keeps the test itself fast. */
@Connector({ startMode: 'postBoot' })
class _HealthReadinessInitFailureConnector extends ZanixConnector {
  protected override initialize() {
    throw new Error('backing service unreachable')
  }
  public override isHealthy() {
    return true // never reached: isReady itself never resolves
  }
  protected override close() {
    return true
  }
}

_HealthReadinessInitFailureConnector.prototype[ZANIX_PROPS] = {
  ..._HealthReadinessInitFailureConnector.prototype[ZANIX_PROPS],
  data: {
    ..._HealthReadinessInitFailureConnector.prototype[ZANIX_PROPS]?.data,
    autoInitialize: { timeoutConnection: 30, retryInterval: 10 },
  },
}

await ProgramModule.applications.define('health-connector-init-failure', () => {
  @Controller()
  class _HealthConnectorInitFailureController extends ZanixController {
    @Get('/ping')
    public ping() {
      return 'pong'
    }
  }
})
