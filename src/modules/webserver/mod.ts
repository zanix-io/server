import type { BootstrapServerOptions, ServerID } from 'typings/server.ts'
import type { ModuleTypes } from 'typings/program.ts'
import type { ZanixConnector } from 'connectors/base.ts'

import { GRAPHQL_PORT, SOCKET_PORT } from 'utils/constants.ts'
import ProgramModule from 'modules/program/mod.ts'
import { WebServerManager } from './manager.ts'
import logger from '@zanix/logger'

const targetModuleInit = (key: string) => {
  const [type, id] = key.split(':') as [ModuleTypes, string]
  const instance = ProgramModule.targets.getInstance<ZanixConnector>(id, type)
  if (type !== 'connector') return
  return instance.connectorReady.then(() => instance['startConnection']())
}

/** Catch all module errors */
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
  logger.error(event.reason.message || 'Uncaught (in promise) Error', event.reason)
})

/** Disconnect all current connectors */
self.addEventListener('unload', async () => {
  await Promise.all(
    ProgramModule.targets.getTargetsByType('connector').map((key) => {
      ProgramModule.targets.getInstance<ZanixConnector>(key, 'connector', {
        useExistingInstance: true,
      })
        ?.['stopConnection']()
    }),
  )
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
 * // Create a server with custom handler
 * const server = webServerManager.create('rest', { handler: () => {
 *   return new Response('Hello World');
 * }});
 *
 * // Start the server
 * webServerManager.start('rest');
 *
 * // Retrieve server info
 * const serverInfo = webServerManager.info('rest');
 * console.log(serverInfo);  // { addr: 'localhost:8000', protocol: 'http' }
 *
 * // Stop and delete the server
 * webServerManager.stop('rest');
 * webServerManager.delete('rest');
 * ```
 *
 * The instance provides an easy-to-use API to handle different types of web servers dynamically and interactively.
 *
 * @type {WebServerManager}
 */
export const webServerManager: Readonly<WebServerManager> = Object.freeze(new WebServerManager())

/**
 * Starts one or more server instances based on the provided configuration.
 *
 * This asynchronous function initializes servers of various types (`'graphql'`, `'rest'`, `'socket'`)
 * according to the configuration defined in the `server` object. It returns a list of IDs for the
 * servers that were successfully created and started.
 *
 * @param {BootstrapServerOptions} [server={}] - A configuration object where each key
 * represents a server type (`'graphql'`, `'rest'`, or `'socket'`), and each value contains specific
 * options for that server. Each configuration may also include an optional `onCreate` callback, which
 * is invoked with the server `id` when the server is created.
 *
 * @param {boolean} [server.isInternal=false] - When `true`, all servers created by this
 * function are considered internal. Each internal server will be assigned its own
 * dynamically generated UUID as the global prefix. This helps distinguish and isolate
 * internal server instances from public ones.
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
 * @returns {Promise<ServerID[]>} - A promise that resolves with an array of IDs for the servers
 * that were successfully created and started.
 */
export const bootstrapServers = async (
  server: BootstrapServerOptions = {},
): Promise<ServerID[]> => {
  const servers: ServerID[] = []

  const serveRest = ProgramModule.routes.getRoutes('rest')
  const serveSocket = ProgramModule.routes.getRoutes('socket')
  const serveGraphql = ProgramModule.targets.getTargetsByType('resolver').length

  if (!(serveRest || serveSocket || serveGraphql)) {
    return servers
  }

  await Promise.all(ProgramModule.targets.getTargetsByStartMode('onSetup').map(targetModuleInit))

  if (serveRest) {
    const { onCreate, isInternal, ...opts } = { ...server.rest } as Required<typeof server>['rest']
    const id = webServerManager.create('rest', {
      server: { ...opts, globalPrefix: opts.globalPrefix || 'api' },
      isInternal,
    })
    onCreate?.(id)
    servers.push(id)
  }
  if (serveSocket) {
    const { onCreate, isInternal, port, ...opts } = { ...server.socket } as Required<
      typeof server
    >['socket']
    const id = webServerManager.create('socket', {
      server: { ...opts, port: port || SOCKET_PORT },
      isInternal,
    })
    onCreate?.(id)
    servers.push(id)
  }

  if (serveGraphql) {
    const { onCreate, isInternal, port, ...opts } = { ...server.graphql } as Required<
      typeof server
    >['graphql']
    const id = webServerManager.create('graphql', {
      server: { ...opts, port: port || GRAPHQL_PORT, globalPrefix: opts.globalPrefix || 'graphql' },
      isInternal,
    })
    onCreate?.(id)
    servers.push(id)
  }

  await Promise.all(ProgramModule.targets.getTargetsByStartMode('onBoot').map(targetModuleInit))

  webServerManager.start(servers)

  await Promise.all(ProgramModule.targets.getTargetsByStartMode('postBoot').map(targetModuleInit))

  return servers
}
