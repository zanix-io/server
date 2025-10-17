/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 */

import type { ZanixConnector } from 'modules/infra/connectors/base.ts'

import { WebServerManager } from 'modules/webserver/manager.ts'
import ProgramModule, { Program } from 'modules/program/main.ts'
import logger from '@zanix/logger'

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
        ?.stopConnection()
    }),
  )
})

export { Program, ProgramModule }

// Handlers
export { ZanixController } from 'handlers/rest/base.ts'
export { Controller } from 'handlers/rest/decorators/base.ts'
export { Get } from 'handlers/rest/decorators/get.ts'
export { Post } from 'handlers/rest/decorators/post.ts'
export { Patch } from 'handlers/rest/decorators/patch.ts'
export { Delete } from 'handlers/rest/decorators/delete.ts'
export { Put } from 'handlers/rest/decorators/put.ts'
export { Request } from 'handlers/rest/decorators/request.ts'

export { ZanixResolver } from 'handlers/graphql/base.ts'
export { Resolver } from 'handlers/graphql/decorators/base.ts'
export { Query } from 'handlers/graphql/decorators/query.ts'
export { Mutation } from 'handlers/graphql/decorators/mutation.ts'
export { Request as GQLRequest } from 'handlers/graphql/decorators/request.ts'

export { ZanixWebSocket } from 'handlers/sockets/base.ts'
export { Socket } from 'handlers/sockets/decorators/base.ts'

// Interactors
export { ZanixInteractor } from 'interactors/base.ts'
export { Interactor } from 'interactors/decorators/base.ts'

// Connectors
export { ZanixConnector } from 'connectors/base.ts'
export { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'
export { ZanixCacheConnector } from 'connectors/cache.ts'
export { ZanixDatabaseConnector } from 'connectors/database.ts'
export { ZanixWorkerConnector } from 'connectors/worker.ts'
export { Connector } from 'connectors/decorators/base.ts'

// Middlewares
export { defineGlobalInterceptorHOC, defineGlobalPipeHOC } from 'middlewares/hocs/global.ts'
export { Pipe } from 'middlewares/decorators/pipe.ts'
export { Interceptor } from 'middlewares/decorators/interceptor.ts'
export { RequestValidation } from 'middlewares/decorators/validation.ts'

// Constants
export {
  ADMIN_GRAPHQL_PORT,
  ADMIN_REST_PORT,
  ADMIN_SOCKET_PORT,
  ADMIN_STATIC_PORT,
  GRAPHQL_PORT,
  JSON_CONTENT_HEADER,
  SOCKET_PORT,
  STATIC_PORT,
} from 'utils/constants.ts'

// Types
export type { ModuleTypes } from 'typings/program.ts'
export type { ServerID, ServerManagerOptions, WebServerTypes } from 'typings/server.ts'
export type {
  MiddlewareGlobalInterceptor,
  MiddlewareGlobalPipe,
  MiddlewareInterceptor,
  MiddlewareInternalInterceptor,
  MiddlewarePipe,
} from 'typings/middlewares.ts'
export type { HandlerContext } from 'typings/context.ts'

// Main
export { WebServerManager }

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
