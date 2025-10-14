/**
 * Represents the various types of web servers that can be managed by the system.
 *
 * - `'static'`: Serves static files (HTML, CSS, JS, etc.).
 * - `'graphql'`: Handles GraphQL API requests.
 * - `'rest'`: Handles RESTful API requests.
 * - `'socket'`: Handles WebSocket connections.
 * - `'admin'`: Serves an admin panel or dashboard.
 * - `'custom'`: A user-defined server type not covered by the predefined categories.
 */
export type WebServerTypes =
  | 'static'
  | 'graphql'
  | 'rest'
  | 'socket'
  | 'admin'
  | 'custom'

/**
 * Represents the runtime data and control functions for each managed server type.
 *
 * Each key corresponds to a `WebServerTypes` value, and maps to an object that includes:
 *
 * - `_start`: A function to start the server instance.
 * - `stop`: A function to stop the server. Can be synchronous or return a `Promise`.
 * - `addr` (optional): The network address the server is bound to (`Deno.NetAddr`).
 * - `protocol` (optional): The communication protocol used (e.g., 'http', 'https').
 */
export type ServerManagerData = Record<
  WebServerTypes,
  {
    _start: () => void
    stop: () => void | Promise<void>
    addr?: Deno.NetAddr
    protocol?: string
  }
>

export type ServerHandler = Deno.ServeHandler<Deno.NetAddr>

/**
 * Configuration options for the server.
 *
 * Combines:
 * - `Deno.ServeTcpOptions`: Basic TCP server options.
 * - Optionally includes TLS configuration using `Deno.TlsCertifiedKeyPem` if TLS is enabled.
 *
 * Additional Options:
 * - `onceStop` (optional): A callback function that is called once when the server stops.
 * - `ssl`(optional): SSL certificate
 */
export type ServerOptions =
  & (Deno.ServeTcpOptions | (Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem))
  & {
    onceStop?: () => void
    ssl?: { key: string; cert: string }
  }

/**
 * Options for configuring a server manager instance.
 *
 * @template T The type of server being managed (e.g., 'graphql', 'rest', etc.)
 *
 * Properties:
 * - `handler` (optional): A function or object responsible for handling incoming server requests.
 * - `server` (optional): Server configuration. If `T` is `'graphql'` or `'rest'`, this includes:
 *   - `globalPrefix` (optional): A global route prefix for the API.
 *   - Inherits all `ServerOptions`.
 *   Otherwise, it only includes `ServerOptions`.
 */
export type ServerManagerOptions<T extends WebServerTypes> = {
  handler?: ServerHandler
  server?: T extends 'graphql' | 'rest' ? { globalPrefix?: string } & ServerOptions
    : ServerOptions
}
