import type {
  HandlerDecoratorMethodOptions,
  HandlerDecoratorOptions,
  ZanixClassDecorator,
  ZanixMethodDecorator,
} from 'typings/decorators.ts'
import type { HttpMethods } from 'typings/router.ts'

import { applyMiddlewaresToTarget, definePipeDecorator } from 'middlewares/decorators/assembly.ts'
import { requestValidationPipe } from 'middlewares/defaults/validation.pipe.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixController } from '../base.ts'
import { InternalError } from '@zanix/errors'

/** Define decorator to register a route for handler controller */
export function defineControllerDecorator(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  let prefix: string | undefined
  let interactor: string | undefined
  let enableALS = false
  if (typeof options === 'string') {
    prefix = options
  } else if (options) {
    interactor = getTargetKey(options.Interactor)
    prefix = options.prefix
    enableALS = options.enableALS || enableALS
  }

  return function (Target) {
    const targetInstance = Target.prototype instanceof ZanixController
    if (!targetInstance) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Controller. Please extend ${ZanixController.name}`,
      )
    }

    applyMiddlewaresToTarget(Target)

    ProgramModule.routes.setEndpoint({ Target, endpoint: prefix })
    const methodDecorators = ProgramModule.decorators.getDecoratorsData('controller')

    methodDecorators.forEach((decorator) => {
      const { handler, endpoint, httpMethod } = decorator
      ProgramModule.routes.setEndpoint({ Target, propertyKey: handler, endpoint })
      ProgramModule.routes.addHttpMethod(httpMethod, { Target, propertyKey: handler })
      ProgramModule.targets.addProperty({ Target, propertyKey: handler })
    })
    ProgramModule.decorators.deleteDecorators('controller')

    ProgramModule.targets.defineTarget(getTargetKey(Target), {
      type: 'controller',
      Target,
      dataProps: { interactor, enableALS },
      lifetime: 'TRANSIENT',
    })

    ProgramModule.routes.defineRoute('rest', Target)
  }
}

/** Define decorator to register a controller method */
export function defineControllerMethodDecorator(
  httpMethod: HttpMethods,
  options: HandlerDecoratorMethodOptions,
): ZanixMethodDecorator {
  let { rto, pathOrRTO } = options
  if (typeof pathOrRTO !== 'string') {
    rto = pathOrRTO
    pathOrRTO = ''
  }
  if (rto && typeof rto !== 'object') rto = { Search: rto }

  const endpoint = pathOrRTO

  return function (method) {
    const handler = method.name.toString()
    ProgramModule.decorators.addDecoratorData(
      { handler, endpoint: endpoint || handler, httpMethod },
      'controller',
    )
    if (rto) definePipeDecorator((ctx) => requestValidationPipe(ctx, rto))(method)
  }
}
