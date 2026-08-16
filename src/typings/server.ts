import type { CorsOptions } from './middlewares.ts'
import type { GzipOptions } from './general.ts'
import type { HttpMethod } from './router.ts'
import type { CoreModules, ZanixConnectorsGetter, ZanixProvidersGetter } from './targets.ts'

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
 * - `port`/`dispatchKey`: this activation's own port and multiplexer key — what
 *   `WebServerManager.unmount()` needs to strip only ITS OWN entry from the port's shared
 *   `HandlerBox`, without touching any other Application sharing the same port.
 */
export type ServerManagerData = Record<
  ServerID,
  {
    _start: () => void
    stop: () => void | Promise<void>
    addr?: Deno.NetAddr
    protocol: string
    type: WebServerTypes
    port: number
    dispatchKey: string
  }
>

/** The handler function signature accepted by `Deno.serve` for a TCP-bound server. */
export type ServerHandler = Deno.ServeHandler<Deno.NetAddr>

/**
 * A handler tried *before* a server's normal dispatch (its own `handler`/the route-table-built
 * default from `getMainHandler`) on every incoming request for that server. Returning `null`/
 * `undefined` (sync or resolved) falls through to normal dispatch, unchanged; returning a
 * `Response` short-circuits it entirely — normal dispatch never runs for that request.
 *
 * This exists for concerns that must intercept requests ahead of route matching, on the exact
 * same port/origin as the server's own routes, without replacing the whole dispatcher the way
 * `ServerManagerOptions.handler` does (see its own doc — supplying `handler` opts out of
 * `getMainHandler` entirely). The reference use case is `@zanix/space`'s dev server: browser
 * requests for `/@vite/*`, transformed `.css`/Comet `.tsx` assets, etc. must be served before an
 * SSR page route is ever considered, on the same origin the page itself was rendered from.
 */
export type PreHandler = (
  request: Request,
  info: Deno.ServeHandlerInfo<Deno.NetAddr>,
) => Response | null | undefined | Promise<Response | null | undefined>

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

/**
 * What a `HealthCheckFn` receives — `providers`/`connectors` getters, same shape (and same
 * global-resolution semantics) as `ProgramModule.providers`/`.connectors`
 * (`modules/program/public.ts`) — the no-`ctxId` shorthand, since a health check has no real
 * request/session to scope a `SCOPED`-lifetime instance to; `SINGLETON`-lifetime providers/
 * connectors (the default for `@Provider`/`@Connector`) don't need one regardless. No
 * `interactors`: unlike `providers`/`connectors`, `ProgramModule` has no ctxId-less shorthand for
 * them — an interactor is a request-bound business-logic entry point, not something a
 * context-less, side-effect-free probe should invoke.
 */
export type HealthCheckContext = {
  providers: ZanixProvidersGetter<CoreModules>
  connectors: ZanixConnectorsGetter<CoreModules>
}

/**
 * A single named readiness check — used by `HealthOptions.checks` and internally for each
 * auto-discovered core connector (`ZanixConnector.isHealthy`). A thrown/rejected check is treated
 * as `false` (unhealthy), never crashes the readiness handler. The `context` parameter is optional
 * to use — a check that only needs its own closure (`() => true`) can ignore it entirely.
 */
export type HealthCheckFn = (
  this: HealthCheckContext,
  context: HealthCheckContext,
) => Promise<boolean> | boolean

/**
 * Object form of `BootstrapServerOptions.health` — see that property's own doc for the full
 * `boolean | HealthOptions` shape, defaults, and where `/health`/`/ready` end up registered.
 */
