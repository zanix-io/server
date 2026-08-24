import type { BootstrapServerOptions, ServerID, WebServerTypes } from 'typings/server.ts'

import { closeAllConnections, targetInitializations } from 'utils/targets.ts'
import { GRAPHQL_PORT, SOCKET_PORT, STATIC_PORT } from 'utils/constants.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import ProgramModule from 'modules/program/mod.ts'
import { WebServerManager } from './manager.ts'
import { compileRuntime } from './runtime.ts'
import { type ResolvedHealthOptions, resolveHealthOptions } from './health.ts'
import { compileDiscoveryContract } from 'modules/discovery/provider.ts'
import {
  buildDiscoveryHandler,
  compileHttpRuntime as compileDiscoveryHttpRuntime,
} from 'modules/discovery/mount.ts'

/**
 * Web server bootstrap and management: exposes `webServerManager` for creating, starting,
 * stopping, and inspecting REST, GraphQL, and WebSocket servers, and `bootstrapServers` for
 * booting them from a `BootstrapServerOptions` configuration.
 *
 * @module webServer
 */

/** Disconnect all current connectors */
self.addEventListener('unload', async () => {
  await closeAllConnections()
})

/**
 * An instance of the `WebServerManager` class responsible for managing multiple web servers.
 * The `webServerManager` object provides an interface to create, start, stop, and delete web servers,
 * as well as retrieve information about them.
 *
 * You can use this instance to manage different types of servers (e.g., HTTP, HTTPS) in your application.
 * The class allows you to specify custom handlers for each server and configure SSL certificates for secure connections.
 *
 * Example usage:
 *
 * ```typescript
 * // Create a server with a custom handler; `create` returns a ServerID, not the type string
 * const serverId = webServerManager.create('rest', { handler: () => {
 *   return new Response('Hello World');
 * }});
 *
 * // Start the server (must be called with the ServerID returned by `create`)
 * webServerManager.start(serverId);
 *
 * // Retrieve server info
 * const serverInfo = webServerManager.info(serverId);
 * console.log(serverInfo);  // { addr: Deno.NetAddr, protocol: 'http', type: 'rest' }
 *
 * // Stop and delete the server
 * await webServerManager.stop(serverId);
 * webServerManager.delete(serverId);
 * ```
 *
 * The instance provides an easy-to-use API to handle different types of web servers dynamically and interactively.
 *
 * @type {WebServerManager}
 */
export const webServerManager: Readonly<WebServerManager> = Object.freeze(
  new WebServerManager(),
)

const hasRoutesForScope = (
  type: 'rest' | 'socket' | 'ssr',
  application: string,
): boolean => {
  const routes = ProgramModule.routes.getRoutes(type)
  if (!routes) return false
  return Object.values(routes).some((route) => route.application === application)
}

/**
 * Resolves a server type's `globalPrefix`: an explicitly `configured` value always wins; otherwise
 * an anchored server (`explicitId` given) gets no default at all — its own id is already its prefix
 * (see `compileRuntime`'s `routeHandlerPrefix`) — and an unanchored one falls back to `fallback`
 * (e.g. `'api'` for REST). Omitting `fallback` (as `'ssr'` does) means an unanchored server has no
 * default prefix either — used when routes must resolve at the site's real root paths instead of
 * under a fixed first path segment.
 */
export const resolveGlobalPrefix = (
  explicitId: ServerID | undefined,
  configured: string | undefined,
  fallback?: string,
): string | undefined => configured || (explicitId ? undefined : fallback)

