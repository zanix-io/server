import type { RtoTypes } from '@zanix/types'
import type { SocketDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { VersionProtocolOption } from 'middlewares/protocol-version.ts'

import {
  applyMiddlewaresToTarget,
  applyVersionProtocolToTarget,
} from 'middlewares/decorators/assembly.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixWebSocket } from '../base.ts'
import { getTargetKey } from 'utils/targets.ts'
import { socketHandler } from '../handler.ts'
import { InternalError } from '@zanix/errors'

/** Define decorator to register a route for socket handler */
export function defineSocketDecorator(
  options?: SocketDecoratorOptions,
): ZanixClassDecorator {
  const processorKey = '_processor'
  let route: string | undefined
  let interactor: string | undefined
  let enableALS = false
  let isInternal = false
  let rto: RtoTypes
  let versionProtocol: VersionProtocolOption | undefined
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
    enableALS = options.enableALS || enableALS
    isInternal = options.isInternal || isInternal
    versionProtocol = options.versionProtocol
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixWebSocket)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid WebSocket. Please extend ${ZanixWebSocket.name}`,
        { meta: { target: Target.name, baseTarget: ZanixWebSocket.name } },
      )
    }

    // Prerequisite bugfix: unlike `@Controller`/`@Resolver`, this decorator never drained the
    // shared, module-level method-decorator queue (`ProgramModule.decorators`) before this fix. A
    // method-level `@Guard`/`@Pipe`/`@Interceptor` on a socket lifecycle method still has no
    // effect either way — a `@Socket` class has exactly one real route (the connection/upgrade
    // itself), not one per lifecycle method, so there's no per-method route key for it to bind to
    // (see docs/MIDDLEWARES.md's "Middleware on sockets" section) — but leaving the queue
    // undrained here left any such (mistaken) entry sitting around to be incorrectly drained onto
    // whichever *next* `@Controller`/`@Resolver`/`@Socket` class happened to call this function.
    applyMiddlewaresToTarget(Target)
    // Negotiated once, at the connection handshake — the WebSocket upgrade's own request/response
    // — since an open socket has no per-message header concept.
    applyVersionProtocolToTarget(Target, versionProtocol)

    Target.prototype[processorKey] = socketHandler(rto)

    ProgramModule.routes.setEndpoint({ Target, endpoint: route })
    ProgramModule.targets.addProperty({ Target, propertyKey: processorKey })

    ProgramModule.decorators.deleteDecorators('socket')

    ProgramModule.targets.defineTarget(getTargetKey(Target), {
      type: 'socket',
      Target,
      dataProps: { interactor, enableALS },
      lifetime: 'TRANSIENT',
    })

    ProgramModule.routes.defineRoute('socket', Target, isInternal)
  }
}
