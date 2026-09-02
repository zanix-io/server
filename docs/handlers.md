# Handlers

Handlers are the entry point for incoming requests or events. Zanix Server supports four kinds:
**REST controllers**, **GraphQL resolvers**, **WebSocket handlers**, and **SSR controllers**. All of
them follow the same base pattern: extend a base class and decorate it with a class decorator to
register it. REST, GraphQL, and SSR then use method decorators (`@Get`, `@Query`, etc.) to register
one route per method; WebSocket handlers register a single connection route on the class decorator
itself and instead override plain (non-decorated) lifecycle methods to react to it.

> ℹ️ Method decorators (`@Get`, `@Query`, etc.) only take effect when the method's class is also
> decorated with the matching class decorator — `@Controller` for REST, `@Resolver` for GraphQL,
> `@SsrController` for SSR (reusing the exact same `@Get`/`@Post`/etc. method decorators as REST —
> see [SSR](#ssr) for why). WebSocket handlers have no method-level route decorator: `@Socket` alone
> defines the connection's route, and lifecycle methods (`onopen`, `onmessage`, etc.) are plain
> overrides, not decorated. In all four cases, if the class decorator is missing, or the class
> doesn't extend the required base class, the class decorator throws an `InternalError` as soon as
> it runs.

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

### Dynamic route parameters

A `:name` segment matches exactly one path segment (`@Get(':id')` matches `/42`, not `/42/43`) — its
value is read from `ctx.payload.params.name`. Matching is case-insensitive for the route as a whole,
and a `:name` param's own captured value is lowercased, same as the rest of the path.

A trailing `:name*` — the same `:name` syntax with a `*` suffix — matches one or more remaining
segments instead of exactly one, letting a single route serve an arbitrarily nested path:

```ts
@Get('/assets/:path*')
public serve(ctx: HandlerContext) {
  // GET /assets/logo.svg           -> ctx.payload.params.path === 'logo.svg'
  // GET /assets/icons/foo/bar.svg  -> ctx.payload.params.path === 'icons/foo/bar.svg'
}
```

This is a general router capability, not tied to serving files specifically — any route that needs
to capture an arbitrary remaining path (a proxy/passthrough endpoint, a nested resource path) can
use it the same way.

A catch-all is only valid as the **last** segment of a route — `@Get('/:path*/foo')` throws
`InternalError` as soon as the decorator runs (registration time, never the first time a request
happens to reach it), the same fail-fast posture invalid input already gets elsewhere in this
framework.

**Precedence is deterministic and independent of registration order**: an exact/static route always
wins over a `:name` route, which always wins over a `:name*` route, regardless of which one was
registered first. Given all three registered for the same prefix:

```ts
@Get('/files/readme')     // wins for GET /files/readme
@Get('/files/:name')      // wins for GET /files/foo
@Get('/files/:path*')     // wins for GET /files/foo/bar
```

`/files/readme` always resolves to the exact route, `/files/foo` to `:name`, and `/files/foo/bar` to
`:path*` — no matter which of the three was declared first in source.

**A catch-all's own captured value preserves the request's original casing** — the one exception to
"matching and values are case-insensitive" above. `Get('/assets/:path*')` handling a request to
`/assets/Logo.svg` reads `ctx.payload.params.path` as `'Logo.svg'`, not `'logo.svg'`, so a consumer
resolving a case-sensitive resource (a real filename, for instance) gets the exact string the caller
sent. The route itself still matches case-insensitively, same as any other route — only the
catch-all's captured value is case-preserved.

No param value — `:name` or `:name*` alike — is ever automatically URL-decoded; a percent-encoded
segment (`%20`, for instance) reaches the handler exactly as it arrived, still encoded. Decode it
yourself if the value needs it.

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

### Static route metadata

Every registered REST route persists its `httpMethod`, `path`, `application`, and — when declared
via the method decorator's own `Body`/`Params`/`Search` option — the exact RTO class(es) it
validates against, as plain, serializable metadata reachable via
`ProgramModule.routes.getRoutes('rest')`. Captured once, at registration time; the runtime
validation pipeline never reads it back, so nothing here affects request handling — this is purely
for a build-time consumer (an OpenAPI generator, an API-surface report) that needs to introspect
what's registered without invoking anything:

```ts
import { ProgramModule } from 'jsr:@zanix/server@[version]'
import type { RestRouteEntry } from 'jsr:@zanix/server@[version]'

const routes = ProgramModule.routes.getRoutes('rest') as Record<string, RestRouteEntry> | undefined
for (const [key, route] of Object.entries(routes ?? {})) {
  // key is `${application}:${path}/${httpMethod}`
  console.log(route.path, route.httpMethod, route.rto)
}
```

`route.rto` is `undefined` for a route declared with no RTO at all.

### HEAD requests

There's no `@Head` decorator, and none is needed: an HTTP `HEAD` request to any `@Get()` route
(absolute, `:name`, or `:name*` alike) is automatically answered exactly like `GET` would — same
status, same headers (including `Content-Length`) — with the body removed, per RFC 9110 §9.3.2. A
`HEAD` request to a route with no `GET` at all (registered only for `POST`/`PUT`/etc.) still
responds `405 Method Not Allowed`, same as any other method mismatch — the fallback only ever
applies once no exact match exists for the method actually sent.

```ts
@Controller()
class ItemsController extends ZanixController {
  @Get('items')
  public list() {
    return { items: [1, 2, 3] }
  }
}

// GET  /items  -> 200, body: {"items":[1,2,3]}
// HEAD /items  -> 200, same headers (Content-Length included), empty body
```

### `@Controller` options

Besides a plain string prefix, `@Controller` accepts an options object:

| Option            | Description                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`          | Route prefix applied to all endpoints in the controller.                                                                                    |
| `Interactor`      | Interactor class injected and made available as `this.interactor`.                                                                          |
| `enableALS`       | Enables `AsyncLocalStorage`-based context isolation per request (see below).                                                                |
| `versionProtocol` | Negotiates a protocol version on every request/response. On by default — see [Protocol version negotiation](#protocol-version-negotiation). |

Which [Application](./applications.md#applications) a controller's routes belong to is never one of
these options — it's resolved automatically from context, not declared per class (see that guide for
why).

## GraphQL

Extend `ZanixResolver` and decorate the class with `@Resolver`. Decorate its methods with `@Query`
or `@Mutation`, describing the operation's input/output types for the generated schema.

```ts
// `graphql`'s own npm dependency lives only behind this `/graphql` subpath — a REST/Socket/SSR-only
// consumer never pulls it in by depending on `@zanix/server`'s root for base classes/decorators.
import { Mutation, Query, Resolver, ZanixResolver } from 'jsr:@zanix/server@[version]/graphql'
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

`@Resolver` accepts the same `prefix`/`Interactor`/`enableALS`/`versionProtocol` options as
`@Controller` — a resolver registered under a non-default
[Application](./applications.md#applications) has its fields added to a separate schema/root-value
bucket, never merged into the default one.

> ⚠️ Something in your composition must import from `@zanix/server/graphql` before
> `bootstrapServers`/`webServerManager.create('graphql', ...)` runs — decorating at least one
> resolver with `@Resolver`/`@Query`/`@Mutation`/`@Request` already does this. Skipping it entirely
> (a GraphQL server with zero resolvers) throws a clear `InternalError` instead of silently building
> an empty stub schema — this keeps `graphql`'s own npm dependency out of a REST/Socket/SSR-only
> consumer's dependency graph even through `@zanix/server`'s SHARED server-dispatch code.

`@Query`/`@Mutation` are shorthands for the generic `@Request(type)` decorator (exported from
`@zanix/server/graphql`, same as `@Resolver`/`@Query`/`@Mutation`), useful when the operation type
needs to be resolved dynamically:

```ts
import { Request } from 'jsr:@zanix/server@[version]/graphql'

class UsersResolver extends ZanixResolver {
  @Request('Query') // equivalent to @Query()
  public user(payload: { id: string }, ctx: HandlerContext) {
    return { id: payload.id, name: 'John Doe' }
  }
}
```

### Validating requests before execution

`ServerOptions.graphqlValidation` runs every GraphQL request through `graphql-js`'s own `validate()`
— `specifiedRules` plus a query-depth limit — before it ever reaches a resolver; a query that fails
validation gets a `400` with a standard `{ errors: [...] }` body instead of running:

```ts
await bootstrapServers({
  graphql: {
    graphqlValidation: {
      maxDepth: 6, // reject a query whose real selection depth exceeds 6 (default: 10)
      introspection: false, // reject __schema/__type queries outright (default: true)
    },
  },
})
```

`maxDepth` follows a `FragmentSpread` to its target `FragmentDefinition`'s own depth rather than
counting the spread as one level, closing off deep (or, via a reused fragment, exponential) nesting
as a memory/CPU exhaustion vector. `introspection` defaults to `true` since most GraphQL tooling
(GraphiQL, schema-aware clients/codegen) depends on it — disable it only for a genuinely public API
that shouldn't expose its schema shape.

### Reading back the compiled schema

`getSchema(application?)` returns the `GraphQLSchema` this process actually compiled for an
Application — the same object `defineSchema` last built for it, including through a
`WebServerManager.refreshRoutes()` dev-mode rebuild:

```ts
import { getSchema } from 'jsr:@zanix/server@[version]/graphql'
import { printSchema } from 'graphql'

const schema = getSchema('main') // omit the argument for the default Application
if (schema) console.log(printSchema(schema))
```

A pure cache read — it never triggers a compile of its own, so it is safe to call any number of
times, in any order, relative to a real server starting. It returns `undefined` until a GraphQL
server has actually been created for that Application in this process
(`webServerManager.create(
'graphql', ...)`/`bootstrapServers({ graphql: {...} })`), the same
precondition `ProgramModule.routes.getRoutes()` already has.

`defineSchema(application?)` is the compile step `getSchema` reads back — also exported from
`@zanix/server/graphql` for a caller that needs to force a fresh compile instead of just reading
whatever's already cached (the same compile `bootstrapServers({ graphql: {...} })` triggers
internally). Calling it a second time for an Application with no new `@Query`/`@Mutation` registered
in between builds an empty stub schema, since the accumulator it compiles from was already consumed
by the previous call — most consumers want `getSchema`, not this.

`getSchemaApplications()` lists every Application name with at least one `@Query`/`@Mutation`
registered so far in this process, without compiling or reading anything — useful for a caller that
needs to discover which Applications are worth calling `defineSchema`/`getSchema` on without already
knowing their names (`@zanix/cli`'s own `zanix space build` GraphQL check step uses this to find
local schemas to validate against).

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
params, or query), `Interactor`, `enableALS`, and `versionProtocol` (see
[Protocol version negotiation](#protocol-version-negotiation) — negotiated once, at the connection
handshake, not per-message).

> ℹ️ `@Guard`/`@Pipe`/`@Interceptor` only take effect on a `@Socket` class when applied at the
> **class** level, not on an individual lifecycle method — see
> [Middlewares](./middlewares.md#middleware-on-sockets-class-level-only) for why.

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

## SSR

Extend `ZanixSsrController` and decorate the class with `@SsrController`. There is no dedicated
SSR-only method decorator — `@Get`, `@Post`, `@Patch`, `@Put`, `@Delete`, and the generic
`@Request(method, ...)` are the exact same decorators REST uses, reused as-is; the only difference
is which class decorator sits on top: `@SsrController` routes them into the `'ssr'` route table
instead of `'rest'`. RTO-based validation (`Params`/`Body`/`Search`) and dynamic route parameters
(`:name`, and the trailing catch-all `:name*` — see
[Dynamic route parameters](#dynamic-route-parameters)) both work identically to REST, since it's the
same underlying mechanism.

```ts
import { Get, SsrController, ZanixSsrController } from 'jsr:@zanix/server@[version]'
import type { HandlerContext } from 'jsr:@zanix/server@[version]'

@SsrController('products')
class ProductPage extends ZanixSsrController {
  @Get(':id')
  public serve(ctx: HandlerContext) {
    return new Response(`<h1>Product ${ctx.payload.params.id}</h1>`, {
      headers: { 'content-type': 'text/html' },
    })
  }
}
```

`@SsrController` accepts the same options as `@Controller` — `prefix`, `Interactor`, `enableALS`,
`versionProtocol` — nothing SSR-specific is added or dropped at the decorator level.

Two differences from REST worth knowing before bootstrapping one:

- **No default `globalPrefix`.** An unanchored `'rest'` server defaults every route under
  `/api/...`; an unanchored `'ssr'` server has none — routes resolve at their bare declared path
  (`/products/1`, never `/api/products/1`). A page's URL is its own address, not an API endpoint
  under a namespace.
- **`cors.allowedMethods` is fixed at `['GET', 'POST']`**, not user-configurable like REST's — a
  page's own `GET` (render) and `POST` (form action) are both real, first-class routes by default.

Bootstrap it exactly like any other type — standalone, with no Zanix App involved at all:

```ts
import { bootstrapServers } from 'jsr:@zanix/server@[version]'

await bootstrapServers({ ssr: { port: 3000 } })
```

This is the right choice for a plain project that wants one or a few hand-written SSR pages without
adopting a full app-composition layer — the class attributes to the default (`'main'`) Application
automatically, same as any REST controller with no active `ProgramModule.defineApplication` scope
(see [Applications](./applications.md#applications)). A larger, composed frontend (routing,
hydration, PWA — `@zanix/space`) instead registers its own `'ssr'` server as a **named app** via
`@zanix/core`'s `apps` option (`apps.<name>.server.ssr`) — same handler type and same options
underneath, just mounted through the Application-composition layer instead of directly. See
`@zanix/core`'s own README for that shape and for when to prefer one over the other.

### Hot-reloading a decorated route

Every route decorator (`@Controller`, `@SsrController`, `@Resolver`, `@Socket`) registers its class
exactly once — re-running the same decorator against the same class collides ("Route path ... is
already defined"). That's the correct behavior for ordinary composition, but it gets in the way of
tooling that reimports a decorated module outside the normal boot cycle — a dev-server that
re-evaluates a page file after a change, for instance, produces a fresh class object whose
`@SsrController`/`@Get` decorators fire again for what is conceptually the same route.

`ProgramModule.unregisterRoutes(Target, type?)` removes every route entry registered for a specific
class reference — the OLD one, before reimporting — so the fresh reimport can register cleanly:

```ts
import { ProgramModule } from 'jsr:@zanix/server@[version]'

const previous = await import(pageFilePath)
ProgramModule.unregisterRoutes(previous.default) // deregister the old class first
const fresh = await import(`${pageFilePath}?t=${Date.now()}`) // re-runs its decorators cleanly
```

This is not part of ordinary application composition — a route decorator already registers its class
correctly the first time. It's a framework-internal/tooling escape hatch for lazy re-registration
flows only.

Reimporting only updates route metadata, though — it has no effect on an already-serving handler.
`create()` compiles a server's route table exactly once, at activation time; a route registered
afterward (this reimport flow, or an entirely new page file the dev server just discovered) needs
`webServerManager.refreshRoutes(id)` to actually become reachable. It recompiles that server's route
table from the current registry and swaps it in atomically — an in-flight request still sees either
the fully-old or fully-new table, never a partial one — without rebinding the real `Deno.serve()`
listener, so requests for routes that didn't change never see any downtime. It's a no-op for a
server created with a fully custom `handler` (nothing framework-owned to recompile) or for an id
that's unknown/already `unmount()`-ed:

```ts
import { ProgramModule, webServerManager } from 'jsr:@zanix/server@[version]'

const previous = await import(pageFilePath)
ProgramModule.unregisterRoutes(previous.default)
await import(`${pageFilePath}?t=${Date.now()}`) // re-runs its decorators cleanly
webServerManager.refreshRoutes(serverId) // make the already-serving handler see the fresh route
```

`ProgramModule.routes.hasRoutesForTarget(Target, type?)` is a read-only companion for this same
flow: a plain existence check a dev-server's own "did I already register this class" bookkeeping can
use to tell a still-correct registration apart from one removed by something else since (an
unrelated hot-uninstall via `unregisterApplicationRoutes`, below, for instance).

### Hot-uninstalling an Application

`unregisterRoutes` above works per decorated class — the right granularity for reloading one page or
controller. Uninstalling a whole Application at runtime (e.g. an `@zanix/app` package being
hot-removed from a running process) needs two coarser-grained operations instead, since neither one
alone is a full teardown:

- **`ProgramModule.unregisterApplicationRoutes(application)`** removes every route registered under
  `application`, across every server type, in one call — metadata only. Narrower than the
  pre-existing `resetExceptApplications` (which needs the caller to enumerate every OTHER
  Application to `preserve`, silently wiping anything it forgets): this only ever touches
  `application`'s own entries, so a caller that only knows the ONE app it's removing can call it
  safely.
- **`WebServerManager.unmount(id)`** hot-unmounts one already-`create()`d server's own dispatch
  entry from its port's live handler table, via the same atomic freeze-and-swap `create()` itself
  uses (an in-flight request still sees either the fully-old or fully-new table, never a partial
  one). Unlike `stop()`, it never touches the real `Deno.serve()` listener — a port shared with
  OTHER still-registered servers keeps accepting connections for them unaffected; requests that used
  to reach `id`'s own routes fall through to the port's own catch-all or a plain `NOT_FOUND`.

```ts
import { ProgramModule, webServerManager } from 'jsr:@zanix/server@[version]'

ProgramModule.unregisterApplicationRoutes('admin') // drop the metadata for every 'admin' route
webServerManager.unmount(adminServerId) // stop serving them on the already-bound listener
```

Use both together for a full hot-uninstall: `unregisterApplicationRoutes` alone still leaves the
live dispatch entry serving stale routes on an already-bound listener, and `unmount` alone leaves
the route metadata behind for the next `bootstrapServers()` call to trip over. Known limitation:
even when `id` was the last server on a shared port, `unmount` never closes the real socket (would
require re-attributing which OTHER server actually bound it) — use `stop()` on the port's original
owner for a full teardown of the listener itself.

### Intercepting requests before dispatch (`preHandler`)

`bootstrapServers`'s per-type options (and `WebServerManager.create`'s own `options`) accept an
optional `preHandler`, tried on every request _before_ that server's normal dispatch (its route
table, or a fully custom `handler`). Returning `null`/`undefined` falls through to normal dispatch
unchanged; returning a `Response` short-circuits it — normal dispatch never runs for that request.

This exists for concerns that must intercept requests ahead of route matching, on the exact same
port/origin as the server's own routes, without replacing the whole dispatcher the way `handler`
does. The reference use case is a dev-server layered on top of an SSR server: browser requests for
build-tool assets (`/@vite/*`, transformed `.css`/component files) must be served before a page
route is ever considered, on the same origin the page itself renders from — something no combination
of `guards`/`pipes` can do, since those only run once a route has already matched.

```ts
import { bootstrapServers } from 'jsr:@zanix/server@[version]'

await bootstrapServers({
  ssr: {
    port: 3000,
    preHandler: async (req) => {
      const url = new URL(req.url)
      if (url.pathname.startsWith('/@vite/')) {
        return await serveDevAsset(url.pathname)
      }
      return null // not a dev asset — fall through to the normal SSR route table
    },
  },
})
```

## Protocol version negotiation

`versionProtocol` (available on `@Controller`, `@Resolver`, and `@Socket`) turns on request/response
protocol-version negotiation for every route the class defines: it rejects an incoming request that
declares a version the class doesn't recognize, and stamps whichever version was actually negotiated
onto every response. **On by default** — omitting the option (or passing `true`) enables it with
sensible defaults; pass `false` to disable it entirely.

```ts
import { Controller, Get, ZanixController } from 'jsr:@zanix/server@[version]'

@Controller('users') // versionProtocol defaults to on
class UsersController extends ZanixController {
  @Get()
  public list() {
    return []
  }
}
```

Every response from `UsersController` now carries `X-Znx-Protocol-Version: 1` (the defaults —
`PROTOCOL_VERSION_HEADER` and `DEFAULT_PROTOCOL_VERSION`). A caller that declares a version this
class doesn't recognize on that same header gets a `400 Bad Request` instead of a response shaped
for a version it may not understand; a caller that declares nothing (every caller before this class
adopts a new version) is treated as the current version and never breaks.

Override the header name, current version, or which older versions are still accepted:

```ts
@Controller({
  prefix: 'users',
  versionProtocol: {
    header: 'X-Users-Protocol', // defaults to PROTOCOL_VERSION_HEADER
    version: 2, // defaults to DEFAULT_PROTOCOL_VERSION
    supportedVersions: [1, 2], // defaults to [version] — grow this before bumping `version`
  },
})
class UsersController extends ZanixController {
  // ...
}
```

Rolling out a new version safely is an expand-before-contract discipline: add the new version to
`supportedVersions` _before_ any client starts declaring it, bump `version` once clients have had
time to adopt it, and only drop an old entry from `supportedVersions` once nothing depends on it
anymore. `@zanix/admin` uses this exact option internally (with its own already-shipped
`X-Znx-Admin-Protocol` header) instead of a hand-rolled guard/interceptor pair — see its own docs
for that rollout discipline applied in practice.

Disable it on a class that doesn't want this at all:

```ts
@Controller({ prefix: 'webhooks', versionProtocol: false })
class WebhooksController extends ZanixController {
  // ...
}
```

On a `@Socket` class, negotiation happens exactly once, at the connection handshake — a WebSocket
upgrade is a real HTTP request/response under the hood, so the guard can reject the upgrade before
it's accepted, and the interceptor can stamp the version onto that one handshake response. There is
no per-message header concept once the socket is open, so this is a one-time, connection-level
negotiation, never a per-message one.

## `enableALS`

By default, singleton handler instances share state across concurrent requests. Setting
`enableALS: true` on the class decorator enables `AsyncLocalStorage`-based context isolation, so
each request gets its own isolated context even on a singleton instance. This adds a small amount of
overhead per request — enable it only when the handler actually needs per-request isolation.

## See also

- [Applications](./applications.md) — how a handler's Application is resolved, anchored servers,
  shared ports, boot sessions, and Discovery.
- [Middlewares](./middlewares.md) — guards, pipes, and interceptors that run around these handlers.
- [Dependency Injection](./dependency-injection.md) — how `Interactor` injection and lifecycle work.
- [Utilities → Application server-id helpers](./utilities.md#application-server-id-helpers) — the
  shared stable-id plumbing behind the `'admin'`-Application server pattern.
