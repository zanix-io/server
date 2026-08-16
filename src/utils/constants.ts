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
 * Content header for http JSON application
 */
export const JSON_CONTENT_HEADER = {
  /** The MIME type for a JSON request/response body. */
  'Content-Type': 'application/json',
}

/**
 * Bearer-credential header per `@zanix/auth` auth type: `api` for machine-to-machine (`type:
 * 'api'`) credentials, `user` for end-user sessions. Centralized here — rather than in
 * `@zanix/auth` itself — since `@zanix/server` is already a shared dependency of every package
 * that needs to read or set these headers (`@zanix/auth`, `@zanix/notifications`, ...).
 */
export const AUTH_HEADERS = {
  api: 'X-Znx-Authorization',
  user: 'Authorization',
}

/**
 * Subject/session-status/app-token headers per `@zanix/auth` auth type. See {@link AUTH_HEADERS}
 * for why these live here instead of in `@zanix/auth`.
 */
export const SESSION_HEADERS = {
  api: {
    sub: 'X-Znx-Api-Id',
    session: 'X-Znx-Api-Session-Status',
    token: undefined,
  },
  user: {
    sub: 'X-Znx-User-Id',
    session: 'X-Znx-User-Session-Status',
    token: 'X-Znx-App-Token',
  },
}

/**
 * Rate-limit response headers set by `@zanix/auth`'s rate-limit guard.
 */
export const RATE_LIMIT_HEADERS = {
  limitHeader: 'X-Znx-RateLimit-Limit',
  remainingHeader: 'X-Znx-RateLimit-Remaining',
  resetHeader: 'X-Znx-RateLimit-Reset',
  retryAfterHeader: 'Retry-After',
}

/**
 * Miscellaneous shared headers not tied to a single auth type.
 */
export const GENERAL_HEADERS = {
  cookiesAcceptedHeader: 'X-Znx-Cookies-Accepted',
}

/**
 * Response header carrying the admin-protocol version a service's `/admin/*` routes implement
 * (see `@zanix/admin`'s protocol registry, which owns the actual version number —
 * `ADMIN_PROTOCOL_VERSION`). Just the header *name* lives here rather than in `@zanix/admin`
 * because a caller like `@zanix/notifications` needs it without depending on `@zanix/admin` —
 * which itself depends on `@zanix/notifications`, so that direction would be circular. The
 * version number itself is not centralized here on purpose: unlike the header name, it's expected
 * to change as `@zanix/admin`'s own protocol evolves, and that shouldn't require a `@zanix/server`
 * release. `@zanix/admin` deliberately keeps using this header name (via the `versionProtocol`
 * option's `header` override, see {@link PROTOCOL_VERSION_HEADER}) instead of the generic default,
 * for backward compatibility with its own already-shipped wire contract.
 */
export const ADMIN_PROTOCOL_HEADER = 'X-Znx-Admin-Protocol'

/**
 * Default response header carrying a controller's negotiated protocol version — see the
 * `versionProtocol` option accepted by `@Controller`/`@Resolver`/`@Socket`. Distinct from
 * {@link ADMIN_PROTOCOL_HEADER}, which a specific consumer (`@zanix/admin`) deliberately keeps
 * using instead of this default, for backward compatibility with its own existing wire contract.
 */
export const PROTOCOL_VERSION_HEADER = 'X-Znx-Protocol-Version'

/**
 * Default protocol version a handler declares when its `versionProtocol` option doesn't override
 * `version`.
 */
export const DEFAULT_PROTOCOL_VERSION = 1

/**
 * Response header carrying the Discovery envelope's own protocol version (see
 * `modules/discovery/provider.ts`'s `DISCOVERY_PROTOCOL_VERSION`) — kept as its own distinct
 * constant, not {@link PROTOCOL_VERSION_HEADER}'s generic default, for the same reason
 * {@link ADMIN_PROTOCOL_HEADER} is its own constant: the two values can diverge independently over
 * time (a bump to the framework's generic default protocol shouldn't silently look like a Discovery
 * envelope-shape change, or vice versa), even though both happen to start at `1` today.
 */
export const DISCOVERY_PROTOCOL_HEADER = 'X-Znx-Discovery-Protocol'

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
 * - `.connector.ts`: Defines connectors for external services or databases.
 * - `.provider.ts`: Manages providers that supply various services to the application.
 * - `.defs.ts`: Declares domain entities, metadata structures, and DSL-based definitions
 *               (including creation and registration logic) that form the foundation of the module.
 *
 * @constant
 */
export const ZANIX_SERVER_MODULES = [
  '.handler.ts',
  '.interactor.ts',
  '.connector.ts',
  '.provider.ts',
  '.defs.ts', // this should be the last dependency
]

export const HTTPMETHODS_WITHOUT_BODY = new Set([
  'GET',
  'DELETE',
  'HEAD',
  'CONNECT',
  'OPTIONS',
])
