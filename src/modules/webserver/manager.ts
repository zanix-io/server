import type {
  HandlerBox,
  HealthCheckFn,
  Runtime,
  ServerHandler,
  ServerID,
  ServerManagerData,
  ServerManagerOptions,
  WebServerTypes,
} from 'typings/server.ts'

import type { ResolvedHealthOptions } from './health.ts'

import { capitalize, cleanRoute, fileExists } from '@zanix/helpers'
import { getMainHandler, multiplexer } from './helpers/handler.ts'
import { onErrorListener, onListen } from './helpers/listeners.ts'
import ProgramModule from 'modules/program/mod.ts'
import { compileRuntime } from './runtime.ts'
import { buildLivenessHandler, buildReadinessHandler } from './health.ts'
import { getPrefix } from 'utils/routes.ts'
import { InternalError } from '@zanix/errors'
import logger from '@zanix/logger'

/**
 * WebServerManager is a utility class for managing web servers with optional SSL support.
 * It provides methods for creating, starting, stopping, and deleting web servers, as well as retrieving information about running servers.
 * The class allows both HTTP and HTTPS protocols, with the SSL certificate and key provided via environment variables or directly through the options parameter.
 */
export class WebServerManager {
  // Each PORT's own `HandlerBox` is a stable, long-lived container — never replaced once created,
  // only ever swapped via its own `current` field (see `create()`). This is a deliberate, narrowly
  // scoped exception to "Application composition → capability registration → Runtime activation →
  // immutable server," not a contradiction of it: each individual server's own Runtime (its
  // dispatchKey → handler pairing, resolved once at `create()` time) never changes again once set.
  // What the box accounts for is a genuinely real, already-shipped requirement one level up — a
  // PORT shared by two independently-activated servers, where the second one's `create()` call can
  // happen *after* the first has already bound the real `Deno.serve()` socket (e.g. `@zanix/core`'s
  // `start.ts` fully creates+starts its `'admin'`-Application server before the default-Application
  // one is even created — see `shared-port.test.ts`). Reordering every caller so all `create()`
  // calls for a port always precede that port's own first `start()` would remove the need for this
  // entirely, but `bootstrapServers`'s own multi-call boot-sequence contract (`finalize: false`)
  // doesn't guarantee that ordering today, so the box is what makes sharing safe regardless.
  #handlers: Record<number, HandlerBox> = {}
  #servers: Partial<ServerManagerData> = {}
  #sslOptions: { key?: string; cert?: string } = {}
  // Ports that already got a liveness default registered — see `create()`'s own health block.
  // Lives alongside `#handlers` for the same reason: a port's real listener, not any one
  // Application, is the unit liveness cares about — it never varies per Application (always the
  // same cheap `{status:'ok'}`), so there's nothing to merge, first claim simply wins. Cleared in
  // the same `finished.then()` that clears `#handlers`'s own entry for that port, so a later
  // `create()` on a reused port number starts fresh.
  #livenessPorts: Set<number> = new Set()
  // Per-port, per-Application accumulation of `HealthOptions.checks` — unlike liveness, readiness
  // genuinely varies per Application (see `buildReadinessHandler`'s own `{shared, apps}` doc), so
  // every Application sharing a port that opts into health gets its own entry merged in here, and
  // the readiness handler is rebuilt from the full accumulator on every `create()` call for that
  // port — never "first Application wins, the rest are silently dropped" like liveness. Cleared
  // alongside `#livenessPorts`/`#handlers` for the same port-reuse reason.
  #readinessChecksByPort: Map<
    number,
    Map<string, Record<string, HealthCheckFn>>
  > = new Map()

