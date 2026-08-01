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

| Option            | Description                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`          | Route prefix applied to all endpoints in the controller.                                                                                    |
| `Interactor`      | Interactor class injected and made available as `this.interactor`.                                                                          |
| `enableALS`       | Enables `AsyncLocalStorage`-based context isolation per request (see below).                                                                |
| `versionProtocol` | Negotiates a protocol version on every request/response. On by default — see [Protocol version negotiation](#protocol-version-negotiation). |

Which [Application](#applications) a controller's routes belong to is never one of these options —
it's resolved automatically from context, not declared per class (see that section for why).

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

`@Resolver` accepts the same `prefix`/`Interactor`/`enableALS`/`versionProtocol` options as
`@Controller` — a resolver registered under a non-default [Application](#applications) has its
fields added to a separate schema/root-value bucket, never merged into the default one.

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
params, or query), `Interactor`, `enableALS`, and `versionProtocol` (see
[Protocol version negotiation](#protocol-version-negotiation) — negotiated once, at the connection
handshake, not per-message).

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

## Applications

Every route/resolver/socket belongs to exactly one **Application**. An Application is never declared
on a decorator (no `@Controller`/`@Resolver`/`@Socket` option controls it) — it's resolved
automatically from context, the moment the class is registered: whichever
`ProgramModule.defineApplication(name, setup)` scope is currently running (see `@zanix/server`'s own
JSDoc for that method), or the **default Application** (`'main'`) when none is active. Ordinary app
code — the overwhelming common case — never needs to know this exists: every handler you write lands
in `'main'` automatically.

`bootstrapServers`'s own per-type `application` option (`BootstrapServerOptions[type].application` —
see [Getting Started](./GETTING-STARTED.md)) decides which Application a given server mounts: a
server bootstrapped with `application: 'admin'` mounts **only** routes/resolvers/sockets registered
under `'admin'`, and a server bootstrapped without it (the default) mounts only the default
Application's ones. A route never leaks between two Applications.

Each Application is its own bucket, keyed by name — not a single shared boolean. Two different
packages composing into the _same_ named Application (e.g. your own app's own admin controller
alongside a package like `@zanix/admin`'s own admin routes, both wrapped in
`defineApplication('admin', ...)`) land in that Application's one bucket and get served together by
whichever `bootstrapServers` call mounts it; a different Application name is a fully separate
bucket.

**`application` is purely an ownership/composition boundary — it carries no URL-anchoring or
exposure meaning of its own.** An Application other than the default one (`'admin'`, `'billing'`,
`'metrics'`, ...) is not, by itself, "internal" or hidden — it's just a different named composition
boundary, on equal footing with `'main'`. Whether a server's own id doubles as an obscuring URL
prefix is a fully independent decision — see "Anchored servers" below.

Application (and any URL prefix a server happens to use) is a **routing/obscurity boundary only** —
it does not add any authentication, authorization, or network-level restriction by itself. Add an
explicit guard (e.g. `@zanix/auth`'s `AuthTokenValidation`) for real access control, same as you
would for any public route.

```ts
import { AuthTokenValidation } from '@zanix/auth'
import { Controller, Get, ProgramModule, ZanixController } from 'jsr:@zanix/server@[version]'

await ProgramModule.defineApplication('admin', () => {
  @Controller('admin/health')
  class AdminHealthController extends ZanixController {
    @Get()
    @AuthTokenValidation({ permissions: ['admin'] })
    public check() {
      return { status: 'ok' }
    }
  }
})
```

```ts
import { bootstrapServers } from 'jsr:@zanix/server@[version]'

// A second, admin-only server — only sees the 'admin' Application's routes. Not the last call in
// this boot sequence, so it must defer the metadata cleanup shared with the public call below.
await bootstrapServers({ rest: { application: 'admin' } }, { finalize: false })

