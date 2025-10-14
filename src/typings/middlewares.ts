import type { HandlerContext } from './context.ts'
import type { ZanixGlobalExports } from './program.ts'
import type { WebServerTypes } from './server.ts'
import type { ZanixInteractorsGetter } from './targets.ts'

export type GlobalMiddlewareContext = ZanixGlobalExports<{ server: WebServerTypes[] }>

export type MiddlewarePipe<A extends unknown[] = never[]> = (
  context: HandlerContext,
  ...args: A
) => void | Promise<void>

export type MiddlewareGlobalPipe<A extends unknown[] = never[]> =
  & GlobalMiddlewareContext
  & ((
    context: HandlerContext & { interactors: ZanixInteractorsGetter },
    ...args: A
  ) => void | Promise<void>)

export type MiddlewareInterceptor = (
  context: HandlerContext,
  response: Response,
  ...args: unknown[]
) => Response | Promise<Response>

export type MiddlewareGlobalInterceptor =
  & GlobalMiddlewareContext
  & ((
    context: HandlerContext & { interactors: ZanixInteractorsGetter },
    response: Response,
    ...args: unknown[]
  ) => Response | Promise<Response>)

export type MiddlewareInternalInterceptor = (
  context: HandlerContext,
) => Response | Promise<Response>

export type MiddlewareTypes = 'pipe' | 'interceptor'
