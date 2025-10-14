import type { HandlerContext } from './context.ts'
import type { MiddlewareInterceptor, MiddlewarePipe } from './middlewares.ts'
import type { MetadataProps } from './program.ts'
import type { WebServerTypes } from './server.ts'

export type HandlerResponse = Record<string, unknown> | Response | string

export type HttpMethods = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

export type HandlerFunction = (
  ctx: HandlerContext,
) => Promise<HandlerResponse> | HandlerResponse

export type RouteDefinition = {
  handler: HandlerFunction | Required<MetadataProps>
  methods?: HttpMethods[]
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
    /**
     * A function that executes the first process, such as setting a context
     */
    start: (ctx: HandlerContext) => void
    /**
     * A function that executes a final process, such as cleaning up or deleting scoped instances.
     */
    end: (ctx: HandlerContext) => void
  }
  & Omit<Required<RouteDefinition>, 'handler'>

export type ProcessedRoutes = Record<string, ProcessedRouteDefinition>

export type RoutesObject = Partial<
  Record<WebServerTypes, Record<string, Required<RouteDefinition>>>
>

export type RouteDefinitionProps = RouteDefinition & { path?: string }
