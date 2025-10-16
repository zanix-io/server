import type { CoreConnectors, Lifetime } from 'typings/program.ts'

import { ZanixCacheConnector } from 'connectors/cache.ts'
import { ZanixDatabaseConnector } from 'connectors/database.ts'
import { ZanixWorkerConnector } from 'connectors/worker.ts'
import { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'

/**
 * Default port for SOCKET server
 */
export const SOCKET_PORT = 20201
/**
 * Default port for STATIC server
 */
export const STATIC_PORT = 20202
/**
 * Default port for GQL server
 */
export const GRAPHQL_PORT = 20203
/**
 * Default port for admin REST server
 */
export const ADMIN_REST_PORT = 30248
/**
 * Default port for admin GQL server
 */
export const ADMIN_GRAPHQL_PORT = 30249
/**
 * Default port for admin SOCKET server
 */
export const ADMIN_SOCKET_PORT = 30250
/**
 * Default port for admin STATIC server
 */
export const ADMIN_STATIC_PORT = 30251

/**
 * Content header for http JSON application
 */
export const JSON_CONTENT_HEADER = { 'Content-Type': 'application/json' }

export const LIFETIME_MODE: Record<Lifetime, Lifetime> = {
  SINGLETON: 'SINGLETON',
  SCOPED: 'SCOPED',
  TRANSIENT: 'TRANSIENT',
}

export const CORE_CONNECTORS: Record<
  CoreConnectors,
  // deno-lint-ignore ban-types
  { key: CoreConnectors; Target: Function }
> = {
  cache: { key: 'cache', Target: ZanixCacheConnector },
  worker: { key: 'worker', Target: ZanixWorkerConnector },
  asyncmq: { key: 'asyncmq', Target: ZanixAsyncmqConnector },
  database: { key: 'database', Target: ZanixDatabaseConnector },
}
