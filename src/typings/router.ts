import type { HandlerContext } from './context.ts'
import type { MiddlewareGuard, MiddlewareInterceptor, MiddlewarePipe } from './middlewares.ts'
import type { MetadataTargetSymbols } from './program.ts'
import type { WebServerTypes } from './server.ts'

export type HandlerResponse = Record<string, unknown> | Response | string

/**
 * Represents the allowed HTTP request methods.
 *
 * This type restricts the HTTP methods to commonly used verbs in RESTful APIs.
 *
 * Allowed values:
 * - `'GET'` — Retrieve data from the server.
 * - `'POST'` — Send data to the server to create a resource.
 * - `'PUT'` — Update a resource by replacing it entirely.
 * - `'DELETE'` — Remove a resource from the server.
 * - `'PATCH'` — Partially update a resource.
 * - `'OPTIONS'` — Describe the communication options for the target resource.
 * - `'HEAD'` — Same as GET but only retrieves the headers.
 */
export type HttpMethods = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

export type HandlerFunction = (
  ctx: HandlerContext,
  // deno-lint-ignore no-explicit-any
  args?: any,
) => Promise<HandlerResponse> | HandlerResponse

export type RouteDefinition = {
  handler:
    | HandlerFunction
    | Required<Omit<MetadataTargetSymbols, 'type'>> & { type?: MetadataTargetSymbols['type'] }
  enableALS?: boolean
  methods?: HttpMethods[]
  guards?: MiddlewareGuard[]
  pipes?: MiddlewarePipe[]
  interceptors?: MiddlewareInterceptor[]
}

export type ProcessedRouteDefinition =
  & {
    /**
     * The regular expression used to match or filter routes
     */
    regex: RegExp
    /**
     * An array of strings representing the route parameters.
     */
    params: string[]
    /**
     * A function that processes or handles route logic.
     */
    handler: HandlerFunction
  }
  & Omit<Required<RouteDefinition>, 'handler'>

export type ProcessedRoutes = Record<string, ProcessedRouteDefinition>

export type RoutesObject = Partial<
  Record<WebServerTypes, Record<string, Required<Omit<RouteDefinition, 'enableALS'>>>>
>

export type RouteDefinitionProps = RouteDefinition & { path?: string }
