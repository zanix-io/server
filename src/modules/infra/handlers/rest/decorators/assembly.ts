import type {
  HandlerDecoratorMethodOptions,
  HandlerDecoratorOptions,
  ZanixClassDecorator,
  ZanixMethodDecorator,
} from 'typings/decorators.ts'
import type { HttpMethods } from 'typings/router.ts'

import { applyMiddlewaresToTarget, definePipeDecorator } from 'middlewares/decorators/assembly.ts'
import { requestValidationPipe } from 'middlewares/validation.pipe.ts'
import Program from 'modules/program/main.ts'
import { ZanixController } from '../base.ts'
import { getTargetKey } from 'utils/targets.ts'

/** Define decorator to register a route for handler controller */
export function defineControllerDecorator(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  let prefix: string | undefined
  let interactor: string | undefined
  if (typeof options === 'string') {
    prefix = options
  } else if (options) {
    interactor = getTargetKey(options.Interactor)
    prefix = options.prefix
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixController)) {
      throw new Deno.errors.Interrupted(
        `'${Target.name}' is not a valid Controller. Please extend ${ZanixController.name}`,
      )
    }

    applyMiddlewaresToTarget(Target)

    Program.routes.setEndpoint({ Target, endpoint: prefix })
    const methodDecorators = Program.decorators.getDecoratorsData('controller')

    methodDecorators.forEach((decorator) => {
      const { handler, endpoint, httpMethod } = decorator
      Program.routes.setEndpoint({ Target, propertyKey: handler, endpoint })
      Program.routes.addHttpMethod(httpMethod, { Target, propertyKey: handler })
      Program.targets.addProperty({ Target, propertyKey: handler })
    })
    Program.decorators.deleteDecorators('controller')

    Program.targets.toBeInstanced(getTargetKey(Target), {
      type: 'controller',
      Target,
      dataProps: { interactor },
      lifetime: 'TRANSIENT',
    })

    Program.routes.defineRoute('rest', Target)
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
    Program.decorators.addDecoratorData(
      { handler, endpoint: endpoint || handler, httpMethod },
      'controller',
    )
    if (rto) definePipeDecorator((ctx) => requestValidationPipe(ctx, rto))(method)
  }
}
