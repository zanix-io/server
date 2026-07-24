// deno-lint-ignore-file no-explicit-any
import type { HandlerContext } from './context.ts'
import type { ZanixGlobalExports } from './program.ts'
import type { HttpMethod } from './router.ts'
import type { WebServerTypes } from './server.ts'
import type {
  ZanixConnectorsGetter,
  ZanixInteractorsGetter,
  ZanixProvidersGetter,
} from './targets.ts'

/** What a guard may return: a short-circuiting `response`, extra `headers`, or neither. */
export type GuardResponse = {
  /** If set, short-circuits the request and is sent back as-is instead of reaching the handler. */
  response?: Response
  /** Extra headers to merge into the eventual response. */
  headers?: Record<string, string>
}
/** The context passed to a per-handler guard: `HandlerContext` plus DI getters. */
export type GuardContext = HandlerContext & {
  interactors: ZanixInteractorsGetter
  providers: ZanixProvidersGetter
  connectors: ZanixConnectorsGetter
}
/** The context passed to a global pipe/interceptor: `HandlerContext` plus the interactors getter. */
export type GlobalMidContext = HandlerContext & { interactors: ZanixInteractorsGetter }

/** Declares which server types (or `'all'`) a global middleware definition applies to. */
export type GlobalMiddlewareContext = ZanixGlobalExports<{ server: (WebServerTypes | 'all')[] }>

export type MiddlewareInternalGuard<A extends unknown[] = any[]> = (
  context: HandlerContext,
  ...args: A
) => GuardResponse | Promise<GuardResponse>

/**
 * Represents a middleware guard function that runs before the handler (and any pipes/interceptors),
 * deciding whether the request is allowed to proceed.
 *
 * It receives the `GuardContext` — which extends `HandlerContext` with `interactors`, `providers`
 * and `connectors` getters — and any number of additional arguments. It may return a `GuardResponse`
 * (an object with optional `response`/`headers`) or a `Promise` resolving to one: returning a
 * `response` short-circuits the request, terminating the flow before it reaches the handler.
 * Guards are typically used for authentication, authorization, or rate limiting.
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
 * A global middleware guard function that decides whether requests across all (or selected)
 * servers are allowed to proceed, with access to global context.
 *
 * Combines `GlobalMiddlewareContext` with a guard function that receives the `GuardContext`
 * (`interactors`, `providers` and `connectors` getters) and any additional arguments, returning
 * a `GuardResponse | Promise<GuardResponse>`. Useful for global cross-cutting concerns like
 * authentication or rate limiting.
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

/** The three kinds of per-handler middleware supported by the framework. */
export type MiddlewareTypes = 'guard' | 'pipe' | 'interceptor'

/** The credentials/origins portion of `CorsOptions`. */
export type CorsOrigin = {
  /**
   * Indicates whether cross-origin requests are allowed to include credentials
   * (cookies, authorization headers, TLS client certificates).
   *
   * @default true
   */
  credentials?: boolean

  /**
   * Defines the allowed origins for cross-origin requests.
   *
   * Accepted formats:
   * - An array of strings (exact origin matches)
   * - An array of regular expressions
   * - A function that receives the request origin and returns `true` if allowed
   *
   * @default '*'
   */
  origins?: '*' | (string | RegExp)[] | ((origin: string) => boolean)
}

/**
 * Configuration options for Cross-Origin Resource Sharing (CORS).
 */
export type CorsOptions = CorsOrigin & {
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
  allowedMethods?: Exclude<HttpMethod, 'OPTIONS'>[]
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

export type Middlewares = {
  guards: MiddlewareGuard[]
  pipes: MiddlewarePipe[]
  interceptors: MiddlewareInterceptor[]
}
