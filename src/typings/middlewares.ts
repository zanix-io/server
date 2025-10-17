import type { HandlerContext } from './context.ts'
import type { ZanixGlobalExports } from './program.ts'
import type { WebServerTypes } from './server.ts'
import type { ZanixInteractorsGetter } from './targets.ts'

export type GlobalMiddlewareContext = ZanixGlobalExports<{ server: WebServerTypes[] }>
/**
 * Represents a middleware pipe function that performs side effects during request handling.
 *
 * It receives the `HandlerContext` and any number of additional arguments, and may return
 * `void` or a `Promise<void>`. Pipes are typically used for logging, metrics, mutation tracking,
 * or other non-returning operations.
 *
 * @template A - Tuple of additional argument types passed to the middleware.
 */
export type MiddlewarePipe<A extends unknown[] = never[]> = (
  context: HandlerContext,
  ...args: A
) => void | Promise<void>

/**
 * A global middleware pipe function that performs side effects across all requests, with access to global context.
 *
 * Combines `GlobalMiddlewareContext` with a pipe function that also receives the `ZanixInteractorsGetter`
 * and any additional arguments. Useful for global cross-cutting concerns like analytics or tracing.
 *
 * @template A - Tuple of additional argument types passed to the middleware.
 */
export type MiddlewareGlobalPipe<A extends unknown[] = never[]> =
  & GlobalMiddlewareContext
  & ((
    context: HandlerContext & { interactors: ZanixInteractorsGetter },
    ...args: A
  ) => void | Promise<void>)

/**
 * Represents a middleware interceptor that processes a `Response` after a request is handled.
 *
 * This middleware receives the `HandlerContext`, the current `Response`, and any additional arguments.
 * It can return a new `Response` or a `Promise` resolving to one.
 */
export type MiddlewareInterceptor = (
  context: HandlerContext,
  response: Response,
  ...args: unknown[]
) => Response | Promise<Response>

/**
 * A global middleware interceptor that combines `GlobalMiddlewareContext` with a response-handling function.
 *
 * This variant of middleware has access to application-level context, including `ZanixInteractorsGetter`.
 * It is intended for global logic like logging, error tracking, or feature toggles.
 */
export type MiddlewareGlobalInterceptor =
  & GlobalMiddlewareContext
  & ((
    context: HandlerContext & { interactors: ZanixInteractorsGetter },
    response: Response,
    ...args: unknown[]
  ) => Response | Promise<Response>)

/**
 * An internal-only middleware interceptor that handles requests at a lower level.
 *
 * This middleware has access only to the `HandlerContext` and returns a `Response` directly or via a `Promise`.
 * Typically used for internal logic like authentication or request validation.
 */
export type MiddlewareInternalInterceptor = (
  context: HandlerContext,
) => Response | Promise<Response>

export type MiddlewareTypes = 'pipe' | 'interceptor'
