# Applications

Every route/resolver/socket belongs to exactly one **Application**. An Application is never declared
on a decorator (no `@Controller`/`@Resolver`/`@Socket` option controls it) — it's resolved
automatically from context, the moment the class is registered: whichever
`ProgramModule.defineApplication(name, setup)` scope is currently running (see `@zanix/server`'s own
JSDoc for that method), or the **default Application** (`'main'`) when none is active. Ordinary app
code — the overwhelming common case — never needs to know this exists: every handler you write lands
in `'main'` automatically.

`bootstrapServers`'s own per-type `application` option (`BootstrapServerOptions[type].application` —
see [Getting Started](./getting-started.md)) decides which Application a given server mounts: a
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
[Utilities → Application server-id helpers](./utilities.md#application-server-id-helpers) for
`resolveApplicationServerId()` — the rest of the plumbing `@zanix/core`/`@zanix/admin` share for
this same pattern.

## Boot sessions

The `{ finalize: false }` pattern above coordinates calls WITHIN one sequence you control end to end
(one `async function`, like `@zanix/core`'s own `start()`). It doesn't, by itself, protect two
_independent_ top-level sequences — e.g. `@zanix/core`'s `Zanix.start()` and `@zanix/admin`'s own
`ZanixAdminHub.start()` — from corrupting each other if they're ever fired without a sequential
`await` between them: whichever one's own last `bootstrapServers()` call finalizes first would
otherwise wipe the _other_ sequence's not-yet-served routes/discovery/resolvers too, since
`finalize` used to purge those registries unconditionally, regardless of who registered what.

`bootstrapServers()` now wraps its own body in a **boot session** (`ProgramModule.sessions` /
`BootSessionContainer`) — an `AsyncContext`-backed ambient scope, the same mechanism
`ApplicationContainer` already uses to resolve "which Application is registering right now" safely
across concurrent async batches (see above). `finalize` cleanup asks "which Applications does some
_other_, still-running session currently own?" and preserves only those — everything else is swept,
exactly like the original unscoped wipe. When no other session is genuinely concurrent right now
(the common case, including every call within one single-session multi-call sequence), that "other
sessions' Applications" set is empty, so cleanup reduces to precisely the original full wipe — this
is deliberately NOT "only remove what _my own_ session touched": most real registration (a
`@Controller`/`@Resolver` decorator, triggered by a plain `import()`) happens _before_ any
`bootstrapServers()`/session ever starts, so an "only my own" rule would leave it untracked by every
session and stop being cleared at all. A bare `bootstrapServers()` call gets a session of its own
automatically — nothing to opt into for ordinary use. A package composing a WIDER multi-call
sequence (its own `start()`, in the same spirit as `@zanix/core`'s) should wrap that whole sequence
in one outer session so every `bootstrapServers()` call nested inside shares it, instead of each
forking its own:

```ts
import { ProgramModule } from 'jsr:@zanix/server@[version]'

await ProgramModule.runBootSession(async () => {
  await defineAdminMetadata()
  await bootstrapServers(adminOptions, { finalize: false })
  await bootstrapServers(mainOptions) // last call — finalizes the whole session
})
```

This is what lets `Zanix.start({ admin: true })` and `ZanixAdminHub.start()` safely coexist in one
process even fired concurrently (no `await` between them) — see `@zanix/core`'s
`docs/admin-architecture.md#running-both-servers`.

## Anchored servers

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
under) — see [Utilities → Identity helpers](./utilities.md#identity-helpers) for
`getServiceId()`/`sanitizeIdentifier()`.

`globalPrefix` still works alongside an anchored server — it's appended as an extra path segment
after the id, rather than replacing it:

```ts
await bootstrapServers({
  rest: {
    application: 'admin',
    id: `${getServiceId()}-rest`,
    globalPrefix: 'ops',
  },
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
[Utilities → Application server-id helpers](./utilities.md#application-server-id-helpers) for
`resolvePreviousApplicationServerId()`, the built-in rotation runbook any Application-scoped server
(admin or otherwise) can use.

## Sharing a port with an unanchored server

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
await bootstrapServers({
  rest: { port: 8000, application: 'admin', id: 'admin-rest' },
})
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

### Mount prefix registration (`registerApplicationMount`)

`registerApplicationMount(application, prefix)` registers the piece `routeProcessor` inserts between
`globalPrefix` and a route's own `controllerPrefix`/`methodPath` when composing its final,
externally-exposed path — a mount prefix per Application, distinct from a server's own
`globalPrefix`/anchored `id`. This is framework-composition plumbing, not something ordinary
application code calls: it exists because its intended writer, a package building an
Application-composition layer (e.g. `@zanix/app`'s `AppContainer`), lives in a separate package from
`@zanix/server` — a module-private registry would be unreachable from there. Idempotent
last-write-wins (registering the same `application` twice simply overwrites the prefix), and
normalizes `prefix` via the same path-cleaning helper `RouteContainer`/`compileRuntime` already use.
An Application that never calls this (the default `'main'` Application, and any other Application
whose owner doesn't opt in) resolves to no mount prefix, preserving existing behavior exactly.

```ts
import { registerApplicationMount } from 'jsr:@zanix/server@[version]'

registerApplicationMount('billing', 'billing-app') // routes mount under /billing-app/...
```

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

## See also

- [Handlers](./handlers.md) — REST, GraphQL, WebSocket, and SSR handlers that register into an
  Application.
- [Getting Started](./getting-started.md) — where `bootstrapServers`'s per-type options are
  introduced.
- [Configuration](./configuration.md) — the shared-port relaxation and protocol-version headers
  mentioned above.
- [Utilities Reference](./utilities.md) — the `resolveApplicationServerId`/`getServiceId` helpers an
  anchored server's stable `id` is typically built from.
