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
 * An opaque handle identifying a managed server instance — returned by `WebServerManager.create`
 * (and `bootstrapServers`' `onCreate` callback), used to `start`/`stop`/`delete`/`info` it later.
 *
 * Not required to look like a UUID, and nothing validates that shape — the default value
 * `WebServerManager.create` generates happens to (hex-encoded type + `crypto.randomUUID()`), but a
 * caller-supplied `serverID`/`BootstrapServerOptions[type].id` can be any string. The one real
 * constraint applies only to an *anchored* server (one given an explicit
 * `BootstrapServerOptions[type].id`), since its id doubles as a URL path prefix routes are
 * dispatched under: it must match `[a-z0-9_-]+` once normalized (case/slashes) — `compileRuntime`
 * throws an `InternalError` otherwise. That check lives at runtime in `runtime.ts`, not in this
 * type, since TypeScript can't express a charset constraint via a template literal.
 */
export type ServerID = string

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

/**
 * The result of resolving a `RuntimeActivation` (Application + prefix/id — see `runtime.ts`'s
 * `compileRuntime`) into a concrete, physical server activation. This is what
 * `WebServerManager.create` actually consumes: id-anchoring/dispatch resolution happens entirely
 * before `create` is ever called, at composition time, never inside `WebServerManager` itself —
 * and never derived from the Application name alone (see `RuntimeActivation.explicitId`'s own doc).
 */
export type Runtime = {
  /** The Application this activation serves — see `bootstrapServers`'s own `application` option. */
  application: string
  /** The resolved, already-validated server id (see `ServerID`'s own doc for the validation rule). */
  serverID: ServerID
  /** The multiplexer's per-port dispatch key — see `WebServerManager.create`'s own remarks. */
  dispatchKey: string
  /** The route-table path prefix this activation's handler is compiled against. */
  routeHandlerPrefix: string
  /**
   * The previous id's own dispatch key, present only when `RuntimeActivation.previousId` was
   * given — see `WebServerManager.create`'s own remarks on rotation.
   */
  previousDispatchKey?: string
  /** The previous id's own route-table path prefix — paired with {@link previousDispatchKey}. */
  previousRouteHandlerPrefix?: string
}

/**
 * A stable, long-lived container for one port's dispatch table — the box a running `Deno.serve()`
 * listener's multiplexer closes over. `current` is never mutated in place: each new registration on
 * the same port produces an entirely new, frozen table and reassigns `current` to it in a single
 * atomic pointer swap, so any in-flight request always sees either the fully-old or fully-new table,
 * never a partially-written one — see `WebServerManager.create`'s own remarks on sharing a port.
 */
export type HandlerBox = {
  current: Readonly<Record<string, ServerHandler>>
}

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
 *
 * Which Application this server activates, and whether it gets the id-anchored/obscured-URL
 * treatment, are never one of these options — `WebServerManager.create`'s own `runtime` parameter
 * (a `Runtime`, see its own doc) already carries that resolution, pre-compiled, by the time
 * `create` runs. Direct callers that need that behavior build one via `compileRuntime`
 * (`runtime.ts`) and pass it explicitly; `bootstrapServers` already does this for its own
 * `BootstrapServerOptions[type].application`/`.id` options.
 */
export type ServerManagerOptions<K extends WebServerTypes> = {
  /** A function or object responsible for handling incoming server requests. */
  handler?: ServerHandler
  /** Server options configuration. */
  server?: ServerOptions<K>
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
       * The Application (see `docs/HANDLERS.md`'s "Applications" section) whose routes/resolvers/
       * sockets this server mounts — only capabilities registered under this exact Application are
       * served; a capability never leaks onto a server built for a different one. Defaults to the
       * default Application (`'main'`) when omitted. `bootstrapServers` resolves this into a
       * `Runtime` (via `compileRuntime`) before ever calling `WebServerManager.create` — see that
       * type's own doc for what "resolving" actually means.
       *
       * **Purely an ownership/composition boundary — carries no URL-anchoring or exposure meaning
       * of its own.** A non-default Application (`'admin'`, `'billing'`, `'metrics'`, ...) is not,
       * by itself, "internal" or hidden — it's just a different named composition boundary. Set
       * `id` (below) if this server's own id should double as an obscuring URL prefix; nothing
       * about `application`'s value implies that on its own.
       */
      application?: string
      /**
       * An explicit id to use for this server instead of a randomly generated one — see
       * `compileRuntime`'s own `explicitId` parameter. When given, this server's own id doubles as
       * an anchoring, obscuring URL prefix instead of a plain `globalPrefix`-based one — **a server
       * is anchored if and only if this is set; there is no auto-generated/random anchored id**.
       * Must match `[a-z0-9_-]+` once normalized, or `compileRuntime` throws.
       *
       * A `globalPrefix` given alongside an explicit `id` doesn't replace the id-based prefix —
       * it's appended as an extra segment after it (`{id}/{globalPrefix}/...`) instead; omitting
       * `globalPrefix` keeps the route path exactly `{id}/...`.
       *
       * **This is a routing/obscurity boundary only** — no automatic authentication, authorization, or
       * network-level restriction is applied. Add an explicit guard (e.g. `@zanix/auth`'s
       * `AuthTokenValidation`) if a route needs real protection, and give the server its own distinct
       * port/network segment if it needs real network isolation.
       */
      id?: ServerID
      /**
       * A previous `id` to keep dispatching alongside the current one, for a bounded manual
       * rotation window — both prefixes reach the same routes simultaneously while this is set, so
       * callers still using the old address keep working until they're updated to the new one. Only
       * meaningful alongside `id`; `compileRuntime` throws if given without it. See
       * `resolvePreviousApplicationServerId` for the built-in rotation runbook any
       * Application-scoped server can use.
       */
      previousId?: ServerID
    }
  }
>
