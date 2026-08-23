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
[Handlers](./handlers.md#request-validation-rtos)). It's applied automatically whenever a method
decorator (`@Get`, `@Post`, etc.) receives an RTO argument — you rarely need to use it directly.

## Middleware on sockets: class-level only

`@Guard`, `@Pipe`, and `@Interceptor` register per **route**. REST controllers and GraphQL resolvers
have one route per decorated method, so applying one of these to a specific method scopes it to that
method. A [`@Socket`](./handlers.md#websocket)-decorated class has exactly one route — the
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

### CORS

Configured via `ServerOptions.cors`, passed per server type to `bootstrapServers`/
`webServerManager.create()`. The accepted shape narrows by server type:

| Server type | Accepted `cors` shape                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rest`      | Full `CorsOptions` (`origins`, `credentials`, `allowedHeaders`, `allowedMethods`, `exposedHeaders`, `preflight`).                                                                          |
| `graphql`   | `CorsOptions`, with `allowedMethods` narrowed to `'GET' \| 'POST'`.                                                                                                                        |
| `ssr`       | `CorsOptions` without `allowedMethods` — an SSR server's `GET`/`POST` page routes aren't configurable through `cors`.                                                                      |
| `socket`    | Only `{ origins }` — no `allowedHeaders`/`allowedMethods`/`exposedHeaders`/`preflight`: a WebSocket upgrade carries no CORS response headers, so `origins` is the only thing that applies. |

Defaults (identical logic across every server type, applied per-property when omitted):

- `credentials: true`
- `origins: '*'`
- `allowedHeaders: ['Content-Type']`
- `allowedMethods`: `['GET', 'POST', 'PUT', 'PATCH', 'DELETE']` for `rest`, `['GET', 'POST']` for
  `graphql`/`ssr`, `['GET']` for `socket`.
- `exposedHeaders: ['Content-Length', 'X-Kuma-Revision']`
- `preflight`: unset — the browser decides its own cache duration for `OPTIONS` requests.

```ts
await bootstrapServers({
  rest: {
    cors: {
      origins: ['https://app.example.com'],
      allowedMethods: ['GET', 'POST'],
      preflight: { maxAge: 3600, optionsSuccessStatus: 204 },
    },
  },
})
```

`credentials: true` (the default) only grants `Access-Control-Allow-Credentials` when `origins` is
explicitly set to something other than `'*'` — leaving `origins` at its default responds as a
non-credentialed `Access-Control-Allow-Origin: *` policy instead of reflecting the caller's
`Origin`. For `type: 'socket'` specifically, an `origins: '*'` default means same-origin only, not
any origin, since a WebSocket upgrade has no CORS response headers of its own to fall back on —
configure `origins` explicitly to allow a cross-origin WebSocket connection. See the
[CHANGELOG](../CHANGELOG.md) for the security fixes behind both of these defaults.

### Cookie filtering

Before any other guard or handler runs, a built-in `cookiesGuard` parses the incoming request's
cookies and keeps only the ones whose name starts with the `X-Znx-` prefix — everything else is
dropped silently, with no error or warning. `ctx.cookies` only ever contains framework-scoped
cookies as a result; there's no way to read a non-`X-Znx-` cookie from `ctx.cookies` in a guard,
pipe, interceptor, or handler.

**Practical implication:** if your application or a consumer package sets a custom cookie, its name
must start with `X-Znx-` or it will never be visible server-side via `ctx.cookies`, even though the
browser still sends it on every request.

A cookie (or header) that carries a secret needs registering with `@zanix/utils`'s
`SENSITIVE_KEY_PATTERN`/`redact.extend` so it gets redacted from logs — see that package's own docs
for the mechanism; it isn't part of `@zanix/server`.

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

- [Handlers](./handlers.md) — how RTOs and `@RequestValidation` fit into a controller/resolver.
- [Error Handling](./errors.md) — how thrown errors are logged and serialized into responses.
