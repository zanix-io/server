// deno-lint-ignore-file no-explicit-any
import type { HandlerContext } from './context.ts'
import type { ZanixGlobalExports } from './program.ts'
import type { HttpMethods } from './router.ts'
import type { WebServerTypes } from './server.ts'
import type {
  ZanixConnectorsGetter,
  ZanixInteractorsGetter,
  ZanixProvidersGetter,
} from './targets.ts'

type GuardResponse = { response?: Response; headers?: Record<string, string> }
type GuardContext = HandlerContext & {
  interactors: ZanixInteractorsGetter
  providers: ZanixProvidersGetter
  connectors: ZanixConnectorsGetter
}
type GlobalMidContext = HandlerContext & { interactors: ZanixInteractorsGetter }

export type GlobalMiddlewareContext = ZanixGlobalExports<{ server: (WebServerTypes | 'all')[] }>

export type MiddlewareInternalGuard<A extends unknown[] = any[]> = (
  context: HandlerContext,
  ...args: A
) => GuardResponse | Promise<GuardResponse>

/**
 * Represents a middleware guard function that performs side effects after request handling.
 *
 * It receives the `GuardContext` and any number of additional arguments, and may return
 * `void` or a `Promise<void>`. Guards are typically used for rate limit, authentication, etc.
 *
 * @template A - Tuple of additional argument types passed to the middleware.
 */
export type MiddlewareGuard<A extends unknown[] = any[]> = (
  context: GuardContext,
  ...args: A
) => GuardResponse | Promise<GuardResponse>

/**
 * Represents a middleware pipe function that performs side effects during request handling.
 *
 * It receives the `HandlerContext` and any number of additional arguments, and may return
 * `void` or a `Promise<void>`. Pipes are typically used for logging, metrics, mutation tracking,
 * or other non-returning operations.
 *
 * @template A - Tuple of additional argument types passed to the middleware.
 */
export type MiddlewarePipe<A extends unknown[] = any[]> = (
  context: HandlerContext,
  ...args: A
) => void | Promise<void>

/**
 * Represents a middleware interceptor that processes a `Response` after a request is handled.
 *
 * This middleware receives the `HandlerContext`, the current `Response`, and any additional arguments.
 * It can return a new `Response` or a `Promise` resolving to one.
 */
export type MiddlewareInterceptor<A extends unknown[] = any[]> = (
  context: HandlerContext,
  response: Response,
  ...args: A
) => Response | Promise<Response>

/**
 * A global middleware pipe function that performs side effects across all requests, with access to global context.
 *
 * Combines `GlobalMiddlewareContext` with a pipe function that also receives the `ZanixInteractorsGetter`
 * and any additional arguments. Useful for global cross-cutting concerns like analytics or tracing.
 *
 * @template A - Tuple of additional argument types passed to the middleware.
 */
export type MiddlewareGlobalGuard<A extends unknown[] = any[]> =
  & GlobalMiddlewareContext
  & ((
    context: GuardContext,
    ...args: A
  ) => GuardResponse | Promise<GuardResponse>)

/**
 * A global middleware pipe function that performs side effects across all requests, with access to global context.
 *
 * Combines `GlobalMiddlewareContext` with a pipe function that also receives the `ZanixInteractorsGetter`
 * and any additional arguments. Useful for global cross-cutting concerns like analytics or tracing.
 *
 * @template A - Tuple of additional argument types passed to the middleware.
 */
export type MiddlewareGlobalPipe<A extends unknown[] = any[]> =
  & GlobalMiddlewareContext
  & ((
    context: GlobalMidContext,
    ...args: A
  ) => void | Promise<void>)

/**
 * A global middleware interceptor that combines `GlobalMiddlewareContext` with a response-handling function.
 *
 * This variant of middleware has access to application-level context, including `ZanixInteractorsGetter`.
 * It is intended for global logic like logging, error tracking, or feature toggles.
 */
export type MiddlewareGlobalInterceptor<A extends unknown[] = any[]> =
  & GlobalMiddlewareContext
  & ((
    context: GlobalMidContext,
    response: Response,
    ...args: A
  ) => Response | Promise<Response>)

export type MiddlewareTypes = 'guard' | 'pipe' | 'interceptor'

export type CorsOrigin<Credential extends boolean> = true extends Credential ? {
    /**
     * Specifies the allowed origin(s). Can be a string, regex, array, or a function returning a boolean.
     */
    origins: (string | RegExp)[] | ((origin: string) => boolean)
  }
  // deno-lint-ignore ban-types
  : {}

/**
 * Configuration options for Cross-Origin Resource Sharing (CORS).
 */
export type CorsOptions<Credential extends boolean = true> = CorsOrigin<Credential> & {
  /**
   * Whether to include credentials (`true` or `false`) in cross-origin requests. Defaults to `true`.
   */
  credentials?: Credential
  /**
   * List of headers that browsers are allowed to access from the response.
   */
  exposedHeaders?: string[]
  /**
   * List of headers that clients are allowed to send in requests.
   */
  allowedHeaders?: string[]
  /**
   * HTTP methods allowed for cross-origin requests (excluding OPTIONS).
   */
  allowedMethods?: Exclude<HttpMethods, 'OPTIONS'>[]
  /**
   * Optional configuration for preflight (OPTIONS) requests.
   */
  preflight?: {
    /**
     * Maximum time (in seconds) that the preflight response can be cached.
     */
    maxAge: 600 | 3600 | 86400
    /**
     * Status code to return for successful preflight responses.
     */
    optionsSuccessStatus: 200 | 204
  }
}
