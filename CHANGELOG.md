# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2026-08-30

### Added

- **`GraphQLClient.query()` now throws `GraphQLClientError` when a `200 OK` response carries a
  GraphQL-level `errors` array.** A query that fails at the GraphQL layer rather than the HTTP layer
  previously returned normally with an invalid or absent `data` — `RestClient`'s own `!response.ok`
  check never fires for a `200` response, and the GraphQL-over-HTTP spec allows an `errors` array
  alongside (or instead of) `data` at that same status. The real errors survive structured on the
  thrown error, readable via `GraphQLClientError.graphqlErrors` (see the new `GraphQLErrorLike`
  type, also exported, for a single error's shape). `GraphQLClientError` extends `RestClientError`,
  so it still integrates with the same logging/serialization conventions every other Zanix error
  does; it reports `realHttpStatus === 200` for this case — a caller distinguishing it should read
  `graphqlErrors`, not `realHttpStatus`.

- **`RestClient.http.*` and `GraphQLClient.query()` accept a `metadata: true` option to get
  `{ data, reloadMetadata }` back instead of the plain return value.** `reloadMetadata` (the new
  `ReloadMetadata` type) is a ready-to-replay descriptor of the call — `endpoint`, `method`,
  `headers`, `body` — meant to be forwarded through a page's own `loader` and replayed client-side
  (typically by a Comet re-issuing the same call) with no REST/GraphQL-aware logic of its own.
  `headers` is never a blind copy of what the call actually sent: only the names allowlisted by the
  new `protected reloadableHeaders` (default: `['content-type']`) are copied, so a
  credential-carrying header (`Authorization`, an internal API key) never reaches this far. Omitting
  `metadata` (the default) keeps today's plain, unwrapped return value unchanged.

- **`GraphQLClient`'s constructor accepts a new `schemaApplication` option** (see the new
  `GqlClientOptions` type) — a build-time-only hint naming which local Application's schema
  (`getSchema()`, below) this client's queries should be checked against by `zanix space build`'s
  GraphQL check step (`@zanix/cli`); never read here, at runtime. Omit it to try the default
  Application, or set it to `'external'` to mark the client as talking to a schema outside this
  project's own composition (checked for syntax only, never against a local schema).

- **`getSchema(application?)`, exported from `@zanix/server/graphql`** — read-only introspection
  over the `GraphQLSchema` this process actually compiled for an Application: the same object
  `defineSchema` last built for it, including through a `WebServerManager.refreshRoutes()` dev-mode
  rebuild. A pure cache read — never triggers a compile of its own, safe to call any number of
  times. Returns `undefined` if no GraphQL server has been created for that Application yet in this
  process.

- **`WebServerManager.refreshRoutes(id)`** — recompiles an already-`create()`d server's own
  route-table handler from `ProgramModule`'s current route registry and swaps it into its port's
  shared `HandlerBox`, atomically, with zero downtime and without touching the real `Deno.serve()`
  listener. Previously, `getMainHandler` only ever compiled a server's route table once, at
  `create()` time — a route registered afterward (a dev server discovering a newly added page file,
  for instance) had no way to reach an already-serving handler short of restarting the whole
  process. A no-op for a server built with a fully custom `options.handler` (nothing framework-owned
  to recompile) or for an id that was never registered/already `unmount()`-ed. A
  `previousDispatchKey` rotation-window entry (see `create()`'s own remarks) is deliberately left
  untouched — a short-lived, frozen snapshot for a manual id-rotation window, not something a route
  registry change should reach into.

- **`ProgramModule.routes.hasRoutesForTarget(Target, type?)`** — a plain, read-only check for
  whether a decorated class currently owns at least one live route entry. Lets a caller with its own
  "did I already register this class" bookkeeping (a dev server's re-import cache, for instance)
  tell a still-correct registration apart from one removed by something else since (an unrelated
  `unregisterRoutes`/`unregisterApplicationRoutes` call). Returns `false`, never throws, for a
  `Target` that was never registered or was fully removed since.

### Fixed

- **A `socket` server with gzip enabled crashed every WebSocket handshake from a real browser** —
  `TypeError: Response with null body status cannot have body`. A WebSocket upgrade response
  (`Deno.upgradeWebSocket()`, status `101`) has `body === null` by Fetch API spec, but
  `gzipResponseFromResponse` (`utils/gzip.ts`) never checked for that before constructing a new
  `Response` from it — `maybeGzip` always returns SOME body value, even an empty one, and the Fetch
  API forbids constructing any null-body-status response with a body at all, regardless of size. A
  real browser's WS handshake request ordinarily carries `Accept-Encoding: gzip` like any other
  request, so this fired on the very first connection. Fixed by returning a null-body response
  untouched, the same guard its sibling `gzipStreamingResponse` already had.

- **`routeProcessor` (`helpers/routes.ts`) recomputed and re-logged EVERY route on every call,
  including a `WebServerManager.refreshRoutes()` rebuild where nothing about that route actually
  changed** — real, visible log spam (and wasted recompute of `mountedPath`/`fullPath`/`regex`/param
  extraction) on every dev-mode file save once a file watcher started calling `refreshRoutes()` only
  for the pages that actually needed it. Fixed with a `WeakMap`-keyed memoization cache, keyed by
  each route's own registry record object reference (never by path/method string):
  `RouteContainer.defineRoute` only ever writes a brand-new record object when a route is
  (re)registered, so an unchanged route's record keeps the exact same reference across a rebuild —
  free, no-new-signal proof that nothing needs recomputing or relogging for it — while a genuinely
  changed route's new record object is always a cache miss and gets reprocessed and relogged
  normally. Purely internal to `routeProcessor`; no signature changed anywhere.

## [4.0.0] - 2026-08-25

### Changed (BREAKING)

- **GraphQL's own `ZanixResolver`/`Resolver`/`Query`/`Mutation`/`Request` (previously `GQLRequest`
  at the root) moved to a new `@zanix/server/graphql` subpath — no longer exported from the root `.`
  barrel (`mod.ts`).** The root barrel's single `exports: {"."}` entry bundled GraphQL's handler
  code together with every other base class/decorator, so any consumer touching the root for any
  reason (a REST-only app, `@zanix/datamaster`'s base connector classes) forced
  `nodeModulesDir: "auto"` to npm-install-materialize the real `graphql` (`graphql-js`) package,
  whether or not that consumer ever builds a GraphQL server. Migration: replace
  `import { ZanixResolver, Resolver, Query, Mutation, GQLRequest } from '@zanix/server'` with
  `import { ZanixResolver, Resolver, Query, Mutation, Request } from '@zanix/server/graphql'` (the
  decorator formerly aliased `GQLRequest` at the root is just `Request` at its own subpath — no
  rename needed there since nothing else in that subpath collides with the name). See
  `docs/handlers.md`'s "GraphQL" section and `src/modules/infra/handlers/graphql/mod.ts`'s own doc.

### Added

- **`ZanixCacheProvider`'s `redis`/`memcached` convenience getters can now be typed as a concrete
  connector class, declared once at the class level, instead of resolving to the loose
  `ZanixCacheConnectorGeneric<'redis' | 'memcached'>` default** (whose own `getClient` falls back to
  `CoreCacheTypes<K>['redis' | 'memcached']` — `Promise<unknown>`/`object`, see that type's own
  doc). One new optional, object-shaped generic parameter, `Connectors` (see the new
  `ZanixCacheProviderConnectors` type, `typings/targets.ts`) — the same style `CoreModules` already
  uses elsewhere in this package, one key per shortcut getter instead of one class-level generic
  parameter per cache backend, so a future backend only needs a new key, not a new generic parameter
  — defaulting to today's loose type (fully backward compatible — an existing
  `ZanixCacheProvider<T>` subclass is unaffected):
  ```ts
  class MyCacheProvider
    extends ZanixCacheProvider<MyModules, { redis: ZanixRedisConnector<MyKey, MyValue> }> {
    async example() {
      const client = await this.redis.getClient() // RedisClientType, not unknown
    }
  }
  ```
  Only the keys you actually narrow need declaring — omitting `memcached` above leaves
  `this.memcached` at the loose default. A `memcached` convenience getter (mirroring `redis`/
  `local`, previously missing) is added at the same time — `memcached` has the same "real external
  client, no concrete type by default" shape `redis` does. `local`/`custom` are unaffected:
  `local`'s client (`CoreCacheTypes<K>['local']`, an in-process `Map`) is already concrete with
  nothing external involved, and `custom` is intentionally `any` (a user-defined slot) with no
  convenience getter to begin with. An equivalent, no-code-change alternative already available
  today for any of these: declare the connector via the `CoreModules` generic on the owning
  `Interactor`/`Provider` and resolve it with `this.connectors.get('cache:redis')` instead of
  `this.redis` — see `ZanixConnectorsGetter`'s own doc.

### Fixed

- **`typings/program.ts`'s inline `import type { RedisClientType } from 'npm:redis@^5.9.0'`** — a
  literal npm specifier embedded directly in source, invisible to a `deno.jsonc` grep, reached from
  nearly every corner of this package (`typings/targets.ts`, `typings/decorators.ts`,
  `typings/router.ts`, `modules/program/mod.ts`, and therefore the root barrel). Replaced with a
  plain `Promise<unknown>` — `CoreCacheTypes<K>['redis']` never needed the real shape (it's only
  ever `ZanixCacheConnector.getClient`'s default generic parameter, always overridden by a real
  Redis connector with the real `RedisClientType` imported directly from `redis`). Un-breaks the new
  `@zanix/server/graphql` subpath above, which would otherwise have transitively re-introduced the
  same `redis` materialization via `typings/program.ts`.

## [3.4.0] - 2026-08-23

### Added

- **`UncaughtErrorMonitor`** (`uncaughtErrorRateCheck`, `resetUncaughtErrorHealth`) — tracks
  `attachGlobalErrorHandlers`'s two uncaught-error codes (`UNCAUGHT_ERROR`/
  `UNHANDLED_PROMISE_REJECTION`) against a configurable `threshold`/`windowMs`, the same
  constructor-as-config-setter idiom `ErrorLogThrottle` already establishes, and reuses that exact
  same pluggable store (`errorLogThrottleStore`, now exported) under a synthetic key that can never
  collide with a real HTTP status. `uncaughtErrorRateCheck` is a ready-made `HealthCheckFn` — plug
  it into `HealthOptions.checks` to make `/ready` report `degraded` once the threshold is crossed;
  never wired in automatically. `exitOnThreshold` (default `false`) additionally drains
  (`WebServerManager.stopAll()` + `closeAllConnections()`) and calls `Deno.exit(1)` once crossed, so
  an external supervisor can restart the process instead of it running indefinitely in a possibly
  corrupted state.
