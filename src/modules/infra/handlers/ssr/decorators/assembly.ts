import type { HandlerDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'

import {
  applyMiddlewaresToTarget,
  applyVersionProtocolToTarget,
} from 'middlewares/decorators/assembly.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixSsrController } from '../base.ts'
import { InternalError } from '@zanix/errors'
import type { VersionProtocolOption } from 'middlewares/protocol-version.ts'

/**
 * Define decorator to register a route for an SSR handler controller.
 *
 * Mirrors `defineControllerDecorator` (REST) exactly, except the route it registers is of type
 * `'ssr'` instead of `'rest'`, and the class must extend `ZanixSsrController` instead of
 * `ZanixController`. The `@Get`/`@Post`/`@Patch`/`@Put`/`@Delete`/`@Request` method decorators are
 * shared as-is between both — they only ever queue `{ handler, endpoint, httpMethod }` metadata,
 * with no server-type of their own, so the same decorators work under either class decorator.
 */
export function defineSsrControllerDecorator(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  let prefix: string | undefined
  let interactor: string | undefined
  let enableALS = false
  let versionProtocol: VersionProtocolOption | undefined
  if (typeof options === 'string') {
    prefix = options
  } else if (options) {
    interactor = getTargetKey(options.Interactor)
    prefix = options.prefix
    enableALS = options.enableALS || enableALS
    versionProtocol = options.versionProtocol
  }

  return function (Target) {
    const targetInstance = Target.prototype instanceof ZanixSsrController
    if (!targetInstance) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid SsrController. Please extend ${ZanixSsrController.name}`,
        { meta: { target: Target.name, baseTarget: ZanixSsrController.name } },
      )
    }

    applyMiddlewaresToTarget(Target)
    applyVersionProtocolToTarget(Target, versionProtocol)

    ProgramModule.routes.setEndpoint({ Target, endpoint: prefix })
    const methodDecorators = ProgramModule.decorators.getDecoratorsData(
      'controller',
    )

    methodDecorators.forEach((decorator) => {
      const { handler, httpMethod, endpoint } = decorator
      ProgramModule.routes.setEndpoint({
        Target,
        propertyKey: handler,
        endpoint,
        httpMethod,
      })
      ProgramModule.targets.addProperty({ Target, propertyKey: handler })
    })
    ProgramModule.decorators.deleteDecorators('controller')

    ProgramModule.targets.defineTarget(getTargetKey(Target), {
      type: 'controller',
      Target,
      dataProps: { interactor, enableALS },
      lifetime: 'TRANSIENT',
    })

    ProgramModule.routes.defineRoute('ssr', Target)
  }
}
