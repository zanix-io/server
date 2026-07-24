/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 */

import ProgramModule from 'modules/program/public.ts'

/**
 * The primary runtime accessor for retrieving provider, connector, and interactor instances from
 * outside any class context — useful in standalone scripts, tests, or custom middleware functions
 * where no `this` is available. Exposes the same accessors used internally by classes.
 *
 * @module ProgramModule
 */
export { ProgramModule }
export { AsyncContext } from 'modules/infra/base/storage.ts'
export { BaseContainer as ProgramContainer } from 'modules/program/metadata/base.ts'
export { TargetContainer } from 'modules/program/metadata/targets/main.ts'

// Handlers
export { HandlerGenericClass } from 'handlers/generic.ts'
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
export { ZanixKVConnector } from 'connectors/core/kv.ts'
export { ZanixAsyncmqConnector } from 'connectors/core/asyncmq.ts'
export { ZanixCacheConnector } from 'connectors/core/cache.ts'
export { ZanixDatabaseConnector } from 'connectors/core/database.ts'
export { GraphQLClient } from 'connectors/core/graphql.ts'
export { RestClient } from 'connectors/core/rest.ts'
export { Connector } from 'connectors/decorators/base.ts'

// Providers
export { ZanixProvider } from 'providers/base.ts'
export { ZanixCacheProvider } from 'providers/core/cache.ts'
export { ZanixWorkerProvider } from 'providers/core/worker.ts'
export { ZanixAsyncMQProvider } from 'providers/core/asyncmq.ts'
export { Provider } from 'providers/decorators/base.ts'

// Middlewares
export {
  registerGlobalGuard,
  registerGlobalInterceptor,
  registerGlobalPipe,
} from 'middlewares/defs/base.ts'
export { Pipe } from 'middlewares/decorators/pipe.ts'
export { Guard } from 'middlewares/decorators/guard.ts'
export { Interceptor } from 'middlewares/decorators/interceptor.ts'
export { RequestValidation } from 'middlewares/decorators/validation.ts'
export { cleanUpPipe, contextSettingPipe } from 'modules/infra/middlewares/defaults/context.pipe.ts'
export { requestValidationPipe } from 'modules/infra/middlewares/defaults/validation.pipe.ts'
export { defineMiddlewareDecorator } from 'modules/infra/middlewares/decorators/assembly.ts'

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
  ZANIX_SERVER_MODULES,
} from 'utils/constants.ts'

// Utils
export { TargetError } from 'utils/errors/target.ts'
export { cleanRoute } from 'utils/routes.ts'
export { processUrlParams } from 'utils/params.ts'
export { gzipResponse, gzipResponseFromResponse } from 'utils/gzip.ts'
export { ErrorLogThrottle, httpErrorResponse } from 'utils/errors/helper.ts'
export { attachGlobalErrorHandlers } from 'utils/errors/process.ts'
export { getSerializedErrorResponse } from 'utils/errors/helper.ts'
export type { ErrorLogThrottleConfig, ErrorLogThrottleStore } from 'utils/errors/helper.ts'
export {
  cleanupInitializationsMetadata,
  closeAllConnections,
  getTargetKey,
  targetInitializations,
} from 'utils/targets.ts'

// Types
export type {
  BackoffOptions,
  MessageQueue,
  Publish,
  QueueMessageOptions,
  QueuePriorities,
  ScheduleOptions,
} from 'typings/queues.ts'
export type {
  ConnectorTypes,
  CoreCacheConnectors,
  CoreCacheTypes,
  CoreConnectors,
  CoreProviders,
  GeneralTargetTypes,
  GenericTargets,
  HandlerTypes,
  Lifetime,
  MetadataInstances,
  MetadataObjects,
  MetadataTargetSymbols,
  MetadataTypes,
  ModuleTypes,
  ProviderTypes,
  StartMode,
  ZanixGlobalExports,
} from 'typings/program.ts'
export type {
  Async,
  CacheProviderSetOptions,
  CacheSetOptions,
  ConnectionStatusHandler,
  GzipOptions,
  GzipSettings,
  Seeders,
} from 'typings/general.ts'
export type {
  BootstrapServerOptions,
  CorsAllowedMethods,
  ServerHandler,
  ServerID,
  ServerManagerData,
  ServerManagerOptions,
  ServerOptions,
  WebServerTypes,
} from 'typings/server.ts'
export type {
  CorsOptions,
  CorsOrigin,
  GlobalMidContext,
  GlobalMiddlewareContext,
  GuardContext,
  GuardResponse,
  MiddlewareGlobalGuard,
  MiddlewareGlobalInterceptor,
  MiddlewareGlobalPipe,
  MiddlewareGuard,
  MiddlewareInterceptor,
  MiddlewarePipe,
  MiddlewareTypes,
} from 'typings/middlewares.ts'
export type {
  BaseContext,
  GenericPayload,
  HandlerContext,
  InstanceContext,
  InstanceOptions,
  Payload,
  ScopedContext,
  Session,
  SessionTypes,
} from 'typings/context.ts'
export type {
  ClassConstructor,
  ConnectorAutoInitOptions,
  ConnectorOptions,
  CoreConnectorTemplates,
  GQLPrototype,
  HandlerPrototype,
  SocketPrototype,
  ZanixCacheConnectorGeneric,
  ZanixConnectorClass,
  ZanixConnectorGeneric,
  ZanixConnectorsGetter,
  ZanixHandlerGeneric,
  ZanixInteractorClass,
  ZanixInteractorGeneric,
  ZanixInteractorsGetter,
  ZanixProviderClass,
  ZanixProviderGeneric,
  ZanixProvidersGetter,
} from 'typings/targets.ts'
export type { GqlOptions, RestFullOptions } from 'typings/clients.ts'
export type { HandlerFunction, HandlerResponse, HttpMethod } from 'typings/router.ts'
export type {
  ConnectorDecoratorOptions,
  HandlerDecoratorMethodOptions,
  InteractorDecoratorOptions,
  ProviderDecoratorOptions,
  ResolverRequestOptions,
  StartModeOnTransient,
  ZanixClassDecorator,
  ZanixFunctionDecorator,
  ZanixGenericDecorator,
  ZanixMethodDecorator,
} from 'typings/decorators.ts'

// Base/internal classes referenced by the public API's inheritance chains and signatures
export type { Program } from 'modules/program/public.ts'
export type { HandlerBaseClass } from 'modules/infra/handlers/base.ts'
export type { ContextualBaseClass } from 'modules/infra/base/contextual.ts'
export type { CoreBaseClass } from 'modules/infra/base/core.ts'
export type { TargetBaseClass } from 'modules/infra/base/target.ts'
export type { BaseInstancesContainer } from 'modules/program/metadata/targets/instances.ts'
export type { RegistryContainer } from 'modules/program/metadata/registry.ts'

// Main
export { WebServerManager } from 'modules/webserver/manager.ts'
export { bootstrapServers, webServerManager } from 'webserver/mod.ts'