/**
 * Starts one or more server instances based on the provided configuration.
 *
 * This asynchronous function initializes servers of various types (`'graphql'`, `'rest'`, `'socket'`,
 * `'ssr'`) according to the configuration defined in the `server` object. It returns a list of IDs
 * for the servers that were successfully created and started.
 *
 * **Whether an omitted type can still auto-start depends on whether `server` names ANY type at
 * all.** Call it with no argument (or `{}`) and every type with something registered to serve
 * (routes, resolvers, or a Discovery provider) starts — convenient auto-discovery for a simple
 * boot. Name even one type explicitly (e.g. `{ ssr: { port: 3000 } }`) and ONLY the named types
 * are ever considered, no matter what else happens to be registered elsewhere in the process —
 * this is what lets a caller narrow to exactly what it wants once it starts being explicit at all.
 *
 * @param {BootstrapServerOptions} [server={}] - A configuration object where each key
 * represents a server type (`'graphql'`, `'rest'`, `'socket'`, or `'ssr'`), and each value contains
 * specific options for that server, including its own optional `application`, `id`, `previousId`, and
 * `onCreate` properties.
 *
 * `application` is set **per server type** (e.g. `server.rest.application`), not globally: it
 * decides which Application's routes/resolvers this server mounts — a `@Controller`/`@Socket`/
 * `@Resolver`/`@SsrController` registered under a given Application (see `ApplicationContainer`) is only served by a
 * server bootstrapped for that same Application (defaulting to the default Application, `'main'`,
 * when omitted on both sides); a capability never leaks onto a server built for a different
 * Application. `application` is purely an ownership/composition boundary — it carries no
 * URL-anchoring or exposure meaning of its own; a non-default Application (`'admin'`, `'billing'`,
 * `'metrics'`, ...) is not, by itself, "internal" or hidden.
 *
 * `id` (also per server type, independent of `application`) decides whether this server's own id
 * doubles as an obscuring URL prefix instead of a plain `globalPrefix`-based one — see
 * `BootstrapServerOptions[type].id`'s own doc. **A server is anchored if and only if an explicit
 * `id` is given — there is no auto-generated/random anchored id.** This is a routing/obscurity
 * boundary only, not an automatic authentication/authorization/network boundary — see
 * `docs/applications.md`'s "Applications" section for what it does and doesn't protect against.
 * `previousId` keeps that old id's prefix reachable alongside the current one, for a manual
 * rotation window — see `BootstrapServerOptions[type].previousId`. `onCreate`, when provided, is
 * invoked with the server `id` once that server is created.
 *
 * Example:
 * ```ts
 * const servers = await startServers({
 *   graphql: {
 *     globalPrefix: '/api',
 *     onCreate: (id) => console.log(`GraphQL server started with ID ${id}`)
 *   },
 *   socket: {
 *     port: 3001,
 *     onCreate: (id) => console.log(`Socket server started with ID ${id}`)
 *   }
 * });
 * ```
 *
 * @param {{finalize?: boolean}} [opts] - `finalize` (default `true`) controls whether this call's
 * `postBoot` phase also purges the metadata shared across an entire multi-call boot sequence
 * (pending GraphQL resolvers, the route registry) — see `ProgramModule.cleanupInitializationsMetadata`.
 * Pass `finalize: false` on every call except the last one in a boot sequence that calls
 * `bootstrapServers` more than once (e.g. the `'admin'`-Application server followed by the default
 * Application's, as `@zanix/core`'s `start.ts` does) — otherwise an earlier call's cleanup wipes
 * resolvers/routes a later call in the same sequence still needs to read.
 *
 * @returns {Promise<ServerID[]>} - A promise that resolves with an array of IDs for the servers
 * that were successfully created and started.
 */
export const bootstrapServers = async (
  server: BootstrapServerOptions = {},
  { finalize = true }: { finalize?: boolean } = {},
): Promise<ServerID[]> => {
  return await ProgramModule.sessions.runSession(async () =>
    await bootstrapServersImpl(server, finalize)
  )
}