// Default-Application server — never sees `admin/health`. The sequence's last call, so it finalizes
// cleanup as usual (default `finalize: true`).
await bootstrapServers({ rest: { globalPrefix: '/api' } })
```

Calling `bootstrapServers` more than once in the same process — as this admin-server pattern does —
requires passing `{ finalize: false }` to every call except the last one: `postBoot` cleanup purges
the shared route/pending-resolver registries by default, and an earlier call finalizing would wipe
routes/resolvers a later call in the same sequence still needs to read. See `bootstrapServers`'s own
doc comment for the full mechanism, and
[Utilities → Admin server helpers](./UTILITIES.md#admin-server-helpers) for
`resolveAdminServerId()`/`guardSingleAdminRegistration()` — the rest of the plumbing
`@zanix/core`/`@zanix/admin` share for this same pattern.

### Anchored servers

A server is **anchored** — its own id doubles as an obscuring URL prefix instead of a plain
`globalPrefix`-based one — **if and only if `BootstrapServerOptions[type].id` is explicitly set**.
There is no separate `anchored` flag and no auto-generated/random anchored id: omitting `id` always
gives a plain, unprefixed server. **`id` is a fully separate option from `application`**, set
explicitly per server type, precisely because a non-default Application doesn't mean "internal" on
its own: an app with `'admin'`, `'billing'`, and `'metrics'` Applications composed in the same
process wouldn't want all three anchored just because none of them is `'main'`. `@zanix/core`'s
admin bootstrap sets an explicit `id` (from `ADMIN_SERVER_ID`) for its own `'admin'`-Application
server; a different Application that doesn't need URL obscurity simply never sets one.

```ts
import { bootstrapServers, getServiceId } from 'jsr:@zanix/server@[version]'

await bootstrapServers({
  rest: { application: 'admin', id: `${getServiceId()}-rest` },
})
```

`id` is forwarded to `WebServerManager.create`'s `runtime` parameter (compiled via `compileRuntime`)
and validated at runtime against `[a-z0-9_-]+` (it anchors the URL path prefix routes are dispatched
under) — see [Utilities → Identity helpers](./UTILITIES.md#identity-helpers) for
`getServiceId()`/`sanitizeIdentifier()`.

`globalPrefix` still works alongside an anchored server — it's appended as an extra path segment
after the id, rather than replacing it:

```ts
await bootstrapServers({
  rest: { application: 'admin', id: `${getServiceId()}-rest`, globalPrefix: 'ops' },
})
// routes are reachable at /{id}/ops/... instead of /{id}/...; omit `globalPrefix` to keep the
// bare /{id}/... path.
```

**Safe rotation with `previousId`.** Once a stable `id` is pinned for legitimate reachability,
rotating it (security hygiene, or recovering from a leaked one) would otherwise need a perfectly
synchronized cutover across every caller. `previousId` avoids that: set it alongside a new `id` and
both prefixes reach the same routes simultaneously, so callers still using the old address keep
working until they're updated to the new one.

```ts
await bootstrapServers({
  rest: { application: 'admin', id: 'billing-v2', previousId: 'billing-v1' },
})
// both /billing-v2/... and /billing-v1/... are reachable during the transition window; drop
// `previousId` in a later redeploy to close it.
```

`previousId` is only meaningful alongside `id` (`compileRuntime` throws if given without it — there
is nothing to rotate _from_), and **isn't supported for a `graphql` server**: building a second
handler for the previous prefix would compile an empty stub schema instead of the real one (see
`handlers/graphql/schema.ts`'s `defineSchema`, which consumes its Query/Mutation accumulator once a
schema is built). Rotate a `graphql` Application's `rest`/`socket` servers instead. See
[Utilities → Admin server helpers](./UTILITIES.md#admin-server-helpers) for
`resolvePreviousAdminServerId()`/`ADMIN_SERVER_ID_PREVIOUS`, the built-in admin rotation runbook.

### Sharing a port with an unanchored server

An anchored server no longer needs a port of its own: if it resolves to the same port as another
server of the **same** `type` (anchored or not), both now share one real `Deno.serve()` listener
instead of failing with `AddrInUse`. Anchoring stays purely a routing boundary — routes are still
dispatched separately (the anchored one by its own id prefix, the unanchored one by its
`globalPrefix`), so a route never leaks between them even while the port is shared. Note the two
must use _different_ prefixes to safely share a port unprefixed-vs-unprefixed too — an unanchored
server's default `globalPrefix` (`'api'`/`'graphql'`/`'socket'` depending on type) collides with
another unanchored server of the same type on the same port exactly like any other same-prefix
collision would:

```ts
import { bootstrapServers } from 'jsr:@zanix/server@[version]'

// Unanchored, default-Application server on port 8000.
await bootstrapServers({ rest: { port: 8000 } })

