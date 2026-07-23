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

| Option       | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `prefix`     | Route prefix applied to all endpoints in the controller.                     |
| `Interactor` | Interactor class injected and made available as `this.interactor`.           |
| `enableALS`  | Enables `AsyncLocalStorage`-based context isolation per request (see below). |

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

`@Resolver` accepts the same `prefix`/`Interactor`/`enableALS` options as `@Controller`.

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
params, or query), `Interactor`, and `enableALS`.

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

## `enableALS`

By default, singleton handler instances share state across concurrent requests. Setting
`enableALS: true` on the class decorator enables `AsyncLocalStorage`-based context isolation, so
each request gets its own isolated context even on a singleton instance. This adds a small amount of
overhead per request — enable it only when the handler actually needs per-request isolation.

## See also

- [Middlewares](./MIDDLEWARES.md) — guards, pipes, and interceptors that run around these handlers.
- [Dependency Injection](./DEPENDENCY-INJECTION.md) — how `Interactor` injection and lifecycle work.