const bootstrapServersImpl = async (
  server: BootstrapServerOptions,
  finalize: boolean,
): Promise<ServerID[]> => {
  const servers: ServerID[] = []

  const applicationOf = (type: WebServerTypes) => server[type]?.application ?? DEFAULT_APPLICATION
  const applications = {
    rest: applicationOf('rest'),
    socket: applicationOf('socket'),
    graphql: applicationOf('graphql'),
    ssr: applicationOf('ssr'),
  }

  // Resolved once per call — the SAME resolved config is threaded into every type this call ends
  // up serving (see `bootstrapServerType`'s own `health` param below, including `ssr`'s — see that
  // type's own call for why its `''`-catch-all dispatch is safe too), since the underlying
  // readiness data (core connectors) is process-wide, not per-type — see `WebServerManager.create`'s
  // own health doc for exactly where/how it gets registered.
  const health = resolveHealthOptions(server.health)

  // Each type below is served when BOTH hold: (1) `shouldServeType(type)` allows considering this
  // type at all, and (2) that type actually has something to serve (routes/resolvers, or — REST
  // only — a Discovery provider; see its own note below). Read the two as one combined condition,
  // not two independent claims — a Discovery-only registration does NOT force REST to start on
  // its own if the caller named at least one OTHER type and `rest` isn't one of the named ones
  // (see the second case below): condition (1) still gates condition (2).
  //
  // (1) `shouldServeType`: whether the CALLER named at least one type at all. Two real, different
  // callers rely on two different behaviors here, confirmed by running the full ecosystem test
  // suite (`@zanix/server`/`@zanix/app`/`@zanix/core`), not assumed:
  // - Omitted entirely (`bootstrapServers()`/`bootstrapServers(undefined)`, `server` defaults to
  //   `{}`) — auto-discovery, unchanged from before: whatever has routes/resolvers/discovery
  //   providers for its resolved Application gets served. This is `@zanix/core`'s own top-level
  //   `bootstrapServers(options.server)` call when a `Zanix.bootstrap()` caller never passes
  //   `server` at all — "I decorated some handlers, just start whatever I registered."
  // - At least one type named (`{ ssr: {...} }`, even just one key) — ONLY the named types are
  //   even considered; an unnamed type never auto-starts no matter how many routes/resolvers (or,
  //   for REST, Discovery providers — see (2) below) it has for its Application. This is
  //   `@zanix/app`'s `bootstrapAppServer`, the one real, shared entry point every named-app
  //   composition in the ecosystem funnels through — it builds this object key-by-key from
  //   exactly what the caller declared, relying on an undeclared type never starting. Without
  //   this second case, ANY route/resolver registered for an Application anywhere in the process
  //   — even one having nothing to do with THIS `bootstrapServers()` call, e.g. a decorator's
  //   import-time side effect from an unrelated module — would silently start an extra,
  //   unrequested server on that type's bare default port/prefix once the caller narrows to even
  //   one other type. Regression this fixes: `serve.socket` used to turn `true` from a
  //   `@Socket`-decorated class registered under the default Application, even when a caller's
  //   `server` object explicitly narrowed to `{ ssr }` only.
  //
  // (2) Discovery providers count as "something to serve" too, for REST specifically — a business
  // service that registers ONLY a `defineDiscovery(...)` for this Application (no `@Controller`
  // of its own) still needs its REST server to start, GIVEN (1) already allows REST to be
  // considered: without this OR clause, `hasRoutesForScope` alone would see nothing yet
  // (discovery routes aren't mounted into the route table until `registerDiscoveryRoutes` runs)
  // and skip the whole branch even when (1) says REST should be checked.
  // "Named at all" is checked against `applications`'s own keys (exactly the 4 `WebServerTypes`),
  // NOT `Object.keys(server)` directly — `server` can also carry sibling, non-type fields
  // (`health`) that must never count as "the caller named a type." Regression this fixes:
  // `bootstrapServers({ health: false })` (no type named at all, meaning "auto-discover
  // everything, just skip health") used to silently disable auto-discovery entirely —
  // `Object.keys(server)` saw `'health'` as if it were a named type, so this came back `true` for
  // every type even though none of `rest`/`graphql`/`socket`/`ssr` were actually named.
  const shouldServeType = (type: keyof typeof server) =>
    type in server ||
    Object.keys(applications).every((other) => !(other in server))

  const serve = {
    rest: shouldServeType('rest') &&
      (hasRoutesForScope('rest', applications.rest) ||
        ProgramModule.discovery.getProviders(applications.rest).length > 0),
    socket: shouldServeType('socket') &&
      hasRoutesForScope('socket', applications.socket),
    graphql: shouldServeType('graphql') &&
      ProgramModule.targets.getTargetsByType('resolver', applications.graphql)
          .length > 0,
    ssr: shouldServeType('ssr') && hasRoutesForScope('ssr', applications.ssr),
  }

  if (!Object.values(serve).some(Boolean)) {
    return servers
  }

  await targetInitializations('onSetup')

  // Every server type below shares this exact shape: resolve its `globalPrefix`/`Runtime`, then
  // create+notify+track it — only the default prefix/port and (REST-only) a pre-create step differ.
  const bootstrapServerType = <T extends WebServerTypes>({
    type,
    application,
    options,
    defaultPrefix,
    defaultPort,
    beforeCreate,
    health,
  }: {
    type: T
    application: string
    options: BootstrapServerOptions[T]
    /** Unanchored default (skipped when anchored) — see `resolveGlobalPrefix`. Omitted for `'ssr'`. */
    defaultPrefix?: string
    /** Falls back to `WebServerManager.create`'s own default (8000) when omitted, as REST does. */
    defaultPort?: number
    /** REST-only: registers Discovery routes before `Runtime` resolution reads the route table. */
    beforeCreate?: () => void
    /** Forwarded as-is to `WebServerManager.create` — see this function's own `health` const above. */
    health?: ResolvedHealthOptions
  }) => {
    const {
      onCreate,
      application: _application,
      id: explicitId,
      previousId,
      port,
      preHandler,
      ...opts
    } = { ...options } as Required<BootstrapServerOptions>[T]

    // An anchored server (explicit `id`) with no explicit `globalPrefix` must see no default at
    // all — its own id is already its prefix — or it would always gain an unwanted
    // `{id}/{defaultPrefix}/...` segment instead of the unchanged bare `{id}/...` path. An explicit
    // `globalPrefix` (anchored or not) is always respected either way.
    const globalPrefix = resolveGlobalPrefix(
      explicitId,
      opts.globalPrefix,
      defaultPrefix,
    )

    beforeCreate?.()

    // Runtime resolution happens here, once, before `WebServerManager.create` is ever called —
    // `create` itself only ever consumes the already-compiled `Runtime`, never derives id-anchoring
    // behavior on its own.
    const runtime = compileRuntime(type, {
      application,
      globalPrefix,
      explicitId,
      previousId,
    })
    const id = webServerManager.create(
      type,
      {
        preHandler,
        server: { ...opts, globalPrefix, port: port || defaultPort },
      },
      runtime,
      health,
    )
    onCreate?.(id)
    servers.push(id)
  }

  // Discovery routes are lazily registered here, at Runtime-activation time, the same way
  // `getMainHandler` registers GraphQL's own single POST route outside any decorator (see its own
  // comment) — `defineRoute`'s `applicationOverride` 3rd argument is the same escape hatch. Must
  // happen before `routeProcessor` (inside `webServerManager.create` above) reads the route table,
  // since that read is one-time — a route added after has no effect on this server. Discovery is
  // REST-only, so this is only ever passed as REST's own `beforeCreate`.
  const registerDiscoveryRoutes = (application: string) => {
    for (
      const [resourceType, { provider, guards }] of ProgramModule.discovery
        .getProviders(
          application,
        )
    ) {
      const contract = compileDiscoveryContract(resourceType)
      const httpRuntime = compileDiscoveryHttpRuntime(contract, guards)
      ProgramModule.routes.defineRoute('rest', {
        path: httpRuntime.path,
        handler: buildDiscoveryHandler(contract, provider),
        guards: httpRuntime.guards,
        interceptors: httpRuntime.interceptors,
      }, application)
    }
  }

  if (serve.rest) {
    bootstrapServerType({
      type: 'rest',
      application: applications.rest,
      options: server.rest,
      defaultPrefix: 'api',
      beforeCreate: () => registerDiscoveryRoutes(applications.rest),
      health,
    })
  }

  if (serve.socket) {
    bootstrapServerType({
      type: 'socket',
      application: applications.socket,
      options: server.socket,
      defaultPrefix: 'socket',
      defaultPort: SOCKET_PORT,
      health,
    })
  }

  if (serve.graphql) {
    bootstrapServerType({
      type: 'graphql',
      application: applications.graphql,
      options: server.graphql,
      defaultPrefix: 'graphql',
      defaultPort: GRAPHQL_PORT,
      health,
    })
  }

  if (serve.ssr) {
    // No `defaultPrefix`: SSR pages must resolve at the site's real root paths (e.g. `/products/1`,
    // not `/ssr/products/1`), so an unanchored SSR server has no default prefix at all — its own
    // dispatch key is the multiplexer's `''` catch-all (see `multiplexer`'s own doc). Verified
    // empirically (a real SSR page at `/products/:id` alongside `health: true`, on one port) that
    // health's own `'health'`/`'ready'` dispatch keys coexist safely with that catch-all — an exact
    // match always wins over `''` at the multiplexer, identical to how an unprefixed/unanchored
    // REST server (also dispatching via `''`) already behaves. Same known, narrow limitation as
    // every other type: an SSR page whose OWN literal path is `/health`/`/ready` gets shadowed by
    // the framework default (`health: false` if that's ever a real conflict).
    bootstrapServerType({
      type: 'ssr',
      application: applications.ssr,
      options: server.ssr,
      defaultPort: STATIC_PORT,
      health,
    })
  }

  await targetInitializations('onBoot')

  webServerManager.start(servers, finalize)

  await targetInitializations('postBoot')

  ProgramModule.cleanupInitializationsMetadata('postBoot', finalize)

  return servers
}
