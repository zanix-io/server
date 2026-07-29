# Handlers

Handlers are the entry point for incoming requests or events. Zanix Server supports three kinds:
**REST controllers**, **GraphQL resolvers**, and **WebSocket handlers**. All of them follow the same
base pattern: extend a base class and decorate it with a class decorator to register it. REST and
GraphQL then use method decorators (`@Get`, `@Query`, etc.) to register one route per method;
WebSocket handlers register a single connection route on the class decorator itself and instead
override plain (non-decorated) lifecycle methods to react to it.

> ℹ️ Method decorators (`@Get`, `@Query`, etc.) only take effect when the method's class is also
> decorated with the matching class decorator — `@Controller` for REST, `@Resolver` for GraphQL.
> WebSocket handlers have no method-level route decorator: `@Socket` alone defines the connection's
> route, and lifecycle methods (`onopen`, `onmessage`, etc.) are plain overrides, not decorated. In
> all three cases, if the class decorator is missing, or the class doesn't extend the required base
> class, the class decorator throws an `InternalError` as soon as it runs.

## REST

Extend `ZanixController` and decorate the class with `@Controller`. Decorate its methods with
`@Get`, `@Post`, `@Patch`, `@Put`, `@Delete`, or the generic `@Request(method, ...)`.

```ts
import { BaseRTO, IsString } from '@zanix/validator'
import { Controller, Get, ZanixController } from 'jsr:@zanix/server@[version]'
import type { HandlerContext } from 'jsr:@zanix/server@[version]'

class UserParams extends BaseRTO {
  @IsString()
  accessor id!: string
}

@Controller('users')
class UsersController extends ZanixController {
  @Get(':id', { Params: UserParams })
  public getUser(ctx: HandlerContext<{ params: UserParams }>) {
    return { id: ctx.payload.params.id }
  }
}
```

### Request validation (RTOs)

Any method decorator accepts a Request Transfer Object (RTO) definition — a set of classes extending
`BaseRTO` (from `@zanix/validator`) that describe and validate `Body`, `Params`, and/or `Search`
(query string). Validation runs before the handler executes; invalid input short-circuits the
request with a `BAD_REQUEST` response.

- `@Get`/`@Delete` accept `Params` and `Search` (no `Body`, since these methods carry no request
  body).
- `@Post`/`@Patch`/`@Put`/`@Request` accept `Body`, `Params`, and `Search`.

If the path is omitted, the method name is used as the route (e.g. `@Get()` on a method named
`listUsers` registers `GET /listUsers`). The RTO object can be passed as the sole argument in that
case — `@Post({ Body: LogoutRTO })` registers on `POST /logout` for a method named `logout`.

### `@Controller` options

Besides a plain string prefix, `@Controller` accepts an options object:

| Option       | Description                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`     | Route prefix applied to all endpoints in the controller.                                                                                     |
| `Interactor` | Interactor class injected and made available as `this.interactor`.                                                                           |
| `enableALS`  | Enables `AsyncLocalStorage`-based context isolation per request (see below).                                                                 |
| `isInternal` | Marks every route in this controller as internal-only. Defaults to `false` (public) — see [Internal-only handlers](#internal-only-handlers). |

## GraphQL

Extend `ZanixResolver` and decorate the class with `@Resolver`. Decorate its methods with `@Query`
or `@Mutation`, describing the operation's input/output types for the generated schema.

```ts
import { Mutation, Query, Resolver, ZanixResolver } from 'jsr:@zanix/server@[version]'
import type { HandlerContext } from 'jsr:@zanix/server@[version]'

@Resolver('users')
class UsersResolver extends ZanixResolver {
  @Query({ input: { id: 'ID' }, output: 'User' })
  public user(payload: { id: string }, ctx: HandlerContext) {
    return { id: payload.id, name: 'John Doe' }
  }

  @Mutation({ input: { name: 'String' }, output: 'User' })
  public createUser(payload: { name: string }, ctx: HandlerContext) {
    return { id: '1', name: payload.name }
  }
}
```

`@Resolver` accepts the same `prefix`/`Interactor`/`enableALS`/`isInternal` options as `@Controller`
— an internal-only resolver's fields are added to a separate schema/root-value bucket, never merged
into the public schema (see [Internal-only handlers](#internal-only-handlers)).

`@Query`/`@Mutation` are shorthands for the generic `@GQLRequest(type)` decorator, useful when the
operation type needs to be resolved dynamically:

```ts
import { GQLRequest } from 'jsr:@zanix/server@[version]'

class UsersResolver extends ZanixResolver {
  @GQLRequest('Query') // equivalent to @Query()
  public user(payload: { id: string }, ctx: HandlerContext) {
    return { id: payload.id, name: 'John Doe' }
  }
}
```

## WebSocket

Extend `ZanixWebSocket` and decorate the class with `@Socket`. Override the protected lifecycle
methods (`onopen`, `onmessage`, `onclose`, `onerror`) to react to connection events; returning a
value from `onmessage` sends it back to the client as JSON.

```ts
import { Socket, ZanixWebSocket } from 'jsr:@zanix/server@[version]'

@Socket('chat')
class ChatSocket extends ZanixWebSocket {
  protected override onmessage(ev: MessageEvent) {
    return { echo: ev.data }
  }
}
```

`@Socket` also accepts an options object with `route`, `rto` (validating the incoming message body,
params, or query), `Interactor`, `enableALS`, and `isInternal` (see
[Internal-only handlers](#internal-only-handlers)).

> ℹ️ `@Guard`/`@Pipe`/`@Interceptor` only take effect on a `@Socket` class when applied at the
> **class** level, not on an individual lifecycle method — see
> [Middlewares](./MIDDLEWARES.md#middleware-on-sockets-class-level-only) for why.

### Tracking connections and pushing messages proactively

Returning a value from `onmessage` replies to that same incoming message. To push data outside of
that cycle — e.g. from a background job or another request, when something elsewhere in the app
needs to notify an already-connected client — use `this.socket` (the raw `WebSocket`) to send, and
`this.registry` (a general-purpose key-value store, also available on providers/interactors) to find
the right connection later:

```ts
import { Socket, ZanixWebSocket } from 'jsr:@zanix/server@[version]'

