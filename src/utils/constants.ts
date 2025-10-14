import type { CoreConnectors, Lifetime } from 'typings/program.ts'

import { ZanixCacheConnector } from 'connectors/cache.ts'
import { ZanixDatabaseConnector } from 'connectors/database.ts'
import { ZanixWorkerConnector } from 'connectors/worker.ts'
import { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'

/**
 * Reserved port for default socket server
 */
export const SOCKET_PORT = 20201
/**
 * Reserved port for default static server
 */
export const STATIC_PORT = 20202
/**
 * Reserved port for default GQL server
 */
export const GRAPHQL_PORT = 20203
/**
 * Reserved port for default admin server
 */
export const ADMIN_PORT = 30248

export const RESERVED_PORTS = [STATIC_PORT, ADMIN_PORT, SOCKET_PORT, GRAPHQL_PORT]

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
