import type { ConnectorOptions } from './targets.ts'

/**
 * Represents configuration options for a REST request,
 * based on {@link ConnectorOptions} interface and
 * the standard {@link RequestInit} interface,
 * but excluding the `method` and `body` properties-
 *
 * Use this type when you want to provide additional
 * fetch options without allowing the HTTP method or
 * request body to be overridden.
 *
 * @property {string} [baseUrl] - Optional base URL to prepend to request paths.
 */
export type RequestOptions = Omit<RequestInit, 'method' | 'body'> & ConnectorOptions & {
  /**
   * Optional base URL to prepend to request paths.
   */
  baseUrl?: string
}

/**
 * Represents configuration options for RESTful HTTP requests.
 *
 * This type is based on the standard {@link RequestInit} interface,
 * but excludes the `method` property so that it can be automatically
 * defined by higher-level REST helpers (e.g., `get`, `post`, `put`, `delete`).
 *
 * It also adds an optional `baseUrl` property that can be used
 * to define a common base URL for all requests.
 *
 * @property {string} [baseUrl] - Optional base URL to prepend to request paths.
 */
export type RestFullOptions = Omit<RequestInit, 'method' | 'body'> & {
  baseUrl?: string
  body?: Record<string, unknown> | unknown[]
}

/**
 * Configuration options for a GraphQL HTTP request.
 *
 * This type extends the native {@link RequestInit} interface, omitting
 * the `method` and `body` fields, since these are automatically handled
 * by the GraphQL client (which always uses `POST` and generates the request body).
 *
 * It also introduces an optional `baseUrl` property that can be used
 * to specify a shared root endpoint for all GraphQL operations.
 *
 * @property {string} [baseUrl] - Optional base URL to prepend to request paths.
 */
export type GqlOptions = Omit<RequestInit, 'method' | 'body'> & {
  baseUrl?: string
}
