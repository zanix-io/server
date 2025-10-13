type HandlerResponse = Record<string, unknown> | Response | string

type HttpMethods = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

type HandlerFunction = (
  ctx: HandlerContext,
) => Promise<HandlerResponse> | HandlerResponse

type RouteDefinition = {
  handler: HandlerFunction | Required<MetadataProps>
  methods?: HttpMethods[]
  pipes?: MiddlewarePipe[]
  interceptors?: MiddlewareInterceptor[]
}

type ProcessedRouteDefinition =
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

type ProcessedRoutes = Record<string, ProcessedRouteDefinition>

type RoutesObject = Partial<
  Record<WebServerTypes, Record<string, Required<RouteDefinition>>>
>

type RouteDefinitionProps = RouteDefinition & { path?: string }