@Socket('overview')
class OverviewSocket extends ZanixWebSocket {
  get #connectionId() {
    return this.context.session?.id
  }

  protected override onopen() {
    if (this.#connectionId) this.registry.set(this.#connectionId, this)
  }

  protected override onclose() {
    if (this.#connectionId) this.registry.delete(this.#connectionId)
  }

  public push(data: object) {
    this.socket.send(JSON.stringify(data))
  }
}

// elsewhere — an interactor, a job, another handler:
const socket = this.registry.get<OverviewSocket>(userId)
socket?.push({ event: 'balance-updated' })
```

## Internal-only handlers

`isInternal` (available on `@Controller`, `@Resolver`, and `@Socket`) marks every route/resolver
field/socket route the class defines as internal-only. It works together with `bootstrapServers`'s
own per-type `isInternal` option (`BootstrapServerOptions[type].isInternal` — see
[Getting Started](./GETTING-STARTED.md)): a server bootstrapped with `isInternal: true` for a given
type mounts **only** the `isInternal: true` routes/resolvers/sockets of that type, and a server
bootstrapped without it (the default) mounts only the `isInternal: false` (public) ones. A route
never leaks between the two — this is the same mechanism that gives an `isInternal: true` server its
own random UUID URL prefix, now also scoping _which_ routes it serves, not just isolating its
address.

```ts
import { AuthTokenValidation } from '@zanix/auth'
import { Controller, Get, ZanixController } from 'jsr:@zanix/server@[version]'

@Controller({ prefix: 'admin/health', isInternal: true })
class AdminHealthController extends ZanixController {
  @Get()
  @AuthTokenValidation({ permissions: ['admin'] })
  public check() {
    return { status: 'ok' }
  }
}
```

```ts
import { ADMIN_REST_PORT, bootstrapServers } from 'jsr:@zanix/server@[version]'

// Public server — never sees `admin/health`.
await bootstrapServers({ rest: { globalPrefix: '/api' } })

// A second, internal-only server — only sees `isInternal: true` routes.
// ADMIN_REST_PORT is one of the reserved ports for this purpose (see Configuration).
await bootstrapServers({ rest: { port: ADMIN_REST_PORT, isInternal: true } })
```

Defaults to `false` (public) everywhere it appears, so existing handlers are unaffected unless opted
in explicitly. See [Configuration](./CONFIGURATION.md#constants) for the reserved `ADMIN_*_PORT`
constants meant to back this pattern.

By default an `isInternal: true` server's URL prefix is a random UUID, regenerated on every restart
— safe by default (nothing to leak, rotates on its own), but unusable if an external caller needs a
stable address to reach it at. Pass an explicit `id` to pin it instead:

```ts
import { bootstrapServers, getServiceId } from 'jsr:@zanix/server@[version]'

await bootstrapServers({ rest: { isInternal: true, id: `${getServiceId()}-rest` } })
```

`id` is forwarded to `WebServerManager.create`'s `serverID` parameter and, for an `isInternal`
server, validated at runtime against `[a-z0-9_-]+` (it doubles as the URL path prefix routes are
dispatched under) — see [Utilities → Identity helpers](./UTILITIES.md#identity-helpers) for
`getServiceId()`/`sanitizeIdentifier()`.

### Sharing a port with the public server

An `isInternal: true` server no longer needs a port of its own: if it resolves to the same port as
another server of the **same** `type` (public or `isInternal`), both now share one real
`Deno.serve()` listener instead of failing with `AddrInUse`. `isInternal` stays purely a
routing/authorization boundary — routes are still dispatched separately (the internal server by its
own random UUID prefix, the public one by its `globalPrefix`), so a route never leaks between them
even while the port is shared:

```ts
import { bootstrapServers } from 'jsr:@zanix/server@[version]'

// Public server on port 8000.
await bootstrapServers({ rest: { port: 8000 } })

// Internal server sharing the SAME port — no longer throws AddrInUse.
await bootstrapServers({ rest: { port: 8000, isInternal: true } })
```

This is an implementation-level relaxation, not a recommendation to actually do this in practice —
the `ADMIN_*_PORT` constants remain the default and recommended way to isolate an internal server at
the network level too. Whichever server's `bootstrapServers`/`create` call binds the port first owns
the real socket: its own `server` options (SSL, hostname, etc.) are what actually apply, and a later
server sharing that port only reuses the bound address for its own route table. Stopping that later
server is then a no-op — stop the server that originally bound the port to actually release it. See
`WebServerManager.create()`'s own JSDoc for the full trade-off list, including a narrow startup
window where a request for a not-yet-registered route on a shared port gets a `404` instead of
reaching its handler.

## `enableALS`

By default, singleton handler instances share state across concurrent requests. Setting
`enableALS: true` on the class decorator enables `AsyncLocalStorage`-based context isolation, so
each request gets its own isolated context even on a singleton instance. This adds a small amount of
overhead per request — enable it only when the handler actually needs per-request isolation.

## See also

- [Middlewares](./MIDDLEWARES.md) — guards, pipes, and interceptors that run around these handlers.
- [Dependency Injection](./DEPENDENCY-INJECTION.md) — how `Interactor` injection and lifecycle work.
