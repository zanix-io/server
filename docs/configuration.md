# Configuration Reference

Constants and environment variables for configuring ports, headers, and server behavior.

## Constants

```ts
import { GRAPHQL_PORT, JSON_CONTENT_HEADER, SOCKET_PORT } from 'jsr:@zanix/server@[version]'
```

| Constant               | Value                                                                            | Description                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOCKET_PORT`          | `20201`                                                                          | Default port used for the socket server.                                                                                                          |
| `STATIC_PORT`          | `20202`                                                                          | Default port reserved for a static server.                                                                                                        |
| `GRAPHQL_PORT`         | `20203`                                                                          | Default port used for the GraphQL server.                                                                                                         |
| `JSON_CONTENT_HEADER`  | `{ 'Content-Type': 'application/json' }`                                         | Default JSON content-type header.                                                                                                                 |
| `ZANIX_SERVER_MODULES` | `['.handler.ts', '.interactor.ts', '.connector.ts', '.provider.ts', '.defs.ts']` | Ordered list of module file suffixes (see the [file naming conventions](../README.md#file-naming-conventions)); `.defs.ts` must be resolved last. |

`GRAPHQL_PORT` and `SOCKET_PORT` are the actual fallback ports used by `bootstrapServers` when no
explicit `port` is given for that server type (REST defaults to `8000` unless overridden by the
`PORT`/`PORT_REST` environment variables — see below).

A second, `application: 'admin', id: <explicit-id>` `bootstrapServers` call — one whose servers
mount only the `'admin'` Application's routes/resolvers/sockets (an admin API, a health check,
etc.), isolated (routing-wise — see the caveat below) from the default Application's — no longer
needs a reserved port of its own: a same-`type` unanchored and anchored server sharing one port now
works instead of failing with `AddrInUse`. See [Applications](./applications.md#applications) for
the full mechanism (including what this routing separation does and doesn't protect against) and
[Applications → Sharing a port with an unanchored server](./applications.md#sharing-a-port-with-an-unanchored-server)
for the shared-port trade-offs. There's no `ADMIN_*_PORT`-style constant for this anymore — a
package building an admin-server pattern on top of `@zanix/server` (`@zanix/core`, `@zanix/admin`)
picks its own port, and can derive a stable server `id` instead via
[Utilities → Application server-id helpers](./utilities.md#application-server-id-helpers).

### Auth & admin-protocol headers

```ts
import { ADMIN_PROTOCOL_HEADER, AUTH_HEADERS, SESSION_HEADERS } from 'jsr:@zanix/server@[version]'
```

| Constant                   | Value                                                                            | Description                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_HEADERS`             | `{ api: 'X-Znx-Authorization', user: 'Authorization' }`                          | Bearer-credential header per `@zanix/auth` auth type.                                                                                                |
| `SESSION_HEADERS`          | `{ api: { sub, session, token: undefined }, user: { sub, session, token } }`     | Subject/session-status/app-token headers per `@zanix/auth` auth type.                                                                                |
| `RATE_LIMIT_HEADERS`       | `{ limitHeader, remainingHeader, resetHeader, retryAfterHeader: 'Retry-After' }` | Rate-limit response headers set by `@zanix/auth`'s rate-limit guard.                                                                                 |
| `GENERAL_HEADERS`          | `{ cookiesAcceptedHeader: 'X-Znx-Cookies-Accepted' }`                            | Miscellaneous shared headers not tied to a single auth type.                                                                                         |
| `ADMIN_PROTOCOL_HEADER`    | `'X-Znx-Admin-Protocol'`                                                         | Carries the admin-protocol version on a service's `/admin/*` responses.                                                                              |
| `PROTOCOL_VERSION_HEADER`  | `'X-Znx-Protocol-Version'`                                                       | Default header for the `versionProtocol` handler option — see [Handlers → Protocol version negotiation](./handlers.md#protocol-version-negotiation). |
| `DEFAULT_PROTOCOL_VERSION` | `1`                                                                              | Default version a handler declares when `versionProtocol` doesn't override it.                                                                       |

Cookies follow the same `X-Znx-` namespacing: a built-in guard exposes only cookies whose name
starts with `X-Znx-` on `ctx.cookies`, dropping anything else silently — see
[Middlewares → Cookie filtering](./middlewares.md#cookie-filtering) for the full behavior and its
implications for consumer-set cookies.

`AUTH_HEADERS`/`SESSION_HEADERS`/`RATE_LIMIT_HEADERS`/`GENERAL_HEADERS`/`ADMIN_PROTOCOL_HEADER` live
in `@zanix/server` rather than in `@zanix/auth`/`@zanix/core` (where the concepts they name actually
belong) because `@zanix/server` is the one dependency every package that reads or sets them already
shares — `@zanix/auth` and `@zanix/notifications` both depend on it, and `@zanix/core` depends on
both `@zanix/server` and `@zanix/notifications`, so `@zanix/notifications` importing
`ADMIN_PROTOCOL_HEADER` from `@zanix/core` directly would be circular. `@zanix/core` still
re-exports `ADMIN_PROTOCOL_HEADER` from its own entrypoint for its own consumers, and `@zanix/auth`
derives its own `userSessionHeaders`/`apiSessionHeaders` exports from `SESSION_HEADERS` — but this
table is the single source of truth for the actual values.

`ADMIN_PROTOCOL_VERSION` (the actual admin-protocol version number, as opposed to the header name
above) lives in `@zanix/admin` instead — the package that actually owns and administers the admin
protocol (its version registry, and its own `versionProtocol` config), not `@zanix/server` or
`@zanix/core`. It's expected to change as the admin protocol's own `/admin/*` shapes evolve, and
that shouldn't require a `@zanix/server` release. `@zanix/core` re-exports it unchanged for its own
consumers. See `@zanix/admin`'s own docs for its version registry.

`PROTOCOL_VERSION_HEADER`/`DEFAULT_PROTOCOL_VERSION`, by contrast, genuinely belong to
`@zanix/server` — they're the generic defaults behind the `versionProtocol` handler option (see
[Handlers → Protocol version negotiation](./handlers.md#protocol-version-negotiation)), not a stand-
in for a concept some other package owns. `@zanix/admin` deliberately keeps configuring
`versionProtocol` with its own `ADMIN_PROTOCOL_HEADER`/`ADMIN_PROTOCOL_VERSION` instead of these
defaults, for backward compatibility with its own already-shipped wire contract.

## Environment variables

| Name              | Description                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSL_KEY_PATH`    | Path to the SSL private key file. Required together with `SSL_CERT_PATH` — see below.                                                                                                                                                                                                                                                                                                                  |
| `SSL_CERT_PATH`   | Path to the SSL certificate file. Required together with `SSL_KEY_PATH` — see below.                                                                                                                                                                                                                                                                                                                   |
| `PORT`            | Base/default port for the application.                                                                                                                                                                                                                                                                                                                                                                 |
| `PORT_GRAPHQL`    | Port for the GraphQL API.                                                                                                                                                                                                                                                                                                                                                                              |
| `PORT_SOCKET`     | Port for WebSocket connections.                                                                                                                                                                                                                                                                                                                                                                        |
| `PORT_REST`       | Port for the REST API.                                                                                                                                                                                                                                                                                                                                                                                 |
| `PORT_SSR`        | Port for the SSR server.                                                                                                                                                                                                                                                                                                                                                                               |
| `ADMIN_SERVER_ID` | Read by `resolveApplicationServerId('admin', type)` (not by `@zanix/server` itself) to derive a stable, restart-safe id for `@zanix/core`'s embedded admin server's own `bootstrapServers`/`webServerManager.create()` call. `ZanixAdminHub.start()` reads its own `ADMIN_HUB_SERVER_ID` the same way — see [Utilities → Application server-id helpers](./utilities.md#application-server-id-helpers). |

A type-specific variable (e.g. `PORT_GRAPHQL`) takes precedence over the generic `PORT`, which in
turn takes precedence over the constant defaults above. `PORT_SSR` only applies if you manually
create an `'ssr'` server via `webServerManager` — `bootstrapServers` doesn't start one
automatically.

A package that needs these names programmatically instead of hardcoding the strings above can use
`PORT_ENV` (`'PORT'`), `getPortEnvKey(type)` (builds the type-specific name, e.g.
`getPortEnvKey('socket')` → `'PORT_SOCKET'`), and `SSL_KEY_PATH_ENV`/`SSL_CERT_PATH_ENV`
(`'SSL_KEY_PATH'`/`'SSL_CERT_PATH'`) instead of re-interpolating the pattern inline.

`SSL_KEY_PATH`/`SSL_CERT_PATH` are a prerequisite pair, not independent toggles: leaving BOTH unset
is a valid, intentional configuration and serves plain HTTP silently, same as always. Setting only
one of the two, or setting both but pointing at a file that doesn't exist or can't be read, is
always a misconfiguration — `WebServerManager`'s constructor throws an `InternalError` naming the
missing/unreadable var and why, instead of silently falling back to plain HTTP. There is no
`SSL_MODE`-style selector here; the two vars are never alternatives to choose between.

## SSL certificates

`ServerOptions.ssl` declares a `{ key: string; cert: string }` shape on the type — the same PEM
key/cert pair the `SSL_KEY_PATH`/`SSL_CERT_PATH` environment variables above ultimately load — for
supplying TLS material directly instead of through those env vars:

```ts
await bootstrapServers({
  rest: {
    ssl: { key: '-----BEGIN PRIVATE KEY-----...', cert: '-----BEGIN CERTIFICATE-----...' },
  },
})
```

`SSL_KEY_PATH`/`SSL_CERT_PATH` take precedence: when that env-var pair is set, `WebServerManager`
loads TLS material from those files at construction time and a per-call `ssl` option is ignored.
`ssl` only takes effect when the env-var pair is left unset — the first `create()` call that
supplies it configures TLS for every server this `WebServerManager` instance manages from then on
(the same "first bind's own options apply to the real socket" rule described in
`WebServerManager.create`'s own doc).

Only these two shapes are supported: `SSL_KEY_PATH`/`SSL_CERT_PATH` always name a local filesystem
path, and `ssl` always takes literal PEM content directly — neither accepts a URL or a
base64-encoded value. A certificate from any other source (downloaded at boot, pulled from a secrets
manager, base64-encoded) has to be resolved into a file on disk or a raw PEM string yourself before
configuring the server — `@zanix/server` doesn't fetch or decode SSL material on your behalf.

## GZIP compression

`ServerOptions.gzip` controls automatic response compression, applied by the server's own default
interceptor to every `rest`/`graphql`/`ssr` response — no per-handler code needed. A response is
only compressed when its `content-type` matches a compressible type (`text`, `json`, `javascript`,
`xml`, `svg`, `css`, `html`) AND the request sent `Accept-Encoding: gzip`; anything else is returned
untouched.

- Omit `gzip` to accept the default: compression applies once the response body is at least `1024`
  bytes (`GzipSettings.threshold`); a smaller compressible body is sent uncompressed.
- Pass `{ threshold }` to change that minimum body size.
- Pass `gzip: false` to disable compression entirely for that server, regardless of body size or
  content type.

```ts
await bootstrapServers({
  rest: { gzip: { threshold: 512 } }, // compress compressible responses >= 512 bytes
  ssr: { gzip: false }, // never compress this server's responses
})
```

For an `'ssr'` server specifically, a compressible response is piped through
`CompressionStream('gzip')` as a live stream — so a streaming render keeps sending bytes as it
renders, instead of buffering the whole response first — and `threshold` has no effect there, since
a stream's total size isn't known upfront; only the `content-type` check applies.

## Request body size limit

`ServerOptions.maxBodyBytes` (default `1_048_576`, 1 MiB) rejects a JSON or
`application/x-www-form-urlencoded` request body once it exceeds this many bytes, with
`413 Payload
Too Large`, before the body ever reaches a route handler. Enforced by counting real
bytes as the body stream itself arrives — not by trusting `Content-Length` alone, which a client can
omit, understate, or exceed under `Transfer-Encoding: chunked` — so the cap holds even against a
request that doesn't declare its real size upfront:

```ts
await bootstrapServers({ rest: { maxBodyBytes: 5 * 1024 * 1024 } }) // 5 MiB
```

Set it to `Infinity` to remove the cap entirely.

## Server shutdown callback

`ServerOptions.onceStop` is a callback invoked once, with no arguments, after a server's underlying
`Deno.serve()` listener has actually finished shutting down — not merely when `stop()` is called,
but once its `finished` promise resolves:

```ts
const id = webServerManager.create('rest', {
  server: { onceStop: () => console.log('REST server fully stopped') },
})
await webServerManager.stop(id)
```

It only fires for the server instance that actually bound the real socket. When two or more servers
share one port (see
[Applications → Sharing a port with an unanchored
server](./applications.md#sharing-a-port-with-an-unanchored-server)), only the first one to start
owns the real listener — a later server that only reused that address never gets its own `stop()`
override and, consequently, never triggers its own `onceStop` either.

## CORS

`ServerOptions.cors` is documented under
[Middlewares → Built-in defaults → CORS](./middlewares.md#cors), alongside the framework's other
built-in default middleware (cookie filtering) — not repeated here.

## See also

- [Getting Started](./getting-started.md) — where `bootstrapServers` and `webServerManager` are
  introduced.
- [Middlewares](./middlewares.md) — CORS and the other built-in default middlewares.
- [Dependency Injection](./dependency-injection.md) — connector/provider defaults and lifecycle.