- **`WebServerManager.stopAll()`** — stops every server this instance currently has registered,
  without the caller tracking its own `ServerID[]` across every `create()` call.
- `attachGlobalErrorHandlers(self, options?)` — new optional second parameter,
  `AttachGlobalErrorHandlersOptions.onUncaughtErrorThresholdExceeded`, the drain hook
  `UncaughtErrorMonitor`'s `exitOnThreshold` uses internally.

### Fixed

- **`attachGlobalErrorHandlers` (the global `onerror`/`unhandledrejection` handlers behind
  `ErrorLogThrottle`'s logging) installed as a side effect of merely importing `@zanix/server` —
  even for a consumer that only imported a type, a decorator, or a connector, and never started a
  server.** Every value import from the root `mod.ts` transitively evaluated `webserver/mod.ts`,
  which ran `attachGlobalErrorHandlers(self)` unconditionally at module-eval time. Moved to
  `WebServerManager`'s own `#start()`, guarded to install at most once, the first time a server
  actually binds a real listener — `create()` alone (registering a dispatch entry without starting
  it) doesn't trigger it either. A bare import, or a `create()`-only caller, now gets no global
  handlers installed on its behalf.

- **An ordinary (non-catch-all) `:param`'s own VALUE — the actual URL segment a caller sent — was
  silently lowercased before reaching `ctx.payload.params`, even though the param's own NAME/KEY was
  already correctly case-preserved (the `3.2.0` fix, "A route param's own NAME was silently
  lowercased", above/earlier in this file). This is the other half of that same underlying gap (name
  vs. value): a `GET /triggers/:serviceId/:model` route hit with `/triggers/Billing/Invoice`
  returned `params.model === 'invoice'`, not `'Invoice'`, silently corrupting any lookup keyed on
  the real value (e.g. a case-sensitive model/resource name). Root cause: `getMainHandler`
  (`webserver/helpers/handler.ts`) only ever computed a case-preserved mirror of the request path
  when the matched route declared a catch-all (`:name*`) — every ordinary `:param` read its value
  straight from the always-lowercased regex match instead. Fixed by extending that same existing
  mechanism (the catch-all's own `match.indices`-based offset-slicing into a case-preserved raw
  path, already used for the catch-all's value) to run for ANY route with at least one param,
  ordinary or catch-all — `payloadAccessorDefinition` (`utils/context.ts`) treats every param
  identically regardless of `catchAllParam`, slicing each one's value out of the same case-preserved
  raw path uniformly. Route MATCHING stays entirely case-insensitive: `/Triggers/Billing/Invoice`
  still matches a route registered as `/triggers/:serviceId/:model` — only the EXTRACTED VALUES are
  case-preserved, not which route matches. `getMainHandler` passes this raw path as a
  lazily-evaluated thunk, invoked at most once, only on the first actual read of
  `ctx.payload.params` — a route with zero params never reaches this at all, and a route with params
  whose handler never reads them pays nothing extra either.

## [3.3.0] - 2026-08-22

### Added

- **A registered REST route now persists which RTO(s) it validates against, as static metadata,
  reachable through a new public `ProgramModule.routes` accessor.** `RestRouteEntry.rto` carries the
  exact `Body`/`Params`/`Search` RTO class(es) passed to the route's own method decorator, captured
  once at registration time; `undefined` for a route declared with none. `ProgramModule.routes` (new
  — `ZanixRoutesGetter`) exposes exactly one method, `getRoutes(type)`: read-only introspection over
  persisted route metadata, never the underlying `RouteContainer`'s own mutation methods
  (`defineRoute`/`removeRoutesForTarget`/etc.), which stay framework-internal. Purely for a
  build-time consumer that needs to introspect the registry without invoking anything (e.g. an
  OpenAPI generator) — the runtime request-validation pipeline is unaffected, since it already
  captured `rto` independently in its own validation-pipe closure. See
  [Handlers: Static route metadata](docs/handlers.md#static-route-metadata).
- `getPublicErrorResponse(error, contextId?)` — exported narrowing function behind the security fix
  below; also usable directly when you need that same client-safe shape without building a full
  `Response`/JSON string around it. See [Error Handling: Utilities](docs/errors.md#utilities).
- `RestClient` now throws a new exported `RestClientError` (a narrower `HttpError` subclass) for
  every failed call, with a `realHttpStatus` getter reading the real upstream status out of its
  structured `meta` — see the corresponding entry under Fixed for the behavior change this replaces.
- `SERVER_ID_SUFFIX`/`SERVER_ID_PREVIOUS_SUFFIX` (the `_SERVER_ID`/`_SERVER_ID_PREVIOUS`
  env-var-name suffixes `resolveApplicationServerId`/`resolvePreviousApplicationServerId` already
  used internally), `PORT_ENV`/`getPortEnvKey(type)` (the `PORT`/`PORT_<TYPE>` env-var naming
  pattern `WebServerManager` already used internally), and `SSL_KEY_PATH_ENV`/`SSL_CERT_PATH_ENV`
  are now exported, so a consumer that needs to read/set these env vars programmatically has one
  documented source instead of re-hardcoding the literal strings. `SocketEvents` (the event-handler
  names `ZanixWebSocket`'s own `socket` accessor omits) is now exported for the same reason.

### Changed

- `@zanix/utils` (and its `logger`/`helpers`/`validator`/`regex`/`errors`/`types`/`workers`
  subpaths) is now pinned to `^3.0.0`, up from `^2.6.1` — required for `ErrorOptions.exposeMeta`/
  `exposeCause` (the new default-narrowing behavior below) and the `deno-zanix-plugin` lint plugin
  pin fix. The unused `graphql-jit` dependency is also dropped — it was never actually wired into
  the GraphQL handler.

### Fixed

- **`httpErrorResponse`/`getSerializedErrorResponse` no longer serialize an error's full internal
  representation (every enumerable property, unrestricted) into the response body sent to an
  external caller.** They now go through the new `getPublicErrorResponse`, which narrows the body to
  an explicit allowlist (`id`/`contextId`/`name`/`message`/`code`/`status`/`userMessage`) and only
  includes `meta`/`cause` when the error itself opts in via `@zanix/errors`'
  `ErrorOptions.exposeMeta`/`exposeCause` — so an error's `meta` (often internal debugging context:
  a connector name, a driver's raw error, an internal id) is no longer leaked to clients by default.
  `stack` is never included in a client response regardless of any flag. The internal-only logging
  path (`logAppError`) is unaffected — it still receives the full, unrestricted representation,
  since a log needs the complete picture regardless of what's safe to expose externally.
- **`httpErrorResponse` now defaults to `500`, not `400`, when an error carries no explicit
  `status`.** `HttpError` is the only class with an explicit `status`; a thrown `ApplicationError`/
  `InternalError`/`PermissionDenied`, or a native `Error`/unknown value that reached this far
  unwrapped, is far more often a genuine server-side fault than a client mistake (a real client
  error is normally modeled with `HttpError` and its own explicit 4xx status already) — defaulting
  to `400` previously reported those as the caller's fault instead, masking a real server-side bug
  in both the response a caller sees and in any monitoring keyed off the status code.
- `deno lint`'s own `@zanix/utils` plugin (`deno-zanix-plugin`) is now version-pinned (`^3.0.0`),
  matching every other `@zanix/utils` import in `deno.jsonc` — it used to resolve unpinned, so a
  lint run could silently pick up a newer, unreviewed plugin version.
- **`corsGuard()`'s default configuration no longer reflects an arbitrary request `Origin` back with
  `Access-Control-Allow-Credentials: true`.** With `origins` left at its `'*'` default (i.e. no
  explicit allowlist configured) and `credentials: true` (also the default), the guard now responds
  as a non-credentialed `Access-Control-Allow-Origin: *` policy instead of echoing the caller's
  `Origin` — so an app that never configures `cors` no longer grants every site credentialed
  cross-origin access. Configuring `origins` explicitly (array, `RegExp`, or function) is unaffected
  and continues to reflect the matched origin with credentials as before.
- **`corsGuard()`'s default configuration no longer accepts a cross-site WebSocket `Upgrade`.** With
  `origins` left at its `'*'` default and `type: 'socket'`, the guard now only accepts a request
  whose `Origin` matches the server's own — closing the cross-site WebSocket hijacking (CSWSH) gap a
  same-origin-only socket app would otherwise be exposed to without configuring `origins`
  explicitly. HTTP requests, and any socket server that configures `origins` explicitly (array,
  `RegExp`, or function), are unaffected.
- **A request body is now capped at 1 MiB by default (`ServerOptions.maxBodyBytes`, in bytes).** A
  JSON or `application/x-www-form-urlencoded` body over the limit is rejected with
  `413 Payload
  Too Large` — checked against `Content-Length` up front when present, and against
  the number of bytes actually read otherwise, so a request with no (or an understated)
  `Content-Length` can't bypass the cap by streaming past it. Configure `maxBodyBytes` to raise,
  lower, or (with `Infinity`) remove the cap.
- **A GraphQL request is now validated before it's executed (`ServerOptions.graphqlValidation`).**
  `getGraphqlHandler` runs `graphql-js`'s own `validate()` — `specifiedRules` plus a query-depth
  limit — before ever reaching a resolver; a query that fails validation gets a `400` with a
  standard `{ errors: [...] }` body instead of running. `graphqlValidation.maxDepth` (default `10`)
  rejects a query whose real selection depth exceeds it, following fragment spreads to their
  target's own depth rather than counting a spread as one level — closing off deep/exponential
  nesting (via fragment reuse) as a memory/CPU exhaustion vector. `graphqlValidation.introspection`
  (default `true`) can be set to `false` to reject `__schema`/`__type` introspection queries
  outright, for a server that shouldn't expose its schema.
- **`WebServerManager` no longer silently falls back to plain HTTP on an incomplete or unreadable
  SSL configuration.** Previously, setting only one of `SSL_KEY_PATH`/`SSL_CERT_PATH`, or setting
  both but pointing at a file that doesn't exist or isn't readable (permissions, a typo'd path, an
  unmounted volume), was indistinguishable from the intentional "no TLS configured" case — the
  server would just start over plain HTTP with no warning. The constructor now throws an
  `InternalError` for any of those cases, naming the affected env var, its path, and why the read
  failed (missing vs. permission-denied vs. other). Leaving BOTH vars unset is unchanged — that
  remains the valid, silent "serve plain HTTP" default.
- `@Connector()`'s and `@Provider()`'s object-argument overload JSDoc still documented the option as
  `options.type`, stale since the field was renamed to `slot` on `ConnectorDecoratorOptions`/
  `ProviderDecoratorOptions` (deliberately, per that type's own comment: it's only ever a real
  registration key for a core slot). The `@param` tags now read `options.slot`, and the provider
  one's type annotation is corrected from `CoreProviders` to the field's real type, `ProviderTypes`.
- **`RestClient` no longer reports every failed call as a `BAD_REQUEST` (400), and no longer wraps
  an already-well-formed error in a second, less specific layer.** It now throws the new
  `RestClientError` defaulting to `BAD_GATEWAY` (502) — `RestClient` itself has no domain knowledge
  of whose fault a non-2xx upstream response or a transport-level failure (DNS, timeout, connection
  refused) is, so "my dependency failed" is the honest default, not "you sent something wrong". The
  real upstream status/body survive structured in `meta.upstreamStatus`/`meta.upstreamStatusText`
  (readable directly via `RestClientError.realHttpStatus`) instead of being buried in the message
  string, for whichever caller has the context to reclassify.
- The `'cache:memcached'` core connector slot's own `key` field was recorded as `'cache:local'`
  instead of `'cache:memcached'` in `ConnectorCoreModules`'s seed data — corrected; unrelated to the
  registry's own casing rename (`ConnectorCoreModules`/`ProviderCoreModules` are now
  `connectorCoreModules`/`providerCoreModules`, internal-only, no public export affected).
- A custom `onError` handler (`ServerOptions.onError`) that itself throws while handling an error is
  now logged (with both the original error and the handler's own failure) instead of silently
  swallowed — the server still falls back to the default error response either way.

## [3.2.1] - 2026-08-19

### Fixed

- **A `postBoot`/`lazy` connector whose `initialize()` fails no longer permanently breaks for the
  rest of the process's lifetime.** `ZanixConnector` (`connectors/base.ts`) now retries
  `initialize()` every `retryInterval` until `timeoutConnection` elapses (the same knobs
  `ConnectorAutoInitOptions` already documented, but which previously only governed post-ready
  `isHealthy()` polling) before giving up — so a connector whose backing service isn't reachable at
  the exact instant it's initialized (e.g. a container startup race, for `postBoot`) gets a real
  chance to recover instead of failing once and requiring a manual restart once the dependency comes
  back. Deliberately scoped to `postBoot`/`lazy` only — nothing else is positioned to retry those.
  `onSetup`/`onBoot` still fail on the first attempt: both run before the server starts serving, so
  a failure there already aborts boot, and an orchestrator's own restart policy (where configured)
  is the appropriate retry mechanism at that point, not an in-process one that would only delay the
  fail-fast signal it needs.
- **The same connector-initialization failure no longer gets logged more than once.** `isReady`
  rejecting was being observed, unhandled, by more than one independent consumer at once
  (`instanceFreeze`, `utils/targets.ts`'s `connectorModuleInitialization` propagating uncaught out
  of `targetInitializations('postBoot')`, `webserver/health.ts`'s `/ready` handler), each surfacing
  as its own separate "An unhandled rejection error has been detected" log — visibly, as the exact
  same error `id` repeated three times over. Fixed at the source in three places: `logAppError` now
  stamps the error object `_logged: true` after logging it, so any later re-encounter of that exact
  same error instance is silently skipped (see its own doc); `instanceFreeze` now `.catch()`es the
  rejection instead of leaving it dangling; and `targetInitializations('postBoot')` no longer
  propagates a target's failure uncaught to its caller — a connector failure is already self-logged,
  and anything else is logged once here as a safety net. `onSetup`/`onBoot` keep their original
  fail-fast behavior (both run before the server starts serving, so a failure there should still
  stop boot).
- **`buildReadinessHandler` (`webserver/health.ts`) no longer 500s on every single `/ready` poll
  once a connector has permanently failed to initialize.** `connector.isReady` rejects rather than
  resolving to `false` in that case (see `ZanixConnector`'s own doc) — `/ready` now reports that
  connector as a normal failing (`degraded`, `503`) check instead of throwing.

### Changed

- **The internal `_Zanix`-prefixed synthetic subclass name a core connector is auto-registered under
  (e.g. `_ZanixRabbitMQConnector`, plus a decorator-transpilation numeric suffix) no longer leaks
  into `ZanixConnector`'s own error logs.** Both the "Failed to initialize connector ..." message
  (`connectors/base.ts`) and every `meta.connectorName` (that same error's own `meta`, and the
  health-check-timeout error in `connectorModuleInitialization`, `utils/targets.ts`) now resolve
  through a new protected `coreDisplayName(label?)` method instead of the raw
  `this.constructor.name` — the message text passes the explicit `'from core'` label, while both
  `meta.connectorName` fields call it with no label, falling back to `` `${connectorKey} core` ``.
  Every core connector package (`@zanix/asyncmq`, `@zanix/datamaster`) previously had to reimplement
  this exact same `name.startsWith('_Zanix') ? label : name` check itself just to keep it out of ITS
  OWN log lines, which did nothing for `@zanix/server`'s own logging. See `coreDisplayName`'s own
  doc for the full contract; those packages' local reimplementations should switch to calling it
  instead once they depend on this version.

- **Route matching now scans only the routes whose HTTP method the request actually uses.**
  `findMatchingRoute` is a linear scan, and because a route's storage key (and therefore its
  compiled regex) ends in its own method suffix, a `GET` was running the regex of every `POST`,
  `PUT`, `PATCH` and `DELETE` route in the application before reaching its own — work that could
  never match. `getMainHandler` now splits both `:param` tables into one bucket per method
  (`bucketRoutesByMethod`, `utils/routes.ts`), once at construction time, never per request. No
  public API changed, `routeProcessor`'s output is untouched, and 404/405 handling is unchanged: a
  method with no bucket resolves to an empty table, which matches nothing — exactly what scanning
  the full table already did. Measured end to end, both variants interleaved in one process:
  **1.79x** on a 50-route/5-method table and **2.37x** on a 200-route/5-method one, for the whole
  request, and within noise on a single-method table (one extra property lookup). New benchmark
  scenarios cover both shapes, so a future routing change has to prove it helps the mixed table
  without hurting the single-method one.
- **The guard and interceptor phases no longer pay two wasted microtask ticks per middleware.** Both
  iterated an array of FUNCTIONS with `for await`, which awaits each ELEMENT before calling it — one
  tick spent awaiting a function — and then unconditionally awaited the result, ticking again even
  for the synchronous middlewares this package ships (`corsGuard` and `cookiesGuard` are both sync).
  Now an indexed loop awaits only what is actually thenable (checked via `.then`, so a cross-realm
  promise still behaves identically). Order, short-circuit behavior and header-merge semantics are
  unchanged. Measured: **1.23x** faster guard phase with only the built-in guards, **1.36x** with
  three application guards, **1.21x** on the interceptor phase with three interceptors. `mainGuard`
  also skips building an entries array for a guard that set no header at all, which is the common
  case.

  Two plausible-sounding hypotheses about this same phase were measured and REFUTED before the real
  cost was found, and are recorded here so nobody re-attempts them: allocating the guard-header
  `Headers` costs **0.040 µs**, and building the three `interactors`/`providers`/`connectors`
  getters costs **0.007 µs** — V8 optimizes them away entirely. Making those getters lazy via
  `Object.defineProperties` would have cost **1.181 µs**, roughly **30x more than the work it was
  meant to avoid**. See `docs/benchmarks.md` for the full record, including why the request
  lifecycle itself was measured and deliberately left alone.

### Added

- **Backend-only benchmark suite (`src/@tests/benchmarks/`)** — `Deno.bench` coverage of the
  operations that actually make up this package's request runtime: per-request context setup
  (context id, body parsing, the lazy query/param accessors, cookie parsing and filtering, the
  `enableALS` scope), routing (boot-time `routeProcessor` compilation and per-request
  `findMatchingRoute` matching, both at 5/50/200 routes, plus catch-all and the full-scan miss the
  404 path takes), the guard/pipe/interceptor pipeline with zero and with three declared
  middlewares, response building (string / `Response` / JSON at three payload sizes, error
  responses, gzip, the health endpoints), the full in-process `Request` → `Response` lifecycle, the
  GraphQL server type (schema assembly plus the request handler for queries, a mutation, and list
  results at three sizes), and the WebSocket handler's per-message reply path and non-upgrade
  rejection. The WebSocket **upgrade** itself is deliberately absent: `Deno.upgradeWebSocket` needs
  a real hijackable connection, so benchmarking it would measure the kernel's socket path rather
  than this package — it stays covered functionally instead. The 12 GraphQL/WebSocket scenarios ship
  as informational only: their baselines were recorded in a session where the machine benchmarked at
  ~40% of the throughput the other 59 were recorded at, which is a real measurement but not a
  reference worth thresholding against. No thresholds live in the benchmarks by design — they exist
  to produce baseline evidence and to compare versions. Self-contained by construction: nothing in
  the suite opens a socket, touches the filesystem, reaches a database or depends on any service
  outside this package, so a measured number can only move when this package's own code moves. New
  `deno task bench`, scoped by a `bench.include` block in `deno.jsonc`, which runs one bench file
  per process — `Deno.bench`'s harness in Deno 2.9.5 accumulates across benchmarks within a process
  and reproducibly exhausts the V8 heap partway through a single combined run. For the same reason,
  15 of the 71 scenarios (every full-request-lifecycle one, plus the largest JSON payloads) are
  excluded from the `Deno.bench` layer via `Scenario.skipDenoBench`: `Deno.bench` cannot run them at
  all, while this suite's own sampler runs each 100,000 times in ~164 MB. They lose their
  `deno bench` row, not their coverage — the regression gate measures, thresholds and reports every
  one of them, and `deno task bench:baseline` prints them all as a table.
- **`benchmarks.yml`** — a report-only workflow, on `workflow_dispatch` and a weekly schedule. It
  runs `deno task bench` and a 3-run `deno task bench:baseline`, and publishes both tables to the
  run's job summary. It deliberately does NOT run the regression gate: that already runs inside
  `deno test` in `publish.yml`, which stays the single place a benchmark number can fail a build.
- **Performance regression gate (`src/@tests/performance/`)** — a real test, running inside the
  ordinary `deno test` (also available alone via `deno task test:perf`), that fails when a critical
  request-path operation drops below a recorded floor. It runs in two stages. First a **validity
  gate**: a benchmark that silently stops doing its job does not fail, it gets FASTER, so each
  scenario's own return value is asserted for a deterministic property (a status code, a parsed
  field, a source-chunk count) before any timing is trusted. Then the **throughput floors**: 48 of
  71 scenarios are gated, each with a margin derived from its own measured spread — 35% where the
  observed run-to-run drop stayed within 15%, 45% where it reached 15–30%, both widened by the
  measured 4–19% penalty the gate pays for running as one test among ~480 others rather than in a
  fresh process. Scenarios whose spread is wider than the regressions a floor could catch, whose
  measurement is dominated by benchmark harness overhead, or which measure a Deno primitive rather
  than this package, are measured and reported but deliberately NOT gated. A scenario that comes in
  under its floor is re-measured once before being called a regression, which removes the
  single-scenario false failures a busy machine otherwise produces without weakening any floor.
  Floors are also scaled, in the same run, by how fast the machine executing them actually is —
  measured as the median drift of four `control:` scenarios that contain no `@zanix/server` code at
  all, so the scaling can relax a floor for a slow or contended agent but can never absorb a real
  regression (verified end to end: a 3× slowdown injected into `contextId()` is caught at the same
  machine speed at which the unmodified code passes). Below 35% of the reference machine's speed the
  gate reports instead of judging, rather than pretending a verdict it cannot support. Baselines
  come from ten independent recording runs on a documented reference machine;
  `deno task bench:baseline` re-measures and prints a paste-ready table. `ZANIX_PERF_GATE=off`
  downgrades the throughput floors to a report on a machine too slow or too contended for them,
  leaving the machine-independent validity assertions active.
- **Streaming-SSR time-to-first-byte coverage** — the one property the existing gzip throughput
  benchmarks are structurally incapable of detecting, since they drain the whole body and so would
  not move at all if a response stopped streaming. `gzipStreamingResponse` and
  `gzipResponseFromResponse` are now measured for time to FIRST chunk against a synthetic streamed
  response, and — more importantly — the difference between them is asserted exactly, as the number
  of source chunks each pulls before its first byte reaches the consumer (3 vs. 65). That count is
  deterministic, so it gates; the timings that quantify it stay informational.

## [3.2.0] - 2026-08-15

### Added

- **`GUARD_HEADERS_LOCALS_KEY`** — the `ctx.locals` key `mainInterceptor` now stashes the
  fully-accumulated guard headers under, right before invoking the handler, and deletes again once
  it returns. Lets a handler that needs to know what a guard already decided for some header — not
  just whether its OWN response already has that header — make a fully-informed choice about its own
  precedence, instead of relying solely on `mainInterceptor`'s own generic, two-state merge
  (`overwrite: false`, see the `mergeHeaders` entry below), which can only ever distinguish "the
  handler's response already has it" from "it doesn't." That's not expressive enough for a handler
  whose own zero-config default would otherwise be indistinguishable from a deliberate choice — the
  real motivating case: `@zanix/space`'s `SpacePageController`, whose built-in nonce-based CSP
  default used to always count as "already set" by the time this merge ran, permanently preventing a
  guard-registered `cspGuard()` from ever becoming the effective app-wide default it was meant to be
  for a page that configured nothing of its own (see `@zanix/space`'s own CHANGELOG for the full
  three-tier fix this enables: page's own explicit config > guard > the page's own zero-config
  default). Same `ctx.locals`-based "guard state handed to a later stage" pattern
  `PROTOCOL_VERSION_LOCALS_KEY` already establishes, applied here in the other temporal direction
  (read by the HANDLER itself, not by a later interceptor). Defensive: `context.locals` is now
  initialized (`??= {}`) if a caller's own context omits it, rather than assumed. 2 new unit tests
  in `main.test.ts`: the handler reads back the exact same `Headers` instance passed in, and the key
  is genuinely gone from `context.locals` once the handler returns.
- **`GUARD_BLOCKED_HEADERS_LOCALS_KEY`** — the companion `ctx.locals` key, in the OTHER temporal
  direction from `GUARD_HEADERS_LOCALS_KEY` above: a handler may set it, during its own execution,
  to a plain `Set<string>` of lowercased header names `mainInterceptor` must never fill in from a
  guard for that response, no matter what — read back once, right after the handler returns, then
  deleted. Exists for the one case `GUARD_HEADERS_LOCALS_KEY` alone can't express: a handler that
  explicitly decided "no value for this header at all, not mine, not the guard's" (e.g.
  `@zanix/space`'s own `Page({ headers: { csp: false } })`) can't communicate that by simply not
  setting the header itself — an absent header is exactly what `mainInterceptor`'s own merge already
  reads as "please fill this from the guard," the opposite of what's needed here. Filtered out of
  the guard's own contribution BEFORE the merge even runs — never partially applied, never a value
  that has to be stripped back out of the response afterward. Deliberately generic: a plain set of
  header names, no CSP or `@zanix/space`-specific concept anywhere in this package, so any handler
  for any header can use it the same way (see `@zanix/space`'s own CHANGELOG for the real case this
  unblocks — its `frameOptions`/`referrerPolicy`/`noSniff`/... all needed the exact same "explicit
  disable must produce a genuinely absent header" guarantee CSP did). 4 new unit tests in
  `main.test.ts`: a blocked header never reaches the final response at all (verified via `.has()`,
  not just a falsy `.get()`); blocking one header has zero effect on any other guard header still
  merging in normally; blocking a header has zero effect on `Set-Cookie`, which keeps accumulating
  via `.append()` unaffected; and with no blocklist set at all, every guard header still merges in
  exactly as before this mechanism existed.
- **Trailing catch-all route parameter (`:name*`)** — a named param suffixed with `*`, valid ONLY as
  a route's own last segment (`Get('/assets/:path*')` captures `/assets/logo.svg`,
  `/assets/icons/foo/bar.svg`, any depth). A catch-all anywhere but last (`/:path*/foo`) throws
  `InternalError` at ROUTE REGISTRATION time (`RouteContainer.defineTargetRoutes`/`defineRoute`),
  never the first time a request happens to reach it — same fail-fast posture this ecosystem's own
  `validate()`/`normalize()` steps already take. General router capability, not built for any single
  consumer — a static-file/passthrough route is a common need (e.g. `@zanix/space`'s own upcoming
  `assetsDir[]` asset serving) beyond any one package.
  - **Deterministic precedence, independent of registration order**: exact/static routes win, then
    ordinary `:param` routes, then catch-all routes — always, regardless of which was registered
    first. `routeProcessor` now files `:param`-normal and catch-all routes into two separate tables;
    `getMainHandler` tries them in that fixed order. Example: with
    `GET /files/readme`/`GET /files/:name`/`GET /files/:path*` all registered, `/files/readme`
    resolves to the exact route, `/files/foo` to `:name`, `/files/foo/bar` to `:path*`.
  - **Case-sensitivity, resolved at the router level, not left to each consumer**: every OTHER route
    (exact or `:param`) still matches case-insensitively, completely unchanged. Only a catch-all's
    OWN captured value preserves the request's original casing — `GET /assets/Logo.svg` on a route
    `Get('/assets/:path*')` gives `ctx.payload.params.path === 'Logo.svg'`, not `'logo.svg'`.
    Achieved by compiling every route regex with the `'d'` flag (adds `match.indices` — per-capture
    `[start, end]` offsets — changes nothing about matching itself) and computing a case-preserved
    mirror of the request path in parallel; those SAME offsets, found against the lowercased match,
    slice the catch-all's own value out of that case-preserved mirror instead. No second match, no
    change to any other param's own value.
  - **No automatic `decodeURIComponent()`** — a catch-all's captured value is exactly the raw
    pathname segment(s), still percent-encoded if the request was, same as any existing `:param`
    already behaves. Decoding, if needed, is the consumer's own responsibility. `%2F` in a request
    is never treated as a path separator by the router (the `URL` parser itself doesn't decode it
    into `/` within `pathname`).
  - A bare prefix with no trailing segment at all (`GET /assets` against `Get('/assets/:path*')`)
    does not match — a catch-all requires at least one segment after it.
  - **Real finding, not router behavior**: a request containing literal `../` segments never reaches
    route matching as such at all — the WHATWG `URL` parser itself resolves `..` during parsing,
    before `pathname` is ever read (confirmed empirically:
    `new URL('http://x/assets/../../etc/passwd').pathname === '/etc/passwd'`). Any traversal safety
    a consumer needs for a captured catch-all value still belongs entirely to that consumer (this
    router makes no filesystem-access decisions of its own), but literal `..` smuggling through the
    route string itself isn't a reachable attack surface here.
  - 25 new tests (`utils/routes.test.ts`, `webserver/handler.test.ts`) covering syntax validation,
    precedence (registration-order-independent), case preservation, multi-segment capture, encoding,
    trailing slash, backward compatibility, and the `URL`-normalization finding above. One
    pre-existing test updated (`pathToRegex`'s own exact-regex-equality assertion) for the new `'d'`
    flag every compiled route regex now carries — matching semantics themselves are unaffected.

- `RequestOptions.client` (`RestClient`) — an optional `Deno.HttpClient` every request issued
  through that `RestClient` instance uses, passed straight through to `fetch()`'s own `client`
  option. Not previously expressible: `RequestOptions` already extends `RequestInit`, but Deno's
  `client` option isn't actually part of the `RequestInit` interface itself (it's layered onto
  `fetch()`'s own overload) so it never carried through implicitly. Lets a `RestClient` (or a
  consumer built on it, e.g. `@zanix/auth`'s `createServiceAuthClient`) present a client certificate
  for mTLS, the same way `Deno.createHttpClient({ cert, key })` already lets a bare `fetch()` do.
- **`server.health`** — `boolean | HealthOptions`, same shape `versionProtocol` already establishes
  (`true`/omitted enables with defaults, an object overrides `path`/`readyPath`/ `checks`, `false`
  disables). Registers `GET /health` (liveness, always a cheap `200`, never runs a check) and
  `GET /ready` (readiness — every registered core connector's `isReady`/`isHealthy`, `200`/`503`)
  automatically, on by default, on every port `bootstrapServers()` ends up hosting real content on —
  `rest`, `graphql`, `socket`, or `ssr` alike, never the sole reason a listener starts. `ssr`'s own
  unprefixed, catch-all (`''`-keyed) dispatch was verified empirically to coexist safely with
  health's exact-match dispatch keys before including it — a real SSR page still resolves at its own
  root path. Registered as raw, top-level, unprefixed dispatch-table entries (not through
  `ProgramModule.routes`), so they stay reachable at the literal path regardless of whatever
  `globalPrefix` the app's own routes use. A consumer's own `@Controller`/`@Get` at the same literal
  path replaces the default entirely, no separate override flag — including for a genuinely
  unprefixed/unanchored dispatch (`ssr` always, or `rest`/`socket`/`graphql` reached directly via
  `WebServerManager.create()`), where the real route is only reachable through the multiplexer's own
  `''`-catch-all handler: detected by checking `ProgramModule.routes` for this Application's own
  route at the exact resolved path, gated to only that unprefixed case (a prefixed/anchored server's
  real routes are never reachable at the bare path regardless of what's registered, so the same
  lookup would risk a false-positive skip there). `checks` each receive a `HealthCheckContext`
  (`providers`/`connectors` getters, the same no-`ctxId` global-resolution shorthand
  `ProgramModule.providers`/`.connectors` already are) to reach any registered provider/connector,
  not just the auto-discovered core ones. Each registered `/health`/`/ready` also logs a `Rest`/
  `Graphql`/`Socket`/`Ssr sever route:` line, same format/level as a real `@Controller` route, so
  it's visible in startup logs like everything else — easy to miss otherwise, since it never goes
  through `ProgramModule.routes`.
  - **Multiple Applications sharing one port — `/health` stays single, `/ready` aggregates by
    Application**: liveness never varies per Application (always the same cheap `{status:'ok'}`), so
    it's still first-claim-wins — only the first Application to reach a port registers it, no
    collision, no duplicate registration. Readiness is different: `/ready`'s response is now
    `{status, shared: {status, checks}, apps: {[application]: {status, checks}}}` — `shared` holds
    the auto-discovered core-connector checks (process-wide infrastructure, not owned by any one
    Application), `apps` breaks out each Application's own `HealthOptions.checks` by name. Every
    Application sharing a port that opts into health now contributes its own `checks` entry — merged
    into the response, never dropped — fixing the previous behavior where the first Application to
    claim the port silently owned `/ready` for every other Application sharing it, and every other
    Application's own `checks` were never even run. `WebServerManager`'s internal `#healthPorts` set
    (liveness-only, first-claim-wins) is now paired with a per-port `#readinessChecksByPort`
    accumulator that rebuilds the merged readiness handler on every `create()` call for that port.
    **Breaking for anyone parsing `/ready`'s JSON body directly**: the previous flat
    `{status, checks}` shape no longer exists — `checks` now lives under `shared.checks` (core
    connectors) and `apps[applicationName].checks` (custom checks), never both flattened together.
  - **Found running a real consumer app, fixed same cycle**: `bootstrapServers({ health: false })`
    (no type named — "auto-discover everything, just skip health") used to silently discover NOTHING
    at all. `hasExplicitServerConfig` (whether the caller named at least one type) was computed from
    `Object.keys(server).length > 0` — `health`, a sibling field on the same object, counted as if
    it were a named type, so every real type failed the "was I named" check. Now computed only
    against the 4 real `WebServerTypes` keys.
  - **Found via review, fixed same cycle**: for a genuinely unprefixed/unanchored dispatch, a
    consumer's own real route at the exact literal `/health`/`/ready` path used to always lose to
    the framework default — the override check only ever looked at the port's own dispatch table
    (`box.current`), never at `ProgramModule.routes`, so it could never see a route that's only
    reachable through the multiplexer's own `''`-catch-all handler in the first place. Fixed by also
    checking the route registry for this Application's own route at the exact resolved path, gated
    to only the unprefixed case (see above).
- `dispatchWorkerTask(fn, options)`: dispatches a task to a worker thread via a one-time
  `WorkerManager` instance or the app's persisted `'worker'` core-provider pool
  (`ZanixWorkerProvider#executeGeneralTask`), selected via `options.mode: 'one-time' | 'persisted'`.
  `'persisted'` falls back to `'one-time'` automatically when the `'worker'` provider can't be
  resolved, so it's safe to request regardless of runtime. Accepts an optional `provider` resolver
  (e.g. `() => this.worker`) so a caller with one already scoped avoids a second, unscoped global
  lookup — deliberately a function, not a resolved value, so a `this.worker` that throws (no
  `'worker'` provider registered) is caught by the same fallback, instead of throwing before
  `dispatchWorkerTask` even runs. Free functions with no `this` omit it and get a global resolution
  instead. See
  [Dependency Injection: Dispatching background work](docs/dependency-injection.md#dispatching-background-work-dispatchworkertask).
- `ZanixWorkerProvider`'s constructor gains an optional third argument, `permissions` — restricts
  what EVERY worker in that provider's own pool may do (`net`/`read`/`write`/`env`/`run`/
  `ffi`/`sys`), forwarded as-is to the underlying `WorkerManager`'s own new `permissions` option
  (`@zanix/utils`). Fixed for the pool's entire lifetime; omit entirely (the default) for unchanged,
  unrestricted behavior. See
  [Dependency Injection: Restricting a ZanixWorkerProvider's own permissions](docs/dependency-injection.md#restricting-a-zanixworkerproviders-own-permissions).
- `RouteContainer.removeRoutesForApplication(application)` /
  `ProgramModule.unregisterApplicationRoutes(application)` — removes every route registered under
  `application`, across every server type. Narrower than the pre-existing `resetExceptApplications`
  (which needs the caller to enumerate every OTHER Application to `preserve`, silently wiping
  anything it forgets): this only ever touches `application`'s own entries, so a caller that only
  knows ONE app's own name (e.g. `@zanix/app`'s hot-uninstall) can call it safely. Metadata-only —
  pair with `WebServerManager.unmount()` to also drop the live dispatch entry an already-bound
  listener is still serving.
- `WebServerManager.unmount(id)` — hot-unmounts one already-`create()`d server's own dispatch entry
  from its port's `HandlerBox`, via the same atomic freeze-and-swap `create()` itself uses (an
  in-flight request still sees either the fully-old or fully-new table, never a partial one). Unlike
  `stop()`, never touches the real `Deno.serve()` listener — a port shared with OTHER
  still-registered servers keeps accepting connections for them, unaffected; requests that used to
  reach `id`'s own routes fall through to the port's own catch-all or a plain `NOT_FOUND`. Known
  limitation: even when `id` was the last server on a shared port, this never closes the real socket
  (would require re-attributing which OTHER server actually bound it) — use `stop()` on the port's
  original owner for a full teardown.
- **`ZanixSsrController`/`@SsrController`** — a fourth handler kind, for server-rendered (`'ssr'`)
  routes. Shares `HandlerGenericClass<Interactor, HandlerContext>` with `ZanixController` (same
  request/response contract); the only difference is which route table `@SsrController` registers
  into. No dedicated SSR-only method decorator — `@Get`/`@Post`/`@Patch`/`@Put`/`@Delete`/`@Request`
  are reused as-is, since they carry no server-type of their own. An unanchored `'ssr'` server gets
  no default `globalPrefix` (a page's URL is its own address, not an API endpoint under a
  namespace), and its `cors.allowedMethods` is fixed at `['GET', 'POST']` rather than
  user-configurable like REST's. See [Handlers → SSR](docs/handlers.md#ssr).
- **`preHandler`** (`BootstrapServerOptions[type].preHandler` / `WebServerManager.create`'s own
  `options.preHandler`) — tried on every request _before_ that server's normal dispatch (its route
  table, or a fully custom `handler`); returning `null`/`undefined` falls through to normal dispatch
  unchanged, a `Response` short-circuits it. For concerns that must intercept requests ahead of
  route matching, on the exact same port/origin as the server's own routes — the reference case is a
  dev-server layered on an SSR server serving build-tool assets before a page route is ever
  considered, something no `guard`/`pipe` can do since those only run once a route has matched. See
  [Handlers → Intercepting requests before dispatch](docs/handlers.md#intercepting-requests-before-dispatch-prehandler).
- **`ProgramModule.unregisterRoutes(Target, type?)`** — removes every route entry registered for a
  specific decorated class reference. A route decorator registers its class exactly once (re-running
  it against the same class collides); this is the escape hatch for tooling that reimports a
  decorated module outside the normal boot cycle (a dev-server reloading a page file after a change)
  so the fresh reimport can register cleanly. See
  [Handlers → Hot-reloading a decorated route](docs/handlers.md#hot-reloading-a-decorated-route).
- `registerApplicationMount(application, prefix)` — registers an Application's mount prefix, the
  piece `routeProcessor` inserts between `globalPrefix` and a route's own `controllerPrefix`/
  `methodPath`. Exported publicly because its intended writer (a package building an
  Application-composition layer, e.g. `@zanix/app`'s `AppContainer`) lives in a separate package
  from `@zanix/server`. An Application that never calls this resolves to no mount prefix, preserving
  existing behavior exactly. See
  [Applications → Mount prefix registration](docs/applications.md#mount-prefix-registration-registerapplicationmount).
- `connectorModuleInitialization(connector)` — the connector `autoInitialize` wait-for-health
  (timeout/retry) routine `targetInitializations` already runs internally for every registered
  connector, now exported so it can be re-run on demand outside the normal boot flow (e.g. after
  manually reconnecting a connector).
- `gzipStreamingResponse(response)` (`utils/gzip.ts`) — gzip-compresses a `Response` by piping its
  body directly through `CompressionStream`, without ever buffering it into memory first (unlike
  `gzipResponseFromResponse`). `bootstrapServers` now uses this internally for every `ssr` response
  (see `### Fixed` below); exported publicly for the same reason its buffered siblings are —
  advanced cases building a streaming response outside the normal request flow. See
  [Utilities → Response compression](docs/utilities.md#response-compression).

### Fixed

- **`mainInterceptor` corrupted any single-value header — most visibly `Content-Security-Policy` —
  into an invalid, comma-joined string whenever a guard set it (`@zanix/space`'s `cspGuard`,
  registered via `defineMiddleware`/`@Guard`) AND a handler's own response already set the same
  header itself (e.g. a page's own default/declared CSP, applied directly inside its handler, never
  through the guard pipeline).** Every guard-accumulated header was merged onto the final response
  via `response.headers.append(key, value)`, unconditionally — `.append()` on an already-set
  single-value header comma-joins the two values (confirmed empirically: `Headers` follows the Fetch
  spec's header-list combining for anything except `Set-Cookie`), and CSP has no defined meaning for
  a comma-joined value (directives are `;`-separated) — real browsers do not enforce it as "both
  policies apply." Fixed generally, not just for CSP: a guard's header now only applies when the
  handler's own response hasn't already set that same header — the handler's value, when present, is
  the more specific, final word and is left untouched; the guard's is simply dropped rather than
  blindly combined into it. `Set-Cookie` is unaffected (still accumulates via `.append()`, the one
  header HTTP allows repeated). The resulting precedence — the **handler/page always wins when it
  sets a header itself; a guard's value only ever applies as the base/default when the handler
  didn't** — matches how `@zanix/space`'s own `defineSpaceApp({ headers })` vs. `Page({ headers })`
  precedence already worked (page > app-wide default), now extended consistently to a
  guard-registered `cspGuard()`/`securityHeadersGuard()` too, for every header they can set, not
  only CSP. 5 unit tests in `main.test.ts` covering: guard header applying as the default when the
  handler set none, a handler's own header applying unaffected when no guard set one, a handler's
  header winning over a guard's own value for the same key (never comma-joined), the same win rule
  holding for a non-CSP header (proving it's general, not CSP-specific), and multiple `Set-Cookie`
  headers still all accumulating correctly. The `Set-Cookie`-vs-everything-else merge rule itself —
  previously duplicated inline in both `mainGuard` and `mainInterceptor`, each with its own copy of
  the same reasoning — is now a single internal `mergeHeaders(target, source, { overwrite })`
  helper, so the two can no longer silently drift apart from each other. `overwrite` is the one real
  difference between the two call sites, kept explicit rather than hidden inside the shared
  function: `mainGuard` passes `true` (last guard wins, accumulating across the whole guard chain),
  `mainInterceptor` passes `false` (the handler's own value, if already set, is never overwritten).
  Purely internal — not exported, no observable behavior change, verified by the same 7
  `main.test.ts` tests passing unchanged before and after.
- **`handlers/graphql/schema.ts` read the project config (`readConfig()`) at _module load_ time**,
  unconditionally — so merely importing `@zanix/server`, for any reason, required a
  `deno.json`/`.jsonc` to already exist in `Deno.cwd()`, even for code paths that never touch
  GraphQL. Root cause of a `@zanix/cli` bug where `zanix new <type>` could silently exit `0` with no
  output and no project created: the CLI's own command registration eagerly imports `@zanix/server`
  (for `zanix space dev`'s real use of `bootstrapServers`), which pulled in this module regardless
  of which subcommand actually ran, throwing in the empty directory every `zanix new` starts from
  (see `@zanix/cli`'s own CHANGELOG for the full chain and the two independent defense layers added
  there). `readConfig()` is now called lazily, inside `defineSchema()`, on first actual use —
  memoized, so no added cost after the first real call. No change to GraphQL's own behavior or
  public contract: same schema-generation tests pass unchanged, plus a new one confirming the config
  value still flows correctly into the generated schema description, and a real (non-mocked)
  subprocess regression importing `@zanix/server` from an empty directory.
- **A second guard returning `Set-Cookie` silently clobbered an earlier guard's own `Set-Cookie` on
  the same request.** `mainGuard` (`modules/infra/middlewares/defaults/main.middlewares.ts`)
  accumulated every guard's returned `headers` with a plain object spread
  (`{ ...baseHeaders, ...headers }`) — correct for every header EXCEPT `Set-Cookie`: two guards on
  the same route each returning their own cookie (a realistic case, e.g. `@zanix/space`'s
  `populationGuard` and its new `langGuard` companion both running via `defineMiddleware([...])`)
  collapsed to only the LAST guard's cookie, the first one never reaching the client at all. Fixed
  by accumulating into a real `Headers` instance: `Set-Cookie` now accumulates via `.append()` (it's
  spec-excluded from header-list combining, so multiple values survive as separate entries all the
  way to the final `Response` — verified empirically with `Response.headers.getSetCookie()`), while
  every OTHER header keeps the exact pre-existing override behavior via `.set()` — a page-level
  `@Guard(cspGuard(...))` still fully overrides an app-wide `defineMiddleware([cspGuard(...)])`
  policy for that page, unchanged (this distinction matters: an earlier version of this fix naively
  `.append()`-ed every header, which would have comma-joined two CSP policies into one broken value
  instead of the intended override — caught by `define-middleware.test.tsx`, now additionally
  covered by a dedicated unit test). `mainInterceptor`'s and `routerInterceptor`'s `options.headers`
  are now typed `Headers` instead of `Record<string, string>` to carry this through;
  `GuardResponse.headers` (what an individual guard returns) is unchanged, still a plain
  `Record<string, string>` — only the cross-guard accumulation step changed.
- **Gzip silently defeated `ssr` streaming responses.** `routerInterceptor` applied the same
  byte-length-aware compressor (`gzipResponseFromResponse`) to every server type, including `ssr` —
  that compressor's `response.clone().arrayBuffer()` drains the ENTIRE body into memory before
  compressing, which for a genuinely streamed SSR render (`renderToReadableStream`) meant the whole
  page had to finish rendering before a single byte reached the client, for any request carrying
  `Accept-Encoding: gzip` (i.e. virtually every real browser, by default). Fixed by adding a
  streaming-safe compressor, `gzipStreamingResponse` (`utils/gzip.ts`), that pipes the response body
  directly through `CompressionStream` without buffering; `routerInterceptor` now picks it whenever
  `type === 'ssr'`, and keeps the existing buffered compressor for every other type unchanged (their
  bodies are already fully materialized in memory by this point, so buffering costs nothing there
  and keeps the `threshold` check a streamed body can't have). No public API changed —
  `server.gzip`/`GzipOptions` behave identically; only the internal compression strategy for `ssr`
  changed.
- **A route param's own NAME was silently lowercased**, not just matched case-insensitively — a
  `:serviceId`-shaped param only ever produced the key `serviceid` in `ctx.payload.params`, so an
  RTO/handler declaring the camelCase property `serviceId` always read `undefined` back. Root cause:
  `RouteContainer.defineTargetRoutes`/`defineRoute` (`program/metadata/routes.ts`) ran the
  registered path through `cleanRoute` WITHOUT `keepCase`, destroying the param name's casing before
  `routeProcessor` (`webserver/helpers/routes.ts`) ever extracted it. Fixed at both layers: the
  stored route `path` is now case-preserved (`cleanRoute(path, true)`), while the case-INsensitive
  collision-detection key and the case-INsensitive request-path matching are both still derived via
  an explicit `.toLowerCase()`/the existing lowercased `cleanRoute` call — no change to either of
  those. Only known previous workaround (now unnecessary, but harmless either way): declaring a
  route param in snake_case/all-lowercase instead of camelCase.

## [3.1.2] - 2026-08-04

- Fixed CoreSlot verbose logging behavior.
- Improved RestClient URL validation to prevent invalid endpoint configurations from proceeding and
  provide a clearer HTTP conflict error when the URL is incomplete.
- Added support for HEAD and OPTIONS HTTP methods in RestClient.

## [3.1.1] - 2026-08-03

### Fixed

- `RestClient`'s constructor now also accepts a bare `contextId` string
  (`new RestClient('some-id')`), matching the base `ZanixConnector`'s own
  `string | ConnectorOptions` constructor — previously it only accepted an options object
  (`RequestOptions`), breaking the contract `ZanixConnectorClass<T>`
  (`new (contextId?: string) => T`) promises. Any `RestClient` subclass that never overrode the
  constructor (the common case for a custom REST connector, e.g.
  `class SAPConnector extends RestClient {}`) failed every overload of
  `this.connectors.get(SomeRestClientSubclass)` with `deno-ts(2769) No overload matches this call` —
  not a consumer mistake, a real gap between `RestClient` and its own base class.

## [3.1.0] - 2026-08-03

### Added

- **`createStartLifecycleGuard`** (`utils/start-lifecycle-guard.ts`) — builds a self-contained
  `isStarting`/`isRunning` reentry guard for a package's own `start()`/`stop()` pair, guarding
  against a second call overlapping a first still in flight and against a second call issued after a
  previous one already completed without an intervening `stop()`. Extracted from `@zanix/core`'s
  `Zanix.start()` and `@zanix/admin`'s `ZanixAdminHub.start()`, which each previously hand-rolled an
  identical pair of module-level booleans — both now compose this instead, with zero behavior change
  (same error messages/`meta`, same timing).
- **Boot sessions (`BootSessionContainer`,
  `ProgramModule.sessions`/`ProgramModule.runBootSession`)** — `bootstrapServers()` now wraps its
  own body in an `AsyncContext`-backed ambient "boot session" (mirroring `ApplicationContainer`'s
  own concurrency-safe pattern), and `finalize` cleanup now preserves whichever Applications a
  DIFFERENT, still-in-flight session currently owns, sweeping everything else — exactly the original
  unscoped wipe whenever no other session is genuinely concurrent right now. Fixes a real corruption
  bug: two independent top-level `bootstrapServers()`-driven sequences (e.g. `@zanix/core`'s
  `Zanix.start()` and `@zanix/admin`'s `ZanixAdminHub.start()`) running in the same process without
  a sequential `await` between them could silently wipe each other's not-yet-served routes —
  whichever sequence's own `finalize: true` call ran first would clear the other's registrations
  before they were ever bound to a server. A package composing its own multi-call
  `bootstrapServers()` sequence (its own `start()`) should wrap the whole thing in one outer
  `ProgramModule.runBootSession(...)` call so every nested `bootstrapServers()` call shares that
  session instead of forking its own — see `docs/applications.md#boot-sessions`.
- **`resolveApplicationServerId(application, type)`/`resolvePreviousApplicationServerId(application, type)`**
  — a generic Application-scoped stable-id resolver, deriving its env var name from the Application
  itself (`` `${APPLICATION}_SERVER_ID}` ``/`` `${APPLICATION}_SERVER_ID_PREVIOUS}` ``, e.g.
  `'admin'` → `ADMIN_SERVER_ID`, `'admin-hub'` → `ADMIN_HUB_SERVER_ID`), so any Application-scoped
  server package gets the same stable-id-across-restarts capability without a hand-written
  function/env-var pair of its own. See `docs/utilities.md#application-server-id-helpers`.

### Removed

- **`resolveAdminServerId`/`resolvePreviousAdminServerId`/`ADMIN_SERVER_ID_ENV`/
  `ADMIN_SERVER_ID_PREVIOUS_ENV`/`guardSingleAdminRegistration`/`releaseAdminRegistration`** (all
  from the former `utils/admin-server.ts`, now `utils/app-server.ts`) — replaced by the generic
  `resolveApplicationServerId`/`resolvePreviousApplicationServerId` above (call with `'admin'` for
  identical behavior to the removed `resolveAdminServerId`). The guard functions are removed
  outright, not replaced: they enforced a mutual-exclusion rule (`@zanix/core`'s embedded admin XOR
  `@zanix/admin`'s standalone `ZanixAdminHub`) that the new boot-session isolation above makes
  unnecessary — both may now register and boot concurrently in the same process.

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
  from context. See [Applications](docs/applications.md#applications).
- **`BootstrapServerOptions[type].application`** — which Application a given server mounts; only
  capabilities registered under that exact Application are served. Purely an ownership/composition
  boundary — carries no URL-anchoring or exposure meaning of its own (a non-default Application like
  `'admin'`/`'billing'`/`'metrics'` is not, by itself, "internal" or hidden).
- **`BootstrapServerOptions[type].anchored`** — a fully independent flag deciding whether a server's
  own id doubles as an obscuring URL prefix (a random UUID by default, rotating on every restart)
  instead of a plain `globalPrefix`-based one. Defaults to `false`. This is what `isInternal` used
  to imply automatically for any non-default scope; it's now an explicit, separate decision — see
  [Applications → Anchored servers](docs/applications.md#anchored-servers). `globalPrefix` alongside
  `anchored: true` is additive (`{id}/{globalPrefix}/...`), not a replacement, same as before.
- **`bootstrapServers` auto-discovers an anchored server's generated id.** When a server type is
  `anchored` and no explicit `id` was given, the random id `webServerManager.create()` picks isn't
  something the caller already knows — `bootstrapServers` now stamps it into
  `` `${APPLICATION}_${TYPE}_SERVER_ID` `` (uppercased; non-`[A-Z0-9]` characters in `application`
  become `_`), e.g. `application: 'billing'`'s `rest` server → `BILLING_REST_SERVER_ID`, the
  built-in `'admin'` Application's own `graphql` server → `ADMIN_GRAPHQL_SERVER_ID`. Skipped
  entirely when the id was explicit (nothing to discover). See
  [Applications → Anchored servers § Discovering an auto-generated id](docs/applications.md#anchored-servers).
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
  see [Applications → Discovery](docs/applications.md#discovery).
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
  [Dependency Injection → Registering your own core slot](docs/dependency-injection.md#registering-your-own-core-slot).
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
  [Dependency Injection → `connectorKey`](docs/dependency-injection.md#connectorkey--a-connectors-own-identity).
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
  [Dependency Injection → Typing a string-keyed `get` call](docs/dependency-injection.md#typing-a-string-keyed-get-call).

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
  [Handlers → Protocol version negotiation](docs/handlers.md#protocol-version-negotiation).
- Added `AUTH_HEADERS`, `SESSION_HEADERS`, `RATE_LIMIT_HEADERS`, `GENERAL_HEADERS`, and
  `ADMIN_PROTOCOL_HEADER` constants — centralizes header-name constants that were previously
  duplicated (in some cases with diverging hardcoded copies) across `@zanix/auth`, `@zanix/core`,
  and `@zanix/notifications`, all of which already depend on `@zanix/server`. Deliberately excludes
  `ADMIN_PROTOCOL_VERSION` (the version _number_, as opposed to the header name) — that lives in
  `@zanix/admin`, since it's expected to change independently of `@zanix/server`. See
  [Configuration → Auth & admin-protocol headers](docs/configuration.md#auth--admin-protocol-headers).
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
  [Middlewares → Middleware on sockets](docs/middlewares.md#middleware-on-sockets-class-level-only))
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
  [Built-in connector and provider base classes](docs/dependency-injection.md#built-in-connector-and-provider-base-classes).
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
  [Dependency Injection](./docs/dependency-injection.md).

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
  throttling the rest. Documented in [Error Handling](./docs/errors.md#error-log-throttling),
  including how to back the store with a Zanix-managed provider/connector via `ProgramModule`.
- **`ProgramModule.providers`/`ProgramModule.connectors`**: shorthand getters for `getProviders()`/
  `getConnectors()` with no context — the common case for `SINGLETON`-lifetime providers/connectors,
  which ignore `ctxId` in resolution anyway. Documented in
  [Dependency Injection](./docs/dependency-injection.md#accessing-instances-outside-any-class-programmodule).

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

- **New guides in `docs/`**: [Getting Started](./docs/getting-started.md),
  [Handlers](./docs/handlers.md), [Middlewares](./docs/middlewares.md),
  [Dependency Injection](./docs/dependency-injection.md), [Configuration](./docs/configuration.md),
  and [Utilities Reference](./docs/utilities.md), linked from the README's new `Documentation`
  section.
- **Validated `docs/handlers.md`/`docs/middlewares.md` against a second real production consumer**
  (a WebSocket/RabbitMQ-heavy service), documenting: the `this.socket`/`this.registry` pattern for
  tracking live socket connections and pushing messages to them proactively (outside the
  request/response cycle of `onmessage`); and that `@Guard`/`@Pipe`/`@Interceptor` on `@Socket`
  classes only take effect at the class level, never on an individual lifecycle method — a `@Socket`
  class has exactly one route (the connection/upgrade), unlike `@Controller`/`@Resolver` which
  register one route per decorated method, so there is no per-method route for a method-level
  middleware to attach to. (Traced end-to-end through the route-assembly code before concluding this
  — it is expected behavior given the single-route model, not a bug.)
- **Validated `docs/dependency-injection.md` against a real production consumer**, surfacing the
  dominant real-world dependency-access patterns that were missing: `ZanixProvider<{ database: X }>`
  named-slot getters (`this.database`/`.cache`/`.worker`/`.asyncmq`/`.kvLocal`) as the idiomatic way
  a provider reaches its connector, and `this.providers.get(X)`/`this.connectors.get(X)`/
  `this.interactors.get(X)` for reaching dependencies beyond the single one declared on
  `@Interactor`/`@Provider`. Also added the `@Post({ Body })` no-path overload example to
  [Handlers](./docs/handlers.md), a real-practice note to
  [Middlewares](./docs/middlewares.md#advanced-building-your-own-middleware-decorator) about
  building app-level guard packages, and a clarification in the README's
  [file naming conventions](./README.md#file-naming-conventions) that `@zanix/server` itself doesn't
  scan the filesystem — the suffix convention matters for tooling like `@zanix/core`, not for
  `@zanix/server`'s own registration.
- Documented previously-uncovered public exports: `ProgramModule`'s instance accessors
  (`getConnectors`/`getProviders`/`getInteractors`/`registry`/`asyncContext`) in
  [Dependency Injection](./docs/dependency-injection.md), `GQLRequest` in
  [Handlers](./docs/handlers.md), `defineMiddlewareDecorator` in
  [Middlewares](./docs/middlewares.md), and the error/routing/compression helper functions
  (`httpErrorResponse`, `getSerializedErrorResponse`, `attachGlobalErrorHandlers`, `TargetError`,
  `cleanRoute`, `processUrlParams`, `gzipResponse`, `gzipResponseFromResponse`, `getTargetKey`,
  `targetInitializations`, `closeAllConnections`, `cleanupInitializationsMetadata`) in
  [Error Handling](./docs/errors.md) and the new [Utilities Reference](./docs/utilities.md).
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
  `errors.md`'s "Error Concurrency" section had the suppression logic backwards (it described errors
  as suppressed _after_ exceeding the 50/hour threshold, when the real code suppresses them _until_
  the threshold is hit, then logs once and resets); a `dependency-injection.md` claim that the named
  connector getters (`this.database`, etc.) are "built on top of" `use()` was false — they call
  `this.connectors.get()`/`this.providers.get()` directly, an unrelated mechanism; the `Lifetime`
  table didn't note that `@Provider` excludes `TRANSIENT` at the type level; the `Interactor`
  section was missing its "Defaults when no options are given" line and didn't document that passing
  a _core_ connector/provider (one extending a built-in base class) to `@Interactor`'s options
  throws — it must be accessed via the matching named getter instead. Also fixed
  heading/anchor/admonition-marker inconsistencies, reworded a heading whose ampersand ("&")
  produced an ambiguous double-hyphen slug on some markdown renderers, and de-duplicated the
  "Special Environment Variables" table that was repeated verbatim in both the README and
  [Configuration](./docs/configuration.md#environment-variables) (README now links to it instead).

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
  [Guard](src/modules/infra/middlewares/defs/guards.ts).

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
