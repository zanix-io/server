import type { RtoTypes } from '@zanix/types'

import Program from 'modules/program/main.ts'
import { ZanixWebSocket } from '../base.ts'
import { getTargetKey } from 'utils/targets.ts'
import { socketHandler } from '../handler.ts'

/** Define decorator to register a route for socket handler */
export function defineSocketDecorator(
  options?: SocketDecoratorOptions,
): ZanixClassDecorator {
  const processorKey = '_processor'
  let route: string | undefined
  let interactor: string | undefined
  let rto: RtoTypes
  if (typeof options === 'string') {
    route = options
  } else if (options) {
    const optsRto = options.rto
    if (optsRto) {
      if (typeof optsRto !== 'object') rto = { Body: optsRto }
      else rto = optsRto
    }
    interactor = getTargetKey(options.Interactor)
    route = options.route
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixWebSocket)) {
      throw new Deno.errors.Interrupted(
        `'${Target.name}' is not a valid WebSocket. Please extend ${ZanixWebSocket.name}`,
      )
    }

    Target.prototype[processorKey] = socketHandler(rto)

    Program.routes.setEndpoint({ Target, endpoint: route })
    Program.targets.addProperty({ Target, propertyKey: processorKey })

    Program.decorators.deleteDecorators('socket')

    Program.targets.toBeInstanced(getTargetKey(Target), {
      type: 'socket',
      Target,
      dataProps: { interactor },
      lifetime: 'TRANSIENT',
    })

    Program.routes.defineRoute('socket', Target)
  }
}