export type HealthOptions = {
  /**
   * Liveness path. Default `/health`. A single path segment — the multiplexer dispatches by first
   * path segment only (same constraint GraphQL's own `globalPrefix`-as-path registration already
   * has), so a multi-segment custom value (e.g. `/status/health`) only the first segment
   * (`status`) is actually matched against.
   */
  path?: string
  /** Readiness path. Default `/ready`. Same single-path-segment constraint as {@link path}. */
  readyPath?: string
  /**
   * Named checks merged into — never replacing — the auto-discovered core-connector checks used
   * for readiness. Each receives a `HealthCheckContext` (`providers`/`connectors` getters) to
   * reach any registered provider/connector — not just the auto-discovered core ones — without
   * hand-rolling `ProgramModule` lookups. `/health` (liveness) never runs any check, by design: a
   * liveness probe must never depend on an external connector, or a temporarily-down dependency
   * would trigger orchestrator restart storms instead of just failing readiness.
   */
  checks?: Record<string, HealthCheckFn>
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
    /**
     * Whether this server's own default handler attaches the original `Request` (via
     * `attachRequestToError`) to any error that reaches `Deno.serve`'s `onError` uncaught — lets a
     * downstream `onError` inspect the request that triggered the error (e.g. to content-negotiate
     * a fragment response for a client-side router) by explicitly calling `getRequestFromError(error)`
     * inside that handler, without this package needing to know what any specific header means.
     *
     * Applies uniformly to every error that actually reaches `onError`, not just one kind: route
     * matching's own `NOT_FOUND`/`METHOD_NOT_ALLOWED`, the CORS guard's `BAD_REQUEST`/
     * `METHOD_NOT_ALLOWED`, and any custom `guard`/`pipe` throw — all follow the same uncaught path.
     * A handler-body/interceptor error is never included: `routerInterceptor` always catches those
     * itself and converts them directly to a `Response`, so they never reach `onError` regardless of
     * this option.
     *
     * **The attached request is never logged automatically — nothing surfaces it unless a consumer
     * explicitly calls `getRequestFromError`.** It's stored as a non-enumerable property, so it's
     * invisible to `serializeError`/`console.error(error)`/`JSON.stringify` — confirmed directly
     * against this package's own `getExtendedErrorResponse` (client response) and `logAppError`
     * (backend logging): neither one ever shows it. That said, non-enumerable is obscurity, not a
     * hard boundary — `Object.getOwnPropertyNames(error)` still lists `"request"` as a real key, and
     * `error.request` reads it directly without going through `getRequestFromError` at all. This is
     * exactly why the option defaults to `false` instead of relying on non-enumerability alone:
     * something that walks an error's *every* own property regardless of enumerability (a verbose
     * error-reporting/observability SDK, for instance) would still see it once attached, so it's
     * simply never attached at all unless a consumer has deliberately decided that tradeoff is worth
     * it and reads the request out explicitly. Defaults to `false` for exactly that reason: a
     * `Request` can carry sensitive data (`Authorization`, cookies).
     *
     * @default false
     */
    attachRequestToErrors?: boolean
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
  /**
   * Tried before `handler`/the route-table-built default, on every request — see `PreHandler`'s
   * own doc for the fall-through contract and its reference use case.
   */
  preHandler?: PreHandler
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
export type BootstrapServerOptions =
  & Partial<
    {
      [K in WebServerTypes]: Required<ServerManagerOptions<K>>['server'] & {
        /**
         * Callback, which is invoked with the server `id` when the server is created.
         */
        onCreate?: (id: ServerID) => void
        /**
         * The Application (see `docs/APPLICATIONS.md`'s "Applications" section) whose routes/resolvers/
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
        /**
         * Tried before this server's own dispatch on every request — see `PreHandler`'s own doc for
         * the fall-through contract. Forwarded as-is into `WebServerManager.create`'s own
         * `preHandler` option; `bootstrapServers` never inspects or calls it itself.
         */
        preHandler?: PreHandler
      }
    }
  >
  & {
    /**
     * Framework-managed liveness/readiness endpoints (`/health`/`/ready` by default) — same
     * `boolean | Options` shape `versionProtocol` already establishes for "on by default, override
     * fine, or off" (`middlewares/protocol-version.ts`'s `VersionProtocolOption`). Omitted/`true`
     * enables with defaults; an object overrides `path`/`readyPath`/`checks`; `false` disables
     * entirely.
     *
     * A sibling of `rest`/`graphql`/`socket`/`ssr`, not nested under any one of them: it's
     * registered automatically on EVERY port that ends up hosting real content across all four
     * types in this call — including `ssr` (its own unprefixed, catch-all dispatch key coexists
     * safely with health's exact-match keys, verified empirically) — and never the sole reason a
     * listener starts (see `hasRoutesForScope`'s own check in `bootstrapServers`). A consumer's own route
     * already occupying the resolved `path`/`readyPath` on that same port is left alone — the
     * framework default is skipped wherever something already answers there, no error, no separate
     * "override" flag. When two or more Applications share a port, `/health` is registered once
     * (first claim wins — it never varies per Application), but `/ready` aggregates EVERY sharing
     * Application's own `checks` into a `{status, shared, apps: {[application]: {status, checks}}}`
     * response — `shared` holds the process-wide, auto-discovered connector checks (not owned by
     * any one Application), `apps` breaks out each Application's own `checks` by name; see
     * `WebServerManager.create`'s own doc for exactly how this accumulates.
     */
    health?: boolean | HealthOptions
  }
