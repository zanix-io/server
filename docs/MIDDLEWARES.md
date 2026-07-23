# Middlewares

Zanix Server supports three kinds of per-handler middleware — **Guards**, **Pipes**, and
**Interceptors** — plus a special **Pipe** for request validation (`@RequestValidation`). All of
them can be applied per-handler (as method decorators) or globally (registered once for one or more
server types).

## Execution order

For a single request, middlewares run in this order:

```
Guard  →  Pipe(s)  →  Handler  →  Interceptor(s)
```

1. **Guards** run first and decide whether the request is allowed to proceed. A guard can return a
   fully custom `Response` (with its own headers or status code, e.g. `401 Unauthorized` or
   `429 Too Many Requests`), which terminates the request before it reaches any pipe, the handler,
   or any interceptor. A guard can also prepare headers without terminating the request — those
   headers are applied to the `Response` right after the handler produces it, **before** any
   interceptor runs.
2. **Pipes** run next, for input validation, sanitization, or data transformation. Pipes don't
   return a `Response` directly, but they can throw HTTP exceptions (e.g.
   `throw new HttpError('FORBIDDEN')`), which are caught and turned into a proper error response.
3. The **handler** (controller method, resolver method, or socket event) executes.
4. **Interceptors** run last, wrapping or transforming the `Response` the handler produced — useful
   for logging, adding headers, or unifying the response format.

Guards receive a richer context than Pipes and Interceptors: in addition to the plain request
context, a guard's context also exposes `interactors`, `providers`, and `connectors` — since a guard
may need to check external state (e.g. a rate-limit store) before allowing the request through.

## Per-handler middlewares

Apply these directly on a handler method, stacking as many as needed:

```ts
import { Guard, Interceptor, Pipe } from 'jsr:@zanix/server@[version]'

class UsersController extends ZanixController {
  @Get(':id')
  @Guard(validateApiKey)
  @Pipe(normalizeQueryParams)
  @Interceptor(addCacheHeaders)
  public getUser(ctx: HandlerContext) {
    // ...
  }
}
```

### `@RequestValidation`

A specialized `Pipe` that validates the request against a set of RTOs (see
[Handlers](./HANDLERS.md#request-validation-rtos)). It's applied automatically whenever a method
decorator (`@Get`, `@Post`, etc.) receives an RTO argument — you rarely need to use it directly.

## Middleware on sockets: class-level only

`@Guard`, `@Pipe`, and `@Interceptor` register per **route**. REST controllers and GraphQL resolvers
have one route per decorated method, so applying one of these to a specific method scopes it to that
method. A [`@Socket`](./HANDLERS.md#websocket)-decorated class has exactly one route — the
connection/upgrade itself — regardless of how many lifecycle methods (`onopen`, `onmessage`,
`onclose`, `onerror`) it overrides. Applying `@Guard`/`@Pipe`/`@Interceptor` at the **class** level
works as expected and covers every connection to that socket; applying one directly to a lifecycle
method has no effect, since there's no per-method route for it to attach to.

```ts
@Socket('chat')
@Guard(validateApiKey) // runs once per connection, before `onopen`
class ChatSocket extends ZanixWebSocket {
  // ...
}
```

## Global middlewares

Register a middleware once, for all handlers of one or more server types, using
`registerGlobalGuard`, `registerGlobalPipe`, or `registerGlobalInterceptor`. By default a global
middleware applies to every server type; scope it with the optional `exports.server` field.

```ts
import { registerGlobalGuard } from 'jsr:@zanix/server@[version]'
import type { MiddlewareGlobalGuard } from 'jsr:@zanix/server@[version]'

const rateLimitGuard: MiddlewareGlobalGuard = async (ctx) => {
  // ctx also exposes interactors, providers, and connectors
  if (isRateLimited(ctx.req)) {
    return { response: new Response('Too many requests', { status: 429 }) }
  }
}

// Applies only to REST servers; omit `exports` to apply to all server types.
rateLimitGuard.exports = { server: ['rest'] }

registerGlobalGuard(rateLimitGuard)
```

## Built-in defaults

The framework registers a small set of default middlewares out of the box, including CORS handling
and cookie parsing (splitting user-facing cookies from internal framework cookies). These run
alongside any guards, pipes, and interceptors you register.

## Advanced: building your own middleware decorator

> ℹ️ In practice, most applications don't reach for `@Guard`/`@Pipe`/`@Interceptor` directly for
> anything beyond simple cases — application- or organization-level concerns like authentication and
> rate limiting are usually built once as their own decorator (e.g. an internal `AuthGuard` or
> `RateLimitGuard`) on top of `defineMiddlewareDecorator`, then reused across every controller. The
> pattern below is exactly how those are built.

`@Guard`, `@Pipe`, and `@Interceptor` are all thin wrappers around `defineMiddlewareDecorator`,
which you can use directly to build your own middleware decorator with the same registration
semantics (works on both methods and, for guards, whole classes):

```ts
import { defineMiddlewareDecorator } from 'jsr:@zanix/server@[version]'

export function Logged() {
  return defineMiddlewareDecorator('interceptor', (ctx, response) => {
    console.log(`${ctx.req.method} ${ctx.url.pathname} -> ${response.status}`)
    return response
  })
}
```

## See also

- [Handlers](./HANDLERS.md) — how RTOs and `@RequestValidation` fit into a controller/resolver.
- [Error Handling](./ERRORS.md) — how thrown errors are logged and serialized into responses.
