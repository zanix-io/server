# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-07-31

Consolidates everything since `2.1.1` — none of the intermediate `2.1.2`/`2.2.0`/`2.3.0` work was
ever published, so it's folded into this one entry instead of three, per the project's own CHANGELOG
discipline. The headline change: **`isInternal` is retired entirely**, replaced by two independent
concepts — **Application** (composition/ownership) and **`anchored`** (URL-obscurity) — that
redistribute what `isInternal` used to conflate into one boolean.

Also continues that same composition redesign one layer down, for core provider/connector slots
(`cache`, `database`, `auth`, ...): they move from a closed set `@zanix/server` hardcodes and
self-registers, to an **open registry** any package can add to. `@zanix/server` now only ships the
mechanism and the abstract contracts for the slots that need a dedicated `this.xxx` getter — it no
longer bundles a default implementation, or even a self-registration call, for `cache`, `worker`,
`asyncmq`, `database`, `kvLocal`, or `search`; the packages that actually implement them
(`@zanix/datamaster`, `@zanix/asyncmq`, `@zanix/auth`, `@zanix/notifications`, ...) register
themselves via `registerCoreProviderSlot`/`registerCoreConnectorSlot` instead.

### Added

- **Application — a composition boundary for routes/resolvers/sockets**, replacing `isInternal` as
  the ownership axis. `ProgramModule.defineApplication(name, setup)` runs `setup` with `name` as the
  ambient Application every `@Controller`/`@Resolver`/`@Socket` registered inside it belongs to
  (default: `'main'`, when no scope is active) — never a decorator option, resolved automatically
  from context. See [Handlers → Applications](docs/HANDLERS.md#applications).
- **`BootstrapServerOptions[type].application`** — which Application a given server mounts; only
  capabilities registered under that exact Application are served. Purely an ownership/composition
  boundary — carries no URL-anchoring or exposure meaning of its own (a non-default Application like
  `'admin'`/`'billing'`/`'metrics'` is not, by itself, "internal" or hidden).
- **`BootstrapServerOptions[type].anchored`** — a fully independent flag deciding whether a server's
  own id doubles as an obscuring URL prefix (a random UUID by default, rotating on every restart)
  instead of a plain `globalPrefix`-based one. Defaults to `false`. This is what `isInternal` used
  to imply automatically for any non-default scope; it's now an explicit, separate decision — see
  [Handlers → Anchored servers](docs/HANDLERS.md#anchored-servers). `globalPrefix` alongside
  `anchored: true` is additive (`{id}/{globalPrefix}/...`), not a replacement, same as before.
- **`bootstrapServers` auto-discovers an anchored server's generated id.** When a server type is
  `anchored` and no explicit `id` was given, the random id `webServerManager.create()` picks isn't
  something the caller already knows — `bootstrapServers` now stamps it into
  `` `${APPLICATION}_${TYPE}_SERVER_ID` `` (uppercased; non-`[A-Z0-9]` characters in `application`
  become `_`), e.g. `application: 'billing'`'s `rest` server → `BILLING_REST_SERVER_ID`, the
  built-in `'admin'` Application's own `graphql` server → `ADMIN_GRAPHQL_SERVER_ID`. Skipped
  entirely when the id was explicit (nothing to discover). See
  [Handlers → Anchored servers § Discovering an auto-generated id](docs/HANDLERS.md#anchored-servers).
- **`Runtime`/`compileRuntime`** (`modules/webserver/runtime.ts`) — the one place
  Application/anchoring resolves into a concrete server activation (id validation/normalization,
  multiplexer dispatch key, route-table prefix), entirely before `WebServerManager.create` runs.
  `WebServerManager` itself never derives any of this — it only ever consumes an already-compiled
  `Runtime`, keeping it fully agnostic of what Application/anchoring mean.
- **`resolveAdminServerId`/`guardSingleAdminRegistration`/`releaseAdminRegistration`**
  (`utils/admin-server.ts`) — a small shared helper so `@zanix/core`'s `start()` and
  `@zanix/admin`'s own `start()` resolve a stable `ADMIN_SERVER_ID`-derived id the same way instead
  of each hand-rolling it independently (previously only one of them actually did, so the other got
  a fresh random id every restart), and so running both together in one process fails loudly
  (`InternalError`) instead of silently corrupting shared route/resolver metadata.
- **`bootstrapServers` gained a `{ finalize }` option (default `true`)** so a multi-call boot
  sequence (e.g. `@zanix/core`'s `'admin'`-Application server followed by its default-Application
  one) can defer cleanup of metadata shared across the whole sequence — pending GraphQL resolvers
  (`type:resolver`) and the route registry — until the actual last call, instead of after every
  individual call. Pass `{ finalize: false }` on every call except the last one in such a sequence.
- `BootstrapServerOptions[type].id` — an explicit id for that server, forwarded to `compileRuntime`.
  Omit it to keep the default (randomly generated, unique per boot). Useful for an `anchored` server
  whose URL path prefix needs to stay stable across restarts.
- `ServerID`/`getServiceId()`/`sanitizeIdentifier()` — see the `2.1.1`-era notes below; unaffected
  by the Application/anchored redesign.
- **Discovery — `ProgramModule.defineDiscovery(resourceType, provider, options?)`** — a separate,
  read-only mechanism from `/admin/*`: a module implements `DiscoveryProvider` (just `snapshot()`,
  optionally `version()`) with zero knowledge of HTTP, and gets a
  `/.well-known/zanix/{resourceType}` route mounted automatically once `bootstrapServers()`
  activates a REST server for its Application — same lazy-registration mechanism GraphQL's own POST
  route already uses, no new server type or `WebServerManager` concept involved. No built-in auth
  (`@zanix/server` has no notion of permissions/roles — that's `@zanix/auth`); `options.guards`
  forwards whatever the registering module supplies, same generic `MiddlewareGuard` mechanism any
  route already has, and omitting them leaves the endpoint unauthenticated on purpose, not silently
  protected. Negotiates its own protocol version via `DISCOVERY_PROTOCOL_HEADER`
  (`X-Znx-Discovery-Protocol`), independent of `/admin/*`'s own protocol so the two can evolve
  separately. `stream()`/pagination for unbounded resources is specified but not built this round —
  see [Handlers → Discovery](docs/HANDLERS.md#discovery).
- **`registerCoreProviderSlot(key, BaseTarget, options?)` /
  `registerCoreConnectorSlot(key,
  BaseTarget, options?)`** (new exports) — the mechanism a package
  uses to declare "I own the `'billing'` core provider/connector slot, and `BaseTarget` is the
  abstract contract a concrete implementation must extend." Idempotent when called twice with the
  same `BaseTarget` for the same `key` (e.g. a `/core` module evaluated more than once); throws if
  called twice with a _different_ `BaseTarget` for the same `key` — a genuine ownership conflict
  between two packages. An optional `{ sourcePackage }` names the package expected to own the slot,
  surfaced in the "missing core slot" error below. This is also how you can register your own core
  slot in application code, not just from a library — see
  [Dependency Injection → Registering your own core slot](docs/DEPENDENCY-INJECTION.md#registering-your-own-core-slot).
- **`this.providers.get(Class)`/`this.connectors.get(Class)` now resolve the same singleton as
  `get('name')` for any registered core slot** — built-in or custom, via
  `registerCoreProviderSlot`/`registerCoreConnectorSlot` above. If you back a slot with your own
  implementation (`@Provider({ slot: 'cache' })` extending `ZanixCacheProvider`), you can look it up
  either way — `this.providers.get('cache')` or `this.providers.get(YourCacheClass)` — and get back
  the identical instance. Previously, class-based lookup only worked for custom (non-core)
  providers/connectors; a core slot's concrete class was only resolvable by its string key.
- **A missing core slot now throws an explicit, actionable error** instead of a generic "not found":
  naming the slot and, when `sourcePackage` was given at registration, hinting which package to
  import
  (`Missing core provider slot "auth". No provider was registered for this slot.
  Did you forget to import "@zanix/auth"?`).
  A slot that _is_ registered but has no concrete instance in the current process gets a distinct
  message for that case too. Any other resolution failure (a real bug inside an already-resolved
  provider/connector) still propagates unchanged.
- **`getConnectorKey(ConnectorClass)`** (new export) and **`connectorKey`** (new
  `protected
  readonly` field on every `ZanixConnector` instance) — resolve the DI key a
  `@Connector`-decorated class was actually registered under (the slot string for a class aliased to
  a core slot, regardless of subclassing; an auto-generated key otherwise), from the class itself or
  from an instance. See
  [Dependency Injection → `connectorKey`](docs/DEPENDENCY-INJECTION.md#connectorkey--a-connectors-own-identity).
- `CoreProviders`/`CoreConnectors` now suggest, in editor autocomplete, the slot keys
  `@zanix/server` itself pre-seeds — 5 for providers (`'cache'`, `'asyncmq'`, `'worker'`, `'auth'`,
  `'notifications'`) and 8 for connectors (`'cache:redis'`, `'cache:memcached'`, `'cache:custom'`,
  `'cache:local'`, `'kvLocal'`, `'asyncmq'`, `'database'`, `'search'`) — while still accepting any
  other string: a package's own custom slot key isn't statically known to this type, but is still
  valid at runtime once registered.

### Changed (breaking)

- **`isInternal` removed from `@Controller`/`@Resolver`/`@Socket`'s options entirely.** A route's
  Application is resolved from ambient composition context instead (see `Added` above) — there is no
  direct replacement option on the decorators themselves; wrap the registering code in
  `ProgramModule.defineApplication(name, setup)` instead.
- **`WebServerManager.create`'s 3rd parameter is now `Runtime`-only** — it no longer accepts a plain
  `serverID` string. Direct callers that don't care about Application/anchoring can simply omit it
  (defaults to `compileRuntime(type, { globalPrefix: options.server?.globalPrefix })`); callers that
  need an explicit id, or anchored/Application-scoped behavior, build a `Runtime` via
  `compileRuntime` first.
- **`ServerManagerOptions` no longer has an `application` field.** Application/anchoring resolution
  happens entirely in `compileRuntime`, before `WebServerManager.create` ever runs — `create` itself
  stays fully agnostic of both concepts.
- Two web servers of the **same** `type` (e.g. two `'rest'` servers, one unanchored and one
  `anchored`) that resolve to the same port now share one real `Deno.serve()` listener instead of
  failing with `AddrInUse`. Each port's own dispatch table (`HandlerBox`) is never mutated in place
  — every new registration on a port builds an entirely new, frozen table and atomically swaps a
  pointer to it, so a request always sees either the fully-old or fully-new table, never a partial
  one. Whichever server binds the port first owns the real socket (its own SSL/hostname/etc. options
  are what actually apply); a later server sharing that port only reuses the bound address for its
  own route table, and stopping it directly is a no-op — stop the server that originally bound the
  port to actually release it. See `create()`'s own JSDoc for the full trade-off list.
- `RestClient` now enables conditional `ETag` caching for `GET` requests by default. Responses that
  include an `ETag` header are cached and reused through `If-None-Match` / `304 Not Modified`
  validation on subsequent requests. The behavior can be disabled per client or per request with
  `etag: false`, and subclasses can customize ETag participation and cache identity rules.
- `InternalProgram.cleanupInitializationsMetadata` takes a second `finalize: boolean = true`
  parameter (only meaningful for `mode: 'postBoot'`) — see `bootstrapServers`'s `{ finalize }`
  above.
- `@Provider`/`@Connector`'s object-argument option is now `slot`, not `type` — e.g.
  `@Provider({ slot: 'cache' })`, `@Connector({ slot: 'database' })`. Renamed because `type` never
  actually meant "kind of provider" — for a core slot it's literally the registration key, and for a
  custom provider/connector there's no key here at all (the real key comes from the class itself).
  `slot` names what the option actually does in both cases. The single-argument string shorthand
  (`@Provider('cache')`, `@Connector('database')`) is unaffected.
- `ZanixCoreAuthProvider` and `ZanixCoreNotificationsProvider` are no longer exported from
  `@zanix/server`. Both were empty marker classes whose only purpose was to satisfy
  `@Provider({ slot: 'auth' | 'notifications' })`'s base-class check — unlike the 6 core slots with
  a dedicated `CoreBaseClass` getter (`cache`, `database`, `asyncmq`, `worker`, `kvLocal`,
  `search`), neither `auth` nor `notifications` has one, so nothing in `@zanix/server`'s own source
  actually needed to import them. They're now owned by the packages that actually implement them:
  import `ZanixCoreAuthProvider` from `@zanix/auth` and `ZanixCoreNotificationsProvider` from
  `@zanix/notifications` instead.
- `@zanix/server` no longer self-registers the `cache`/`worker`/`asyncmq` core provider slots, nor
  the `database`/`kvLocal`/`search`/`asyncmq` core connector slots — ownership moved to the packages
  that actually implement them (`@zanix/datamaster`, `@zanix/asyncmq`, ...), which now call
  `registerCoreProviderSlot`/`registerCoreConnectorSlot` themselves. Only
  `cache:custom`/`cache:memcached` still self-register directly in `@zanix/server`, since no package
  owns a concrete implementation for either yet. A project must import the package that owns a given
  slot (or call `registerCore*Slot` itself) before using that slot's `this.xxx` getter
  (`this.cache`, `this.database`, ...) or referencing it by string key — omitting it now throws the
  explicit "missing core slot" error above instead of resolving a bundled default.
- `@Interactor`'s object-argument `Connector`/`Provider` options, and `ZanixInteractor`'s
  corresponding `this.connector`/`this.provider` getters, are removed entirely. Reach any dependency
  — including one that used to be the interactor's single declared connector/provider — through the
  generic `this.providers.get(X)`/`this.connectors.get(X)` (inherited from `CoreBaseClass`), the
  same mechanism providers already use. Replace `@Interactor({ Connector: X,
  Provider: Y })` /
  `class Foo extends ZanixInteractor<{ Connector: X; Provider: Y }>` with plain `@Interactor()` /
  `class Foo extends ZanixInteractor`, and `this.connector`/`this.provider` call sites with
  `this.connectors.get(X)`/`this.providers.get(Y)`.
- `CoreConnectorTemplates` is renamed to `CoreModules` and gains an index signature
  (`Partial<{ [key: string]: ZanixConnector | ZanixProvider }>`) alongside its existing 6 named,
  optional slots (`worker`, `asyncmq`, `cache`, `database`, `kvLocal`, `search`) — the generic every
  `CoreBaseClass` subclass (`ZanixProvider`, `ZanixConnector`, `ZanixInteractor`) accepts to type
  `this.providers.get(key)`/`this.connectors.get(key)` precisely for a string key, not just the 6
  named slots. `ZanixInteractor`'s generic no longer accepts/needs `{ Connector, Provider }` — see
  the `@Interactor` change above. `ZanixProvidersGetter`/`ZanixConnectorsGetter` are now generic
  (`ZanixProvidersGetter<T extends CoreModules>`) for the same reason;
  `getProviders`/`getConnectors` (`ProgramModule` and the instance-level accessors) accept an
  explicit type parameter to get a precisely-typed `get` back. See
  [Dependency Injection → Typing a string-keyed `get` call](docs/DEPENDENCY-INJECTION.md#typing-a-string-keyed-get-call).

### Removed (breaking)

- **`ADMIN_REST_PORT`/`ADMIN_GRAPHQL_PORT`/`ADMIN_SOCKET_PORT`/`ADMIN_STATIC_PORT`** — fixed-port
  constants that were never reachable on a platform exposing only one externally-routable port
  (Heroku, Render, Railway, …). Nothing outside `@zanix/core`'s own `start.ts` used them (confirmed
  across the monorepo); `@zanix/core` replaces them with a port that defaults to whichever one the
  default-Application server for that type resolves to, overridable via `PORT`/`PORT_<TYPE>`
  (unchanged) or an explicit per-type option.

### Fixed

- **`RouteContainer.defineRoute`'s plain `{path, handler}` registration form (the escape hatch
  GraphQL's lazy POST route, and now Discovery, both use) silently dropped any `guards` passed
  alongside it** — `pipes`/`interceptors` were destructured and stored, `guards` wasn't, so a route
  registered this way could never actually be gated by anything. Only affects direct, non-decorator
  registration (`@Controller`/`@Resolver`/`@Socket`-driven routes were unaffected, since those go
  through a separate code path). Found while wiring Discovery's own optional `guards`.
- **`type:connector` is no longer cleared by `cleanupInitializationsMetadata('postBoot')` at all.**
  It's the only registry `closeAllConnections()` (invoked on process shutdown, via the `unload`
  listener) reads to know which connectors to `.close()` — since it was wiped during boot instead,
  `closeAllConnections()` had nothing left to iterate, so connectors (Mongo, Redis, etc.) never
  actually got a graceful `.close()` call. It's now cleared by `closeAllConnections()` itself, right
  after it's done using it — process shutdown, not boot completion, being its true end of life.
- The internal request multiplexer (`webserver/helpers/handler.ts`'s `multiplexer()`) now always
  dereferences the port's dispatch table fresh per request instead of closing over a fixed snapshot
  — fixes a bug where a handler registered on a shared port _after_ that port's listener was already
  bound could never be reached. A request whose path doesn't match any handler on a shared port now
  gets a proper `404`, instead of a `500`-class dispatch error.
- `@Socket`'s class decorator never drained the shared method-decorator queue (unlike
  `@Controller`/`@Resolver`, it never called `applyMiddlewaresToTarget`) — left a stray entry
  sitting around to be incorrectly drained onto whichever _next_ handler class happened to call this
  function. Found and fixed as a prerequisite for wiring `versionProtocol` into `@Socket`.
- `identityKey()` (`connectors/core/rest.ts`) had a literal raw NUL byte embedded in its source
  instead of the intended `\0` escape sequence — functionally equivalent at runtime, but made the
  file register as binary to `git diff`/`file`. Restored to the proper `'\0'` escape text.

## [2.1.1] - 2026-07-28

### Added

- **`versionProtocol` — generic, on-by-default protocol-version negotiation for `@Controller`,
  `@Resolver`, and `@Socket`.** Rejects an incoming request that declares an unsupported version
  (via a `Guard`), and stamps the negotiated version on every response (via an `Interceptor`) —
  `X-Znx-Protocol-Version: 1` by default (`PROTOCOL_VERSION_HEADER`/`DEFAULT_PROTOCOL_VERSION`, both
  new exports). Pass an object to override the header name, current version, or which older versions
  are still accepted; pass `false` to disable it. On a `@Socket` class, negotiation happens once, at
  the connection handshake (a WebSocket upgrade is a real HTTP request/response under the hood) —
  there's no per-message header concept once the socket is open. This generalizes what was
  previously a hand-rolled, admin-specific guard/interceptor pair in `@zanix/admin` into reusable
  framework infrastructure — see
  [Handlers → Protocol version negotiation](docs/HANDLERS.md#protocol-version-negotiation).
- Added `AUTH_HEADERS`, `SESSION_HEADERS`, `RATE_LIMIT_HEADERS`, `GENERAL_HEADERS`, and
  `ADMIN_PROTOCOL_HEADER` constants — centralizes header-name constants that were previously
  duplicated (in some cases with diverging hardcoded copies) across `@zanix/auth`, `@zanix/core`,
  and `@zanix/notifications`, all of which already depend on `@zanix/server`. Deliberately excludes
  `ADMIN_PROTOCOL_VERSION` (the version _number_, as opposed to the header name) — that lives in
  `@zanix/admin`, since it's expected to change independently of `@zanix/server`. See
  [Configuration → Auth & admin-protocol headers](docs/CONFIGURATION.md#auth--admin-protocol-headers).
- `getServiceId()`/`sanitizeIdentifier()` (`utils/identity.ts`) — derives a stable service identity
  from the project's own package name, same convention `ZanixDatabaseConnector`'s `defaultDbName`
  already used internally for the default database name (now refactored to reuse this instead of
  duplicating the sanitization logic).
- `BootstrapServerOptions[type].id` — an explicit id for that server, forwarded to
  `WebServerManager.create`'s pre-existing `serverID` parameter. Omit it to keep the default
  (randomly generated, unique per boot). Useful for an `isInternal` server whose URL path prefix
  needs to stay stable across restarts.

### Changed

- **`ServerID` is now a plain `string`, not a UUID-shaped template literal.** The old type
  (`` `${string}-${string}-${string}-${string}-${string}` ``) was never actually validated at
  runtime and only ever matched the auto-generated default by coincidence — it actively rejected
  valid custom ids (e.g. anything from `getServiceId()`, which uses `_` not `-`), forcing awkward
  `as never` casts to work around it. `WebServerManager.create`'s `serverID` parameter (and
  `BootstrapServerOptions[type].id`, see above) now sanitizes and validates an `isInternal` server's
  id against `[a-z0-9_-]+` **at runtime** instead (it doubles as a URL path prefix routes are
  dispatched under) — throwing an `InternalError` on an unsafe custom id instead of silently
  breaking route dispatch. Non-`isInternal` ids are unconstrained, same as before.
- Two web servers of the **same** `type` (e.g. two `'rest'` servers, one public and one
  `isInternal`) that resolve to the same port now share one real `Deno.serve()` listener instead of
  failing with `AddrInUse` — `isInternal` is now purely a routing/authorization boundary, not a
  requirement for a separate network listener. Whichever server binds the port first owns the real
  socket (its own SSL/hostname/etc. options are what actually apply); a later server sharing that
  port only reuses the bound address for its own route table, and stopping it directly is a no-op —
  stop the server that originally bound the port to actually release it. See `create()`'s own JSDoc
  for the full trade-off list.
- The internal request multiplexer (`webserver/helpers/handler.ts`'s `multiplexer()`) now always
  does a live per-request lookup instead of shortcutting to a single handler captured by value —
  fixes a related bug where a handler registered on a shared port _after_ that port's listener was
  already bound could never be reached. A request whose path doesn't match any handler on a shared
  port now gets a proper `404`, instead of a `500`-class dispatch error.
- `RestClient` now enables conditional `ETag` caching for `GET` requests by default. Responses that
  include an `ETag` header are cached and reused through `If-None-Match` / `304 Not Modified`
  validation on subsequent requests. The behavior can be disabled per client or per request with
  `etag: false`, and subclasses can customize ETag participation and cache identity rules.

### Fixed

- **`@Socket`'s class decorator never drained the shared method-decorator queue** (unlike
  `@Controller`/`@Resolver`, it never called `applyMiddlewaresToTarget`). A method-level
  `@Guard`/`@Pipe`/`@Interceptor` on a socket lifecycle method still has no effect either way — a
  `@Socket` class has exactly one real route (the connection/upgrade itself), not one per lifecycle
  method, so there's no per-method route for it to bind to (see
  [Middlewares → Middleware on sockets](docs/MIDDLEWARES.md#middleware-on-sockets-class-level-only))
  — but leaving the queue undrained left any such (mistaken) entry sitting around to be incorrectly
  drained onto whichever _next_ `@Controller`/`@Resolver`/`@Socket` class happened to call this
  function. Found and fixed as a prerequisite for wiring `versionProtocol` (see `Added` above) into
  `@Socket`.
- `identityKey()` (`connectors/core/rest.ts`, backing `RestClient`'s ETag cache identity scoping)
  had a literal raw NUL byte embedded in its source instead of the intended `\0` escape sequence —
  functionally equivalent at runtime (both produce a one-character null-string separator), but it
  made the file register as binary to `git diff`/`file` and could trip up tooling that doesn't
  expect a control character inside a source file. Restored to the proper `'\0'` escape text.
- **`cleanupInitializationsMetadata('onBoot')` unconditionally wiped the _entire_ shared route
  registry** (`this.routes.resetContainer()`, with no filtering by `type`/`isInternal`) once the
  first server of a boot finished starting. This went unnoticed because every existing caller
  registered all its routes with the same `isInternal` value the first `bootstrapServers` call
  actually served — but a consumer that registers routes of _different_ `isInternal` scopes up front
  and then calls `bootstrapServers` more than once in the same boot (e.g. an internal admin server
  first, then a public one — `@zanix/core`'s own `start.ts`) would silently lose any route not
  claimed by that first call: it never got the chance to be served by the later call, with no error
  anywhere. Routes are no longer touched by this cleanup at all — each server's own dispatch table
  is built once from this registry at `webServerManager.create()` time and never reads it again at
  request time, so leaving it populated for the life of the process has no runtime cost.

## [2.1.0] - 2026-07-27

## Added

- Added the `isInternal` option to `HandlerDecoratorOptions`.
- Added the `isInternal` option to `SocketDecoratorOptions`.

## Changed

- Controllers can now be marked as internal by setting `isInternal: true`, ensuring that all their
  routes are only mounted on servers bootstrapped with the matching
  `BootstrapServerOptions[type].isInternal` value.
- Socket routes can now be marked as internal using `isInternal: true`, restricting them to servers
  bootstrapped with the corresponding `BootstrapServerOptions[type].isInternal` value.
- By default, both handlers and socket routes remain **public** (`isInternal: false`) unless
  explicitly configured otherwise.

## [2.0.4] - 2026-07-26

### Added

- Added the new `search` core connector type for generic search engine and document indexing
  connectors (e.g. Elasticsearch and OpenSearch).
- Added `ZanixSearchConnector`, the abstract base class for the `search` connector type — see
  [Built-in connector and provider base classes](docs/DEPENDENCY-INJECTION.md#built-in-connector-and-provider-base-classes).
  It extends `RestClient` (not `ZanixConnector` directly) since backends in this category are
  consumed over HTTP, the same reasoning `GraphQLClient` already follows, and declares the
  `index`/`bulkIndex` contract every such connector must implement.
- Added the `BulkIndexResult` type (`typings/general.ts`) — the return shape of
  `ZanixSearchConnector.bulkIndex`.
- Added a `this.search` getter to `CoreBaseClass` (and therefore to `ZanixProvider`/
  `ZanixInteractor`), mirroring the existing `this.database`/`this.kvLocal` getters, for typed
  access to the registered search connector.

## [2.0.3] - 2026-07-26

### Fixed

- Fixed case sensitive routes on `RestClient`.

## [2.0.2] - 2026-07-25

### Added

- Added a runtime warning when a `SINGLETON` target resolves a `SCOPED` dependency, helping identify
  potential lifetime leaks.
- Added caller tracking during dependency resolution to detect lifetime mismatches.

### Changed

- Updated connector, provider, and interactor resolution to propagate the calling target for
  lifetime validation without affecting dependency resolution behavior.

## [2.0.1] - 2026-07-24

### Fixed

- `ZanixCoreAuthProvider` and `ZanixCoreNotificationsProvider` were documented and implemented in
  `2.0.0` but the `mod.ts` export lines were missing from that release, so neither was actually
  importable from `@zanix/server`. Added the missing exports.

## [2.0.0] - 2026-07-24

### Added

- **`ZanixCoreAuthProvider`**/**`ZanixCoreNotificationsProvider`**: new core provider base classes,
  registered as the `'auth'` and `'notifications'` `CoreProviders` types. They're the foundation
  `@zanix/auth`'s `ZanixAuthProvider` and `@zanix/notifications`'s `NotifierProvider` build on, so
  the framework recognizes them via `this.providers.get('auth'|'notifications')` and
  `@Provider({ type: 'auth'|'notifications' })`. Documented in
  [Dependency Injection](./docs/DEPENDENCY-INJECTION.md).

### Changed

- Bumped `@zanix/validator` dependency to `2.3.*`.

### Fixed

- `assembly.ts`'s core-dependency validation no longer throws when a `ProviderCoreModules` entry's
  `Target` is still an unresolved placeholder (not yet a function) — it now guards with a
  `typeof Target === 'function'` check before the `instanceof` comparison.

### Removed

- **Breaking**: `cleanRoute` and `processUrlParams` are no longer exported from `@zanix/server`.
  Both moved to `@zanix/helpers` — import them from there instead
  (`import { cleanRoute, processUrlParams } from 'jsr:@zanix/utils/helpers'`).

## [1.6.0] - 2026-07-23

### Added

- **`ErrorLogThrottle`**: configurable throttling for repeated HTTP error logs, replacing the fixed
  "50 per hour" in-memory-only behavior. New public exports `ErrorLogThrottle`,
  `ErrorLogThrottleStore`, and `ErrorLogThrottleConfig` let you tune the `threshold`/`windowMs`,
  pass a custom `store` to share the count across a fleet of instances (e.g. Redis, Deno KV), raise
  `maxStatus` to also throttle server errors (>= 500, which are otherwise always logged
  unconditionally), or `excludeStatuses` to keep specific codes (e.g. `401`) fully visible while
  throttling the rest. Documented in [Error Handling](./docs/ERRORS.md#error-log-throttling),
  including how to back the store with a Zanix-managed provider/connector via `ProgramModule`.
- **`ProgramModule.providers`/`ProgramModule.connectors`**: shorthand getters for `getProviders()`/
  `getConnectors()` with no context — the common case for `SINGLETON`-lifetime providers/connectors,
  which ignore `ctxId` in resolution anyway. Documented in
  [Dependency Injection](./docs/DEPENDENCY-INJECTION.md#accessing-instances-outside-any-class-programmodule).

### Fixed

- Internal DI metadata (`ZANIX_PROPS`) no longer leaks through `JSON.stringify`/`Object.keys`/
  object-spread on handler, provider, and connector instances — it's now defined as a non-enumerable
  property instead of a plain assigned one. Fixed alongside: a subclass that doesn't register its
  own metadata no longer incorrectly inherits an ancestor class's registered metadata through the
  prototype chain; it now falls back to its own defaults, as before.
- `defineScalars` (GraphQL custom scalar registration) now actually takes effect during query
  execution. It previously replaced the entry in the schema's internal type map, but resolved fields
  already referenced the original stub scalar object from the SDL, so a custom `serialize` never ran
  — only introspection reflected the change. It now mutates the existing stub in place instead.

## [1.5.0] - 2026-07-23

### Added

- **New guides in `docs/`**: [Getting Started](./docs/GETTING-STARTED.md),
  [Handlers](./docs/HANDLERS.md), [Middlewares](./docs/MIDDLEWARES.md),
  [Dependency Injection](./docs/DEPENDENCY-INJECTION.md), [Configuration](./docs/CONFIGURATION.md),
  and [Utilities Reference](./docs/UTILITIES.md), linked from the README's new `Documentation`
  section.
- **Validated `docs/HANDLERS.md`/`docs/MIDDLEWARES.md` against a second real production consumer**
  (a WebSocket/RabbitMQ-heavy service), documenting: the `this.socket`/`this.registry` pattern for
  tracking live socket connections and pushing messages to them proactively (outside the
  request/response cycle of `onmessage`); and that `@Guard`/`@Pipe`/`@Interceptor` on `@Socket`
  classes only take effect at the class level, never on an individual lifecycle method — a `@Socket`
  class has exactly one route (the connection/upgrade), unlike `@Controller`/`@Resolver` which
  register one route per decorated method, so there is no per-method route for a method-level
  middleware to attach to. (Traced end-to-end through the route-assembly code before concluding this
  — it is expected behavior given the single-route model, not a bug.)
- **Validated `docs/DEPENDENCY-INJECTION.md` against a real production consumer**, surfacing the
  dominant real-world dependency-access patterns that were missing: `ZanixProvider<{ database: X }>`
  named-slot getters (`this.database`/`.cache`/`.worker`/`.asyncmq`/`.kvLocal`) as the idiomatic way
  a provider reaches its connector, and `this.providers.get(X)`/`this.connectors.get(X)`/
  `this.interactors.get(X)` for reaching dependencies beyond the single one declared on
  `@Interactor`/`@Provider`. Also added the `@Post({ Body })` no-path overload example to
  [Handlers](./docs/HANDLERS.md), a real-practice note to
  [Middlewares](./docs/MIDDLEWARES.md#advanced-building-your-own-middleware-decorator) about
  building app-level guard packages, and a clarification in the README's
  [file naming conventions](./README.md#file-naming-conventions) that `@zanix/server` itself doesn't
  scan the filesystem — the suffix convention matters for tooling like `@zanix/core`, not for
  `@zanix/server`'s own registration.
- Documented previously-uncovered public exports: `ProgramModule`'s instance accessors
  (`getConnectors`/`getProviders`/`getInteractors`/`registry`/`asyncContext`) in
  [Dependency Injection](./docs/DEPENDENCY-INJECTION.md), `GQLRequest` in
  [Handlers](./docs/HANDLERS.md), `defineMiddlewareDecorator` in
  [Middlewares](./docs/MIDDLEWARES.md), and the error/routing/compression helper functions
  (`httpErrorResponse`, `getSerializedErrorResponse`, `attachGlobalErrorHandlers`, `TargetError`,
  `cleanRoute`, `processUrlParams`, `gzipResponse`, `gzipResponseFromResponse`, `getTargetKey`,
  `targetInitializations`, `closeAllConnections`, `cleanupInitializationsMetadata`) in
  [Error Handling](./docs/ERRORS.md) and the new [Utilities Reference](./docs/UTILITIES.md).
- **`@example` blocks** across all REST/GraphQL/Socket handler decorators (`Controller`, `Get`,
  `Post`, `Patch`, `Put`, `Delete`, `Request`, `Resolver`, `Query`, `Mutation`, `Socket`) and the
  `Connector`/`Provider`/`Interactor` class decorators, grounded in real, compiling usage.
- **Dozens of previously-internal types now publicly exported** from the package entrypoint (e.g.
  `Lifetime`, `StartMode`, `ConnectorTypes`, `ProviderTypes`, `HandlerContext`-related types,
  `TargetBaseClass`, `HandlerBaseClass`, `ContextualBaseClass`, `CoreBaseClass`,
  `RegistryContainer`, and many more), so consumers extending Zanix base classes can now name every
  type involved in their public signatures.

### Changed

- **README restructured**: the ~150-line "Importing Features" catalog was replaced with a compact
  table linking to the new guides, the install steps were moved directly under `Installation`, and a
  duplicated `webServerManager` example was removed. The README shrank from ~390 to ~260 lines; the
  removed detail now lives in `docs/` instead.

### Fixed

- `@Resolver({...})`'s object-argument overload incorrectly required an `Interactor`, unlike
  `@Controller`; it's now optional, matching the underlying type.
- `closeAllConnections` didn't `return` the result of each connector's `close()` call, so
  `Promise.all` never actually awaited asynchronous connectors and silently swallowed rejections.
- Corrected numerous outdated or inaccurate JSDoc comments found during a full documentation audit:
  wrong `@returns`/`@throws` types, guard-header timing described backwards, copy-pasted docs
  between unrelated decorators, stale `@extends` tags, missing/renamed fields in public types, and a
  broken `jsr.io` badge link in the README.
- `deno doc --lint` findings reduced from 93 to a single documented exception (a third-party `redis`
  type whose own internal type graph isn't publicly resolvable).
- Broken `CHANGELOG`/`LICENSE` links in the README (pointed at `./docs/` after those files moved to
  the project root).
- README inaccuracies: missing `Changelog` entry in the table of contents, a `ZanixAsyncmqProvider`
  import typo (the real export is `ZanixAsyncMQProvider`), and a `webServerManager.start('rest')`
  example that passed the server type instead of the `ServerID` returned by `create()`.
- Final consistency/accuracy pass across `docs/`, verified with independent read-only reviews:
  `ERRORS.md`'s "Error Concurrency" section had the suppression logic backwards (it described errors
  as suppressed _after_ exceeding the 50/hour threshold, when the real code suppresses them _until_
  the threshold is hit, then logs once and resets); a `DEPENDENCY-INJECTION.md` claim that the named
  connector getters (`this.database`, etc.) are "built on top of" `use()` was false — they call
  `this.connectors.get()`/`this.providers.get()` directly, an unrelated mechanism; the `Lifetime`
  table didn't note that `@Provider` excludes `TRANSIENT` at the type level; the `Interactor`
  section was missing its "Defaults when no options are given" line and didn't document that passing
  a _core_ connector/provider (one extending a built-in base class) to `@Interactor`'s options
  throws — it must be accessed via the matching named getter instead. Also fixed
  heading/anchor/admonition-marker inconsistencies, reworded a heading whose ampersand ("&")
  produced an ambiguous double-hyphen slug on some markdown renderers, and de-duplicated the
  "Special Environment Variables" table that was repeated verbatim in both the README and
  [Configuration](./docs/CONFIGURATION.md#environment-variables) (README now links to it instead).

## [1.4.18] - 2026-07-23

### Changed

- Updated the library to be compatible with Deno 2.9.

## [1.4.12] - 2025-12-19

### Changed

- `ZanixWorkerProvider` abstrac class.

## [1.4.10] - 2025-12-17

### Fixed

- 🛠️ Improved CORS logic in `corsGuard`:

  - `Access-Control-Allow-Origin` is now set dynamically based on `credentials`:

    - `credentials: true` → returns the actual request origin (`requestOrigin`).
    - `credentials: false` → returns `"*"` to allow any origin.
  - Added `Access-Control-Allow-Credentials: true` **only when `credentials: true`**.
  - Added `Vary: Origin` **only when a dynamic origin is returned**, ensuring caches and proxies do
    not reuse responses across different origins.
  - Requests without an `Origin` header are no longer unnecessarily blocked.
  - Preflight (`OPTIONS`) requests and allowed methods/headers validation are fully supported.
  - Overall improvements to security and browser/proxy compatibility for cross-origin requests, with
    or without credentials.

## [1.4.5] - 2025-12-11

### Added

- Support for asynchronous message queue handling (Async MQ).

## [1.4.4] - 2025-12-09

### Added

- Multiple server types can now run on the same port, enabling single-port deployment environments.

## [1.4.0] - 2025-12-09

### Added

- **RegistryContainer**: a new container for storing and managing internal metadata and registry
  entries.
- **RegistryContainer integration** across `PublicModule`, interactor classes, provider classes, and
  socket classes.
- **Support for instance registration by ID**, allowing components such as sockets to be registered,
  retrieved, and managed using unique identifiers.

## [1.3.18] - 2025-12-07

### Fixed

- Fixed an issue where routes failed to resolve correctly when both `prefix` and `endpoint` were
  empty strings.

## [1.3.13] - 2025-11-27

### Fixed

- PATCH, PUT, and DELETE methods now properly accept a request body (payload).

## [1.3.11] - 2025-11-26

### Fixed

- Fixed an issue where RestClient returned responses with an incorrect Content-Type format.

## [1.3.7] - 2025-11-25

### Fixed

- Avoided the use of reserved names in target injector classes.
- Clarified the error message provided by the connector injections.

## [1.3.6] - 2025-11-25

### Added

- `cookiesGuard`: Added a new guard that parses incoming request cookies and exposes only user-level
  cookies, filtering out internal framework cookies that start with `X-Znx-`.\
  This guard centralizes cookie handling at the server level and prevents framework-specific cookies
  from being exposed in the request context.

## [1.3.5] - 2025-11-25

### Fixed

- HTTP error responses now display the full details.

## [1.3.4] - 2025-11-20

### Added

- Allowed using the same route path with different HTTP methods.

## [1.3.3] - 2025-11-20

### Fixed

- Resolved internal errors metadata and issues caused by serialization.

## [1.3.1] - 2025-11-20

### Added

- **Advanced Error Logging System**:

  - Introduced a new error logging mechanism based on `ZanixLogger` to efficiently manage and track
    errors in the server.
  - Errors are now validated by the `status` property (`{ value: number }`) to identify server-side
    errors (HTTP status 500+), which will always be logged.
  - **Concurrency control**: Errors caused by high concurrency (more than 50 occurrences within the
    last hour) will no longer flood the logs, ensuring a clean log history.
  - Critical errors (HTTP status >= 500) are logged automatically, regardless of the `_logged`
    property.
  - Customizable error codes and messages in critical error classes, helping developers manage
    server exceptions more efficiently.

### Changed

- **Error Handling Workflow**:

  - The logging system now checks for the `status` and `status.value` properties in error objects to
    determine if the error should be treated as a server error.
  - Added a validation mechanism for errors with `status: { value: number }` to ensure proper
    logging of server errors.

### Fixed

- Minor bug fixes related to error logging concurrency handling.

## [1.2.10] - 2025-11-20

### **Fixed**

- **Handled unhandledrejection error**: Resolved an issue with unhandled promise rejections,
  preventing unexpected behavior due to unhandled asynchronous exceptions.
- **Connector initialization order**: Corrected the initialization order of connectors and
  providers, ensuring providers are initialized **after** connectors are fully ready for use,
  preventing potential inconsistencies.

## [1.2.9] - 2025-11-19

### Changed

- Replaced Higher-Order Component (HOC) files with `defs` files to unify module definitions and
  centralize DSL-based declarations, metadata, and foundational structures. This improves
  consistency and simplifies the architecture for components like handlers, interactors, providers,
  and connectors.

## [1.2.8] - 2025-11-18

### Fixed

- `RestClient` body support for all content types.

### Added

- Ephemeral per-request context store (`locals`).

## [1.2.7] - 2025-11-18

### Changed

- Provider instance check replaced with `getProviderConnector`.
- All Guard Middlewares can access to `interactors`, `providers` and `connectors`.

### Fixed

- **`RestClient`**: Endpoints without a base URL now work correctly when the full URL is provided in
  the `endpoint` parameter.

## [1.2.6] - 2025-11-18

### 🚀 **Added**

- **New abstract base classes for HTTP and GraphQL clients**

  - **`RestClient`**: Provides a standardized layer for performing REST operations (`GET`, `POST`,
    `PUT`, `PATCH`, `DELETE`) with:

    - Automatic base URL resolution
    - Default header handling
    - JSON request/response serialization
    - Unified error handling via `HttpError`
  - **`GraphQLClient`**: Extends `RestClient` to simplify sending GraphQL queries using:

    - Automatic `POST` requests
    - GraphQL-specific payload handling
    - Inherited header management, JSON parsing, and error handling

These classes enable easier, more consistent, and reusable implementations of specialized REST and
GraphQL API clients.

## [1.2.5] - 2025-11-17

## [1.2.4] - 2025-11-17

### Added

- **Key-value store connectors**: support for key-value store core connectors

## [1.2.3] - 2025-11-16

## [1.2.2] - 2025-11-16

## [1.2.1] - 2025-11-16

### Added

- **cache ttl offset**: custom function `getTTLWithOffset` to process maximum random offset in
  seconds to add.

## [1.2.0] - 2025-11-16

### Changed

- The `Cache` abstract namespace is now deprecated.
- The `Cache` abstract `client` are adapted to diffetent caches.

## [1.1.5] - 2025-11-15

## [1.1.4] - 2025-11-15

### Changed

- The `Cache` abstract class now supports **typed clients**, allowing for better type safety and
  easier integration with different cache providers.
- The `Cache` abstract provider has been updated to include support for **`withLock`**
  functionality, enabling efficient locking mechanisms for resource access control, preventing race
  conditions in concurrent environments.

## [1.1.3] - 2025-11-14

### Changed

- Cache abstract class now supports scheduler functionality.
- Cache abstract provider now supports retrieving client instances.

### Added

- **Guard Middleware Support**: Added support for middleware decorators and DSLs in
  [Guard](../src/modules/infra/middlewares/defs/guards.ts).

## [1.1.2] - 2025-11-11

### Fixed

- Cache and Worker providers Injection and testing.

## [1.1.1] - 2025-11-11

### Fixed

- Cache and Worker providers.

## [1.1.0] - 2025-11-10

### Added

- Introduced a **technical orchestration layer** for providers in `.providers.ts`, enabling better
  modularity and management of provider interactions.

### Changed

- Updated connector access and definitions: connectors can no longer access other connectors,
  ensuring a more isolated and secure structure.
- Interactors now have access to both providers and connectors, allowing for enhanced flexibility in
  interactions and data flow.
- The **Cache Core** has been refactored into a **Cache Provider**, streamlining cache management
  and improving provider interactions.
- The **Worker Core** is now refactored as a **Worker Provider**, enabling better separation of
  concerns and enhancing worker management capabilities.

## [1.0.15] - 2025-11-03

### Added

- Session base types
- Some documentation

## [1.0.14] - 2025-11-01

### Added

- `AsyncLocalStorage` support for handlers, using `enableALS` flag decorator.
- `CORS` validation middleware.

### Changed

- contextId as optional on constructor

## [1.0.13] - 2025-10-23

### Fixed

- getTargetKey for different classes with the same name

## [1.0.12] - 2025-10-23

### Added

- Connector general options

## [1.0.11] - 2025-10-23

### Fixed

- Connector start and stop methods wrapper
- Freeze instances

## [1.0.10] - 2025-10-22

### Fixed

- Connector core templates
- Program module privacity
- Metadata cleanup

### Added

- Server bootstrap
- Additional exported modules

## [1.0.9] - 2025-10-20

### Fixed

- Exporting additional classes

## [1.0.8] - 2025-10-20

### Fixed

- Connector and database connector structure

## [1.0.7] - 2025-10-17

### Fixed

- Connector default configuration

## [1.0.6] - 2025-10-17

### Added

- Exporting additional types

## [1.0.5] - 2025-10-17

### Fixed

- Decorators types

## [1.0.4] - 2025-10-15

### Fixed

- Fix stop and start methods for multiple servers

## [1.0.3] - 2025-10-15

### Removed

- Reserved ports

### Added

- Already addr in use error

## [1.0.2] - 2025-10-15

### Fixed

- Multiple server creation

### Added

- Reserved ports and names

## [1.0.1] - 2025-10-13

### Added

- Some modules to export

### Fixed

- Global types to local types

### Changed

- Readme.md

## [1.0.0] - 2025-10-13

### Added

- REST Servers: Efficient and scalable REST API server management for seamless communication.
- GraphQL Servers: Easily build and manage GraphQL endpoints for flexible data querying.
- Socket Servers: Real-time communication via WebSockets for interactive, event-driven applications.
- Interactors and Connectors: Built with design patterns like the Adapter pattern, ensuring clean
  separation of concerns and flexibility when integrating with external services and APIs.
