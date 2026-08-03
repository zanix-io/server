import type { BootstrapServerOptions, ServerID } from 'typings/server.ts'

import { closeAllConnections, targetInitializations } from 'utils/targets.ts'
import { GRAPHQL_PORT, SOCKET_PORT } from 'utils/constants.ts'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import ProgramModule from 'modules/program/mod.ts'
import { WebServerManager } from './manager.ts'
import { compileRuntime } from './runtime.ts'
import { attachGlobalErrorHandlers } from 'utils/errors/process.ts'
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

/** Attach global errors */
attachGlobalErrorHandlers(self)

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
export const webServerManager: Readonly<WebServerManager> = Object.freeze(new WebServerManager())

const hasRoutesForScope = (type: 'rest' | 'socket', application: string): boolean => {
  const routes = ProgramModule.routes.getRoutes(type)
  if (!routes) return false
  return Object.values(routes).some((route) => route.application === application)
}

/**
 * Starts one or more server instances based on the provided configuration.
 *
 * This asynchronous function initializes servers of various types (`'graphql'`, `'rest'`, `'socket'`)
 * according to the configuration defined in the `server` object. It returns a list of IDs for the
 * servers that were successfully created and started.
 *
 * @param {BootstrapServerOptions} [server={}] - A configuration object where each key
 * represents a server type (`'graphql'`, `'rest'`, or `'socket'`), and each value contains specific
 * options for that server, including its own optional `application`, `id`, `previousId`, and
 * `onCreate` properties.
 *
 * `application` is set **per server type** (e.g. `server.rest.application`), not globally: it
 * decides which Application's routes/resolvers this server mounts — a `@Controller`/`@Socket`/
 * `@Resolver` registered under a given Application (see `ApplicationContainer`) is only served by a
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
 * `docs/HANDLERS.md`'s "Applications" section for what it does and doesn't protect against.
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

  const restApplication = server.rest?.application ?? DEFAULT_APPLICATION
  const socketApplication = server.socket?.application ?? DEFAULT_APPLICATION
  const graphqlApplication = server.graphql?.application ?? DEFAULT_APPLICATION

  // Discovery providers count as "something to serve" too — a business service that registers
  // ONLY a `defineDiscovery(...)` for this Application (no `@Controller` of its own) still needs
  // its REST server to actually start; without this, `hasRoutesForScope` alone would see nothing
  // yet (discovery routes aren't mounted into the route table until the loop below runs) and skip
  // the whole branch.
  const serveRest = hasRoutesForScope('rest', restApplication) ||
    ProgramModule.discovery.getProviders(restApplication).length > 0
  const serveSocket = hasRoutesForScope('socket', socketApplication)
  const serveGraphql = ProgramModule.targets.getTargetsByType('resolver', graphqlApplication).length

  if (!(serveRest || serveSocket || serveGraphql)) {
    return servers
  }

  await targetInitializations('onSetup')

  // REST initialization
  if (serveRest) {
    const {
      onCreate,
      application: _restApplication,
      id: explicitId,
      previousId,
      ...opts
    } = {
      ...server.rest,
    } as Required<typeof server>['rest']
    // The `'api'` fallback is an unanchored convention only — an anchored server (explicit `id`)
    // with no explicit `globalPrefix` must see an empty one (not `'api'`), or it would always gain
    // an unwanted `{id}/api/...` segment instead of the unchanged bare `{id}/...` path. An explicit
    // `globalPrefix` (anchored or not) is always respected either way.
    const globalPrefix = opts.globalPrefix || (explicitId ? undefined : 'api')

    // Discovery routes are lazily registered here, at Runtime-activation time, the same way
    // `getMainHandler` registers GraphQL's own single POST route outside any decorator (see its
    // own comment) — `defineRoute`'s `applicationOverride` 3rd argument is the same escape hatch.
    // Must happen before `routeProcessor` (inside `webServerManager.create` below) reads the route
    // table, since that read is one-time — a route added after has no effect on this server.
    for (
      const [resourceType, { provider, guards }] of ProgramModule.discovery.getProviders(
        restApplication,
      )
    ) {
      const contract = compileDiscoveryContract(resourceType)
      const httpRuntime = compileDiscoveryHttpRuntime(contract, guards)
      ProgramModule.routes.defineRoute('rest', {
        path: httpRuntime.path,
        handler: buildDiscoveryHandler(contract, provider),
        guards: httpRuntime.guards,
        interceptors: httpRuntime.interceptors,
      }, restApplication)
    }

    // Runtime resolution happens here, once, before `WebServerManager.create` is ever called —
    // `create` itself only ever consumes the already-compiled `Runtime`, never derives id-anchoring
    // behavior on its own.
    const runtime = compileRuntime('rest', {
      application: restApplication,
      globalPrefix,
      explicitId,
      previousId,
    })
    const id = webServerManager.create('rest', { server: { ...opts, globalPrefix } }, runtime)
    onCreate?.(id)
    servers.push(id)
  }

  // SOCKETS initialization
  if (serveSocket) {
    const {
      onCreate,
      application: _socketApplication,
      id: explicitId,
      previousId,
      port,
      ...opts
    } = { ...server.socket } as Required<typeof server>['socket']
    // See the REST branch above for why the type-based default is skipped when anchored.
    const globalPrefix = opts.globalPrefix || (explicitId ? undefined : 'socket')
    const runtime = compileRuntime('socket', {
      application: socketApplication,
      globalPrefix,
      explicitId,
      previousId,
    })
    const id = webServerManager.create('socket', {
      server: { ...opts, globalPrefix, port: port || SOCKET_PORT },
    }, runtime)
    onCreate?.(id)
    servers.push(id)
  }

  // GQL initialization
  if (serveGraphql) {
    const {
      onCreate,
      application: _graphqlApplication,
      id: explicitId,
      previousId,
      port,
      ...opts
    } = { ...server.graphql } as Required<typeof server>['graphql']
    // See the REST branch above for why the type-based default is skipped when anchored.
    const globalPrefix = opts.globalPrefix || (explicitId ? undefined : 'graphql')
    const runtime = compileRuntime('graphql', {
      application: graphqlApplication,
      globalPrefix,
      explicitId,
      previousId,
    })
    const id = webServerManager.create('graphql', {
      server: { ...opts, globalPrefix, port: port || GRAPHQL_PORT },
    }, runtime)
    onCreate?.(id)
    servers.push(id)
  }

  await targetInitializations('onBoot')

  webServerManager.start(servers, finalize)

  await targetInitializations('postBoot')

  ProgramModule.cleanupInitializationsMetadata('postBoot', finalize)

  return servers
}
