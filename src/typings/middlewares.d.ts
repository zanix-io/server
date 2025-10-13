type GlobalMiddlewareContext = ZanixGlobalExports<{ server: WebServerTypes[] }>

type MiddlewarePipe<A extends unknown[] = never[]> = (
  context: HandlerContext,
  ...args: A
) => void | Promise<void>

type MiddlewareGlobalPipe<A extends unknown[] = never[]> =
  & GlobalMiddlewareContext
  & ((
    context: HandlerContext & { interactors: ZanixInteractorsGetter },
    ...args: A
  ) => void | Promise<void>)

type MiddlewareInterceptor = (
  context: HandlerContext,
  response: Response,
  ...args: unknown[]
) => Response | Promise<Response>

type MiddlewareGlobalInterceptor =
  & GlobalMiddlewareContext
  & ((
    context: HandlerContext & { interactors: ZanixInteractorsGetter },
    response: Response,
    ...args: unknown[]
  ) => Response | Promise<Response>)

type MiddlewareInternalInterceptor = (
  context: HandlerContext,
) => Response | Promise<Response>

type MiddlewareTypes = 'pipe' | 'interceptor'