// Anchored admin-Application server sharing the SAME port — no longer throws AddrInUse.
await bootstrapServers({ rest: { port: 8000, application: 'admin', id: 'admin-rest' } })
```

This is an implementation-level relaxation, not a recommendation to actually do this by default —
giving the anchored server its own distinct port (via an explicit `port` or `PORT_<TYPE>`) remains
the recommended way to isolate it at the network level too, on any deployment platform that allows
more than one externally-routable port. Whichever server's `bootstrapServers`/`create` call binds
the port first owns the real socket: its own `server` options (SSL, hostname, etc.) are what
actually apply, and a later server sharing that port only reuses the bound address for its own route
table. Stopping that later server is then a no-op — stop the server that originally bound the port
to actually release it. See `WebServerManager.create()`'s own JSDoc for the full trade-off list,
including a narrow startup window where a request for a not-yet-registered route on a shared port
gets a `404` instead of reaching its handler.

## Discovery

`/admin/*`-style routes are for authenticated CRUD/actions; **Discovery** is a separate, read-only
mechanism for a module to expose a snapshot of the resources it owns — e.g. templates, triggers —
under `/.well-known/zanix/{resourceType}`, so another service (a central admin/orchestrator, a sync
job) can learn what currently exists without a bespoke API per resource kind.

Three layers, mirroring how Application composition, `Runtime` compilation, and `WebServerManager`
activation stay separate:

- **`DiscoveryProvider`** (domain) — a module implements only `snapshot()` (and optionally
  `version()`), with zero knowledge of HTTP, versioning, pagination, or auth:

  ```ts
  import type { DiscoveryProvider } from 'jsr:@zanix/server@[version]'

  const templatesProvider: DiscoveryProvider<{ name: string; hbs: string }> = {
    snapshot: async () => await fetchAllTemplatesFromMyOwnStorage(),
  }
  ```

- **Registration** — `ProgramModule.defineDiscovery(resourceType, provider, options?)`, called
  inside whatever `ProgramModule.defineApplication(...)` scope the accompanying routes/controllers
  already use — `resourceType` is supplied here, not on the provider, the same way a `@Controller`'s
  `prefix` is supplied at the decoration site rather than baked into the underlying business class:

  ```ts
  await ProgramModule.defineApplication('admin', () => {
    ProgramModule.defineDiscovery('templates', templatesProvider)
  })
  ```

  A plain, re-callable function — not a decorator, not a cached side-effect import — for the same
  reason `@zanix/admin`'s own `defineAdminMetadata()` has to be one: the discovery registry is wiped
  at the end of every finalized boot sequence, so a process that boots more than once needs this to
  genuinely re-run each time.

- **Mounting** — once `bootstrapServers()` activates a REST server for that Application, every
  registered provider becomes an ordinary REST route (`.well-known/zanix/{resourceType}`),
  registered the same lazy way GraphQL's own POST route is — no new server type, no new
  `WebServerManager` concept. `WebServerManager` itself never learns Discovery exists; it only ever
  reads the resulting route table once, same as always.

**Auth is opt-in, not assumed.** `@zanix/server` has no built-in notion of permissions/roles/tokens
(that's `@zanix/auth`, a separate package this one doesn't depend on) — `defineDiscovery`'s own
`options.guards` are forwarded as-is to the underlying route, the same generic `MiddlewareGuard`
mechanism any other route already uses:

```ts
ProgramModule.defineDiscovery('templates', templatesProvider, {
  guards: [myOwnAuthGuard], // e.g. built from @zanix/auth's AuthTokenValidation
})
```

**Omitting `guards` leaves the endpoint unauthenticated** — this is the registering module's own
responsibility, not something enforced silently.

Every Discovery response negotiates its own protocol version via `DISCOVERY_PROTOCOL_HEADER`
(`X-Znx-Discovery-Protocol`) — the same negotiation mechanism `/admin/*`'s `versionProtocol` option
uses internally, with its own distinct header/version so the two protocols can evolve independently.
The response envelope:

```json
{
  "resourceType": "templates",
  "generatedAt": "2026-08-01T12:00:00.000Z",
  "items": [/* whatever snapshot() returned */]
}
```

**Scope of this first version, deliberately**: `snapshot()` is the only materialization strategy —
large/unbounded resources (a `stream()` capability, with a stateless, resumable cursor) are
specified as a future direction but not built, since nothing in this framework's own consumers needs
it yet. `version()` is accepted but not yet used to skip a redundant `snapshot()` call on an
unchanged resource — every request calls it fresh. Both are additive to build later without a
breaking change to `DiscoveryProvider`'s own shape.

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

- [Middlewares](./MIDDLEWARES.md) — guards, pipes, and interceptors that run around these handlers.
- [Dependency Injection](./DEPENDENCY-INJECTION.md) — how `Interactor` injection and lifecycle work.
- [Utilities → Admin server helpers](./UTILITIES.md#admin-server-helpers) — the shared
  id/registration plumbing behind the `'admin'`-Application server pattern above.
