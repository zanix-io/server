import type { Lifetime } from 'typings/program.ts'

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

export const INSTANCE_KEY_SEPARATOR = '::'
export const HANDLER_METADATA_PROPERTY_KEY = 'handler_properties'

export const DEFAULT_CONTEXT_ID = 'zanix-default-ctx'

export const PARAM_PATTERN = /\/:\w+/

/**
 * Constant to identify a Zanix class prototype props
 */
export const ZANIX_PROPS = '_znx_props_'

/**
 * List of server module file extensions used within the Zanix framework.
 *
 * These modules are responsible for different layers of the server architecture, including:
 * - `.handler.ts`: Manages request handling logic.
 * - `.interactor.ts`: Contains business logic and interactions.
 * - `.defs.ts`: Declares domain entities, metadata structures, and DSL-based definitions
 *               (including creation and registration logic) that form the foundation of the module.
 * - `.connector.ts`: Defines connectors for external services or databases.
 * - `.provider.ts`: Manages providers that supply various services to the application.
 *
 * @constant
 */
export const ZANIX_SERVER_MODULES = [
  '.handler.ts',
  '.interactor.ts',
  '.defs.ts',
  '.connector.ts',
  '.provider.ts',
]

export const HTTPMETHODS_WITHOUT_BODY = new Set(['GET', 'HEAD', 'CONNECT', 'OPTIONS'])