  /**
   * Initializes the WebServerManager instance and loads ports and SSL options from environment variables (`SSL_KEY_PATH` and `SSL_CERT_PATH`).
   */
  constructor() {
    // SSL validation
    const sslKeyPath = Deno.env.get('SSL_KEY_PATH')
    const sslCertPath = Deno.env.get('SSL_CERT_PATH')

    // TODO: review for downloading ssl files on web using these paths or base64 solution support
    if (
      sslKeyPath && sslCertPath && fileExists(sslKeyPath) &&
      fileExists(sslCertPath)
    ) {
      this.#sslOptions = {
        cert: Deno.readTextFileSync(sslCertPath),
        key: Deno.readTextFileSync(sslKeyPath),
      }
    }
  }

  /**
   * Private start function
   * @param id
   * @returns
   */
  #start(id: ServerID) {
    const server = this.#servers[id]
    if (!server || server.addr) return
    server._start()
  }

  /**
   * private getEnvPort
   * @param type
   * @param port
   * @returns
   */
  private getEnvPort = (type: WebServerTypes) => {
    const portValue = Deno.env.get(`PORT_${type.toUpperCase()}`) ||
      Deno.env.get('PORT')

    if (!portValue) return

    return Number(portValue)
  }

  /**
   * Creates a new web server with the specified name and handler.
   * If a server with the same id already exists, it returns the existing server as-is.
   *
   * @param {WebServerTypes} type - The name of the server (e.g., "rest", "static").
   * @param {ServerManagerOptions} [options={}] - Options that include the function to handle incoming requests and configuration for the server, such as SSL options and the `onListen` callback. `options.preHandler`, when given, is tried before `handler` on every request — see `PreHandler`'s own doc.
   * @param {Runtime} [runtime] - An already-compiled `Runtime` (see `compileRuntime`, `runtime.ts`)
   * — the sole boundary `create` accepts for Application/anchoring/dispatch info. `create` never
   * derives any of that itself: resolving it happens entirely in `compileRuntime`, before `create`
   * ever runs. Defaults to `compileRuntime(type, { globalPrefix: options.server?.globalPrefix })`
   * (the default Application, unanchored, a freshly generated id, dispatching by whatever
   * `globalPrefix` `options.server` already declares) when omitted — `bootstrapServers` always
   * passes its own explicitly-compiled `Runtime` instead, reflecting its
   * `BootstrapServerOptions[type].application`/`.id` options. **Not validated against an
   * existing entry's own `type`/options** — if you pass a `Runtime` whose `serverID` is already
   * registered under a different config, `create` silently keeps the original registration and
   * discards yours (same idempotent-reuse rule as the "same id already exists" case above).
   * @param {ResolvedHealthOptions} [health] - Already-resolved `BootstrapServerOptions.health`
   * (see `resolveHealthOptions`, `health.ts`) — `undefined` registers nothing.
   * `/health`/`/ready` (or `health.path`/`.readyPath`) are added as raw, top-level entries in this
   * call's own port dispatch table — the SAME mechanism this method uses for its own primary/
   * previous-rotation entries just below, never through `ProgramModule.routes`/`routeProcessor`
   * like a normal REST route, since a normal route would inherit this server's own `globalPrefix`
   * and stop being reachable at the literal, unprefixed path an orchestrator probe expects.
   * Liveness is first-claim-wins: skipped once this exact port already has an entry at that
   * dispatch key, or a consumer's own registration already occupies it. Readiness is different —
   * every Application sharing the port that opts into health contributes its own `checks`, merged
   * (never dropped) into a single `{shared, apps}` response — see `buildReadinessHandler`'s own
   * doc and `#readinessChecksByPort`'s own doc for the accumulation mechanism.
   * @returns {ServerID} The id of the created server, or the given/existing id if a
   * server with that id was already registered (the existing server is left untouched).
   *
   * @remarks Sharing a port. Two (or more) servers — of the same or different `type`, anchored or
   * not — that resolve to the same port share one real `Deno.serve()` listener; whichever one calls
   * `start()` first is the one that actually binds the socket, and every later one on that port just
   * reuses its address. Consequences worth knowing:
   *
   * `runtime.previousDispatchKey`/`.previousRouteHandlerPrefix` (present when `compileRuntime` was
   * given a `previousId`) register a SECOND handler on this same port, alongside the primary one,
   * built the same way (`getMainHandler` with the previous prefix) — this is what lets a caller
   * still using the old anchored address keep working during a manual rotation window. Only
   * applied when `options.handler` wasn't explicitly given: a caller supplying a fully custom
   * handler bypasses prefix-based table-building entirely, so rotation for that case is the
   * caller's own responsibility, not something this method infers.
   * - **The first bind's own `server` options (SSL, hostname, etc.) are what apply to the real
   *   socket.** A later server's own `server` options only ever affect its own route table, never
   *   the socket itself.
   * - **Stopping a server that only reused an address is a no-op** — it never gets its own real
   *   `stop()`. To actually release the port, stop the server that bound it first.
   * - There's a narrow window, right after the first server binds the port and before every other
   *   server sharing it has finished its own `create()` call, where a request matching one of the
   *   not-yet-registered servers' routes gets a `NOT_FOUND` instead of reaching its handler.
   */
  public create<T extends WebServerTypes>(
    type: T,
    options: ServerManagerOptions<T> = {},
    runtime: Runtime = compileRuntime(type, {
      globalPrefix: options.server?.globalPrefix,
    }),
    health: ResolvedHealthOptions | undefined = undefined,
  ): ServerID {
    const {
      preHandler,
      server: { onceStop, ssl, gzip, cors, attachRequestToErrors, ...opts } = {},
    } = options

    const {
      serverID,
      dispatchKey,
      routeHandlerPrefix,
      application,
      previousDispatchKey,
      previousRouteHandlerPrefix,
    } = runtime

    if (this.#servers[serverID]) return serverID

    const usingDefaultHandler = !options.handler
    const {
      handler = getMainHandler(type, application, routeHandlerPrefix, {
        cors,
        gzip,
        attachRequestToErrors,
      }),
    } = options
    // `preHandler` wraps whichever `handler` was just resolved (default or caller-supplied) — it
    // never replaces it. Only this dispatch key's own handler is wrapped; a `previousDispatchKey`
    // entry (rotation window, below) always dispatches straight to its own `getMainHandler` build,
    // unwrapped — `preHandler` is a concern of the CURRENT id, not the one being rotated away from.
    const dispatchHandler: ServerHandler = preHandler
      ? async (req, info) => (await preHandler(req, info)) ?? await handler(req, info)
      : handler

    const { onListen: currentListenHandler, onError: currentErrorHandler } = opts

    // Port assignment
    opts.port = this.getEnvPort(type) || opts.port || 8000 //default port

    if (!this.#sslOptions && ssl) {
      this.#sslOptions = { cert: ssl.cert, key: ssl.key }
    }

    // Protocol assignment
    const baseProtocol = type === 'socket' ? 'ws' : 'http'
    const protocol = this.#sslOptions.cert ? `${baseProtocol}s` : baseProtocol

    // Ssl assignment
    Object.assign(opts, { ...this.#sslOptions })

    // Listener assignment
    const serverInfo = `${capitalize(application)} ${type}`
    opts.onListen = onListen(currentListenHandler, protocol, serverInfo)
    opts.onError = onErrorListener(currentErrorHandler, serverInfo)

    // Never mutate the port's existing dispatch table in place — each registration builds an
    // entirely new, frozen table and swaps the box's own `current` pointer to it in one atomic
    // assignment (see the class field's own doc for why the box exists at all). A listener already
    // bound on this port (via an earlier `create()`+`_start()`) still sees handlers registered by a
    // *later* `create()` call on the same port, since `multiplexer()` closes over the box itself and
    // dereferences `current` fresh per request; it just never sees a table that's partway through
    // being built.
    const box = this.#handlers[opts.port] ??= { current: Object.freeze({}) }
    // `compileRuntime` never produces `previousDispatchKey`/`previousRouteHandlerPrefix` for a
    // `graphql` Runtime (see its own doc) — GraphQL rotation isn't supported, so this branch only
    // ever builds a second handler for `rest`/`socket`, whose own route table is read
    // non-destructively from `ProgramModule.routes` on every build.
    const previousHandlerEntry = usingDefaultHandler && previousDispatchKey &&
        previousRouteHandlerPrefix
      ? {
        [previousDispatchKey]: getMainHandler(
          type,
          application,
          previousRouteHandlerPrefix,
          {
            cors,
            gzip,
            attachRequestToErrors,
          },
        ),
      }
      : {}
    box.current = Object.freeze({
      ...box.current,
      [dispatchKey]: dispatchHandler,
      ...previousHandlerEntry,
    })

    // Health/readiness — see this method's own `@param health` doc and `health.ts`. Liveness is an
    // all-or-nothing, first-claim-wins default (it never varies per Application — see
    // `#livenessPorts`'s own doc). Readiness instead ACCUMULATES across every Application sharing
    // this port: each `create()` call that opts into health contributes its own
    // `HealthOptions.checks` to `#readinessChecksByPort`, and the merged handler is rebuilt every
    // time — otherwise the first Application to claim the port would silently own `/ready` for
    // every other Application sharing it, with their own checks never even attempted.
    if (health) {
      const livenessKey = getPrefix(health.path)
      const readinessKey = getPrefix(health.readyPath)

      // A real override at the literal path is only detectable — and only possible — for a
      // genuinely unprefixed/unanchored dispatch (`dispatchKey === ''`, the multiplexer's own
      // catch-all — see `multiplexer`'s own doc): that's the only case where a controller's own
      // registered `path` IS the final reachable URL, with no `globalPrefix`/anchoring segment
      // ever prepended to it. For anything else (an anchored server, or one with a real
      // `globalPrefix`), a controller decorated with a raw path that happens to equal `/health`
      // is never actually reachable there once served — checking the route registry in that case
      // would risk a FALSE positive (skipping the framework default over a route that was never
      // really at this literal URL to begin with), so this lookup is skipped entirely then, same
      // as before this fix.
      const hasOwnRouteAt = (path: string): boolean =>
        dispatchKey === '' &&
        !!ProgramModule.routes.getRoutes(type)
          ?.[`${application}:${cleanRoute(path)}/GET`]

      const additions: Record<string, ServerHandler> = {}

      if (!this.#livenessPorts.has(opts.port)) {
        if (!(livenessKey in box.current) && !hasOwnRouteAt(health.path)) {
          additions[livenessKey] = buildLivenessHandler()
          logger.info(
            `${capitalize(type)} sever route:`,
            `/${livenessKey}`,
            '| Method: GET',
            'noSave',
          )
        }
        this.#livenessPorts.add(opts.port)
      }

      if (!hasOwnRouteAt(health.readyPath)) {
        const isFirstForPort = !(readinessKey in box.current)
        const appChecks = this.#readinessChecksByPort.get(opts.port) ??
          new Map()
        appChecks.set(application, health.checks)
        this.#readinessChecksByPort.set(opts.port, appChecks)

        additions[readinessKey] = buildReadinessHandler(appChecks)
        if (isFirstForPort) {
          logger.info(
            `${capitalize(type)} sever route:`,
            `/${readinessKey}`,
            '| Method: GET',
            'noSave',
          )
        }
      }

      if (Object.keys(additions).length) {
        box.current = Object.freeze({ ...box.current, ...additions })
      }
    }

    const handlers = this.#handlers
    const currentServers = this.#servers
    const livenessPorts = this.#livenessPorts
    const readinessChecksByPort = this.#readinessChecksByPort

    currentServers[serverID] = {
      _start() {
        const port = opts.port as number

        try {
          // Any other already-started server bound to this exact port is reused, regardless of
          // `type` — this is what lets an unanchored and an anchored server of the *same* `type`
          // share one physical listener (see `dispatchKey` above), not just different types (the
          // pre-existing REST+GraphQL+Socket-on-one-port case). The server that reuses an address
          // never calls `Deno.serve()` itself, so whichever server bound the port first is the one
          // whose own options (SSL, hostname, etc.) actually apply to the real socket — a later
          // reuser's own `server.*` options only ever affect its own route table, never the socket.
          // Also: stopping a *reusing* server is a no-op (it never gets its own `this.stop`
          // override below) — only stopping the server that actually bound the port shuts the real
          // listener down. This is pre-existing behavior for the cross-type case, now also true
          // for same-type sharing.
          const existingServer = Object.values(currentServers).find((server) =>
            server?.addr?.port === opts.port
          )

          if (existingServer) {
            // Deliberately NEVER delete `handlers[port]` here: the real `Deno.serve()` listener
            // (bound by whichever server's own `_start()` ran first) closes over the box OBJECT at
            // `handlers[port]`, not over this map entry — but a THIRD (or later) server sharing the
            // same port still calls `create()` before its own `_start()`, and `create()`'s `??=`
            // (see above) only reuses that same live box if the map entry still points to it.
            // Deleting it here orphans that box from the map, so any later `create()` on this port
            // builds a brand-new, disconnected table the running listener never sees — the server
            // ends up reporting the correct `addr` (copied from `existingServer` below) while every
            // one of its own routes 404s. Previously this line assumed exactly two servers ever
            // shared a port; this class's own doc always described "two (or more)".
            const addr = existingServer.addr
            logger.success(
              `${serverInfo} server is running at ${protocol}://${addr?.hostname}:${addr?.port}`,
            )
            return this.addr = addr
          }

          const server = Deno.serve(opts, multiplexer(handlers[port]))
          this.addr = server.addr

          server.finished.then(() => {
            // Safe HERE, unlike the reuse branch above: `finished` only resolves once THIS real
            // listener (the one every reuser on this port depends on) has actually stopped — no
            // live reference to `handlers[port]`'s box can still need it. A later `create()` call
            // for this same port number would need (and correctly get, via `??=`) a brand-new box
            // anyway, since reusing this one would mean binding a listener that no longer exists.
            delete handlers[port]
            // Same reasoning applies to `#livenessPorts`/`#readinessChecksByPort` — a later
            // `create()` on this reused port number gets a brand-new box with no health entries in
            // it, so it must be free to register its own defaults again from scratch.
            livenessPorts.delete(port)
            readinessChecksByPort.delete(port)
            onceStop?.()
          })
          // overriding stop function
          this.stop = () =>
            server.shutdown().finally(() => {
              logger.info(`${serverInfo} server is finished`, 'noSave')
            })
        } catch (error) {
          throw new InternalError(
            `An error ocurred on starting ${serverInfo} server`,
            {
              cause: error,
              meta: {
                source: 'zanix',
                serverInfo,
                serverType: this.type,
                port,
              },
            },
          )
        }
      },
      stop: () => {},
      protocol,
      type,
      port: opts.port as number,
      dispatchKey,
    }

    return serverID
  }

  /**
   * Returns info such as address, protocol (`http`/`https`/`ws`/`wss`) and type of the specified server.
   *
   * @param {ServerID} id - The identificator of the server.
   * @returns {Readonly<{ addr?: Deno.NetAddr; protocol?: string; type?: WebServerTypes }>} A frozen
   * object with the server's info. If the server doesn't exist (or hasn't started listening yet,
   * for `addr`), the corresponding fields are `undefined` — the returned object itself is never `undefined`.
   */
  public info(
    id: ServerID,
  ): Readonly<Pick<ServerManagerData[never], 'addr' | 'protocol' | 'type'>> {
    const server = this.#servers[id] || ({} as ServerManagerData[never])

    return Object.freeze({
      addr: server.addr,
      protocol: server.protocol,
      type: server.type,
    })
  }

  /**
   * Starts the specified web server if it is not already running.
   *
   * @param {ServerID} id - The identifier of the server to start.
   * @param {boolean} [finalize] - Defaults to `true`. Pass `false` when this is not the last
   * `bootstrapServers()` call in a multi-call boot sequence — see
   * `cleanupInitializationsMetadata`'s own doc for what this gates.
   */
  public start(id: ServerID | ServerID[], finalize: boolean = true): void {
    const processor = (callback: () => void) => {
      callback() // main function to execute
      // Delete unused references once the server has started
      ProgramModule.cleanupInitializationsMetadata('onBoot', finalize)
    }

    if (typeof id === 'string') return processor(() => this.#start(id))

    processor(() => {
      for (const key of id) this.#start(key)
    })
  }

  /**
   * Stops the specified web server.
   *
   * @param {ServerID} id - The identificator of the server to stop.
   * @returns {Promise<void>} A promise that resolves when the server has been stopped.
   */
  public async stop(id: ServerID | ServerID[]): Promise<void> {
    if (typeof id === 'string') return this.#servers[id]?.stop()

    await Promise.all(id.map((key) => this.#servers[key]?.stop()))
  }

  /**
   * Deletes the specified web server from the manager.
   *
   * @param {ServerID} id - The identificator of the server to delete.
   */
  public delete(id: ServerID | ServerID[]): boolean {
    if (typeof id === 'string') return delete this.#servers[id]

    for (const key of id) delete this.#servers[key]
    return true
  }

  /**
   * Hot-unmounts ONE already-`create()`d server's own dispatch entry — strips its `dispatchKey`
   * from its port's `HandlerBox` via the same atomic freeze-and-swap `create()` itself uses, so an
   * in-flight request still sees either the fully-old or fully-new table, never a partial one.
   * Unlike `stop()`, this never touches the real `Deno.serve()` listener — a port shared with
   * OTHER still-registered servers (see `create()`'s own port-sharing remarks) keeps accepting
   * connections for them unaffected; requests that used to reach `id`'s own routes fall through to
   * the port's `''`-keyed catch-all (if any) or a plain `NOT_FOUND`, same as any other unmatched
   * prefix. A no-op if `id` was never registered, or its port's box is already gone.
   *
   * Known limitation, deliberate for v1: even when `id` was the LAST server left on a shared port,
   * this never closes the real socket — doing so would require re-attributing which OTHER
   * registered server's own `_start()` actually bound it (see `create()`'s "first bind wins"
   * remarks), which this method doesn't attempt. Use `stop()` on the port's original owner for a
   * full teardown of the real listener; this method only ever removes bookkeeping and the one
   * dispatch entry.
   *
   * @param id The server id to unmount — see `Runtime.serverID`.
   */
  public unmount(id: ServerID): void {
    const server = this.#servers[id]
    if (!server) return

    const box = this.#handlers[server.port]
    if (box) {
      const { [server.dispatchKey]: _removed, ...rest } = box.current
      box.current = Object.freeze(rest)
    }

    delete this.#servers[id]
  }
}
