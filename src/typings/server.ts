import type { CorsOptions } from './middlewares.ts'
import type { GzipOptions } from './general.ts'
import type { HttpMethod } from './router.ts'

/**
 * Represents the various types of web servers that can be managed by the system.
 *
 * - `'graphql'`: Handles GraphQL API requests.
 * - `'rest'`: Handles RESTful API requests.
 * - `'socket'`: Handles WebSocket connections.
 * - `'ssr'`: Handles SSR server.
 */
export type WebServerTypes = 'graphql' | 'rest' | 'socket' | 'ssr'

/**
 * Represents the server identificator
 */
export type ServerID = `${string}-${string}-${string}-${string}-${string}`

/**
 * Represents the runtime data and control functions for each managed server.
 *
 * Each key corresponds to a `ServerID` value, and maps to an object that includes:
 *
 * - `_start`: A function to start the server instance.
 * - `stop`: A function to stop the server. Can be synchronous or return a `Promise`.
 * - `addr` (optional): The network address the server is bound to (`Deno.NetAddr`).
 * - `protocol`: The communication protocol used (e.g., 'http', 'https').
 * - `type`: The web server type this entry represents (`'graphql'`, `'rest'`, `'socket'`, `'ssr'`).
 */
export type ServerManagerData = Record<
  ServerID,
  {
    _start: () => void
    stop: () => void | Promise<void>
    addr?: Deno.NetAddr
    protocol: string
    type: WebServerTypes
  }
>

/** The handler function signature accepted by `Deno.serve` for a TCP-bound server. */
export type ServerHandler = Deno.ServeHandler<Deno.NetAddr>

/** Narrows `CorsOptions.allowedMethods` to a specific subset of `HttpMethod`s. */
export type CorsAllowedMethods<Methods extends HttpMethod> =
  & CorsOptions
  & Omit<CorsOptions, 'allowedMethods'>
  & {
    allowedMethods?: Extract<HttpMethod, Methods>[]
  }

/**
 * Configuration options for the server.
 *
 * Combines:
 * - `Deno.ServeTcpOptions`: Basic TCP server options.
 * - Optionally includes TLS configuration using `Deno.TlsCertifiedKeyPem` if TLS is enabled.
 *
 * Additional Options:
 * - `onceStop` (optional): A callback function that is called once when the server stops.
 * - `ssl` (optional): SSL certificate keyPair values
 * - `globalPrefix` (optional): A global route prefix for the API.
 * - `gzip` (optional): For controlling GZIP compression.
 * - `cors` (optional): Configuration options for Cross-Origin Resource Sharing (CORS).
 */
export type ServerOptions<K extends WebServerTypes = never> =
  & (Deno.ServeTcpOptions | (Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem))
  & {
    onceStop?: () => void
    /**
     * SSL certificate keyPair values
     */
    ssl?: { key: string; cert: string }
    /**
     * Configuration options for Cross-Origin Resource Sharing (CORS).
     */
    cors?: 'socket' extends K ? Pick<CorsOptions, 'origins'>
      : 'graphql' extends K ? CorsAllowedMethods<'GET' | 'POST'>
      : 'ssr' extends K ? Omit<CorsOptions, 'allowedMethods'>
      : CorsOptions
    /**
     * Options for controlling GZIP compression.
     *
     * Can either be `false` to disable compression entirely,
     * or an object with optional settings.
     */
    gzip?: GzipOptions
    /**
     * A global route prefix for the server.
     */
    globalPrefix?: string
  }

/**
 * Options for configuring a server manager instance.
 *
 * Properties:
 * - `handler` (optional): A function or object responsible for handling incoming server requests.
 * - `server` (optional): Server options configuration.
 * - `isInternal` (optional):  When `true`, this server is considered internal and will be assigned its own
 *        dynamically generated UUID as the global prefix. This helps distinguish and isolate
 *        internal server instances from public ones.
 */
export type ServerManagerOptions<K extends WebServerTypes> = {
  /** A function or object responsible for handling incoming server requests. */
  handler?: ServerHandler
  /** Server options configuration. */
  server?: ServerOptions<K>
  /**
   * When `true`, this server is considered internal and will be assigned its own
   * dynamically generated UUID as the global prefix. This helps distinguish and isolate
   * internal server instances from public ones.
   */
  isInternal?: boolean
}

/**
 * Configuration options used to set up server instances for various web server types.
 *
 * This type allows partial configuration of one or more supported server types: `'graphql'`, `'rest'`, `'socket'`, and `'ssr'`.
 *
 * @property {Object} [server] - An optional object where each key is a web server type (`'graphql'`, `'rest'`, or `'socket'`),
 * and the value is a partial server configuration specific to that type.
 *
 * For each server type:
 * - It extends the `server` property from `ServerManagerOptions<T>`, where `T` is the server type.
 * - Additionally, it allows an optional `onCreate` callback that is invoked with a server `id` when the server is created.
 *
 * Example:
 * ```ts
 * {
 *     graphql: {
 *       globalPrefix: '/api',
 *       onCreate: (id) => console.log(`GraphQL server started with ID ${id}`)
 *     },
 *     socket: {
 *       port: 3001,
 *       onCreate: (id) => console.log(`Socket server started with ID ${id}`)
 *     }
 * }
 * ```
 */
export type BootstrapServerOptions = Partial<
  {
    [K in WebServerTypes]: Required<ServerManagerOptions<K>>['server'] & {
      /**
       * Callback, which is invoked with the server `id` when the server is created.
       */
      onCreate?: (id: ServerID) => void
      /**
       * When `true`, all servers created by this
       * function are considered internal. Each internal server will be assigned its own
       * dynamically generated UUID as the global prefix. This helps distinguish and isolate
       * internal server instances from public ones.
       */
      isInternal?: boolean
    }
  }
>
