/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 */

import ProgramModule from 'modules/program/public.ts'

export { ProgramModule }
export { AsyncContext } from 'modules/infra/base/storage.ts'
export { BaseContainer as ProgramContainer } from 'modules/program/metadata/base.ts'
export { TargetContainer } from 'modules/program/metadata/targets/main.ts'

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
export { ZanixDatabaseConnector } from 'modules/infra/connectors/database.ts'
export { ZanixWorkerConnector } from 'connectors/worker.ts'
export { Connector } from 'connectors/decorators/base.ts'

// Middlewares
export {
  defineGlobalInterceptorHOC,
  defineGlobalPipeHOC,
} from 'modules/infra/middlewares/hocs/base.ts'
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

// Utils
export { TargetError } from 'utils/errors.ts'

// Types
export type { GeneralTargetTypes, ModuleTypes, StartMode } from 'typings/program.ts'
export type { ConnectionStatusHandler, Seeders } from 'typings/general.ts'
export type {
  BootstrapServerOptions,
  ServerID,
  ServerManagerOptions,
  WebServerTypes,
} from 'typings/server.ts'
export type {
  MiddlewareGlobalInterceptor,
  MiddlewareGlobalPipe,
  MiddlewareInterceptor,
  MiddlewareInternalInterceptor,
  MiddlewarePipe,
} from 'typings/middlewares.ts'
export type { HandlerContext } from 'typings/context.ts'
export type { ConnectorOptions, CoreConnectorTemplates } from 'typings/targets.ts'
export type { HttpMethods } from 'typings/router.ts'

// Main
export { WebServerManager } from 'modules/webserver/manager.ts'
export { bootstrapServers, webServerManager } from 'webserver/mod.ts'
