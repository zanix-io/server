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
works instead of failing with `AddrInUse`. See [Applications](./APPLICATIONS.md#applications) for
the full mechanism (including what this routing separation does and doesn't protect against) and
[Applications → Sharing a port with an unanchored server](./APPLICATIONS.md#sharing-a-port-with-an-unanchored-server)
for the shared-port trade-offs. There's no `ADMIN_*_PORT`-style constant for this anymore — a
package building an admin-server pattern on top of `@zanix/server` (`@zanix/core`, `@zanix/admin`)
picks its own port, and can derive a stable server `id` instead via
[Utilities → Application server-id helpers](./UTILITIES.md#application-server-id-helpers).

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
| `PROTOCOL_VERSION_HEADER`  | `'X-Znx-Protocol-Version'`                                                       | Default header for the `versionProtocol` handler option — see [Handlers → Protocol version negotiation](./HANDLERS.md#protocol-version-negotiation). |
| `DEFAULT_PROTOCOL_VERSION` | `1`                                                                              | Default version a handler declares when `versionProtocol` doesn't override it.                                                                       |

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
[Handlers → Protocol version negotiation](./HANDLERS.md#protocol-version-negotiation)), not a stand-
in for a concept some other package owns. `@zanix/admin` deliberately keeps configuring
`versionProtocol` with its own `ADMIN_PROTOCOL_HEADER`/`ADMIN_PROTOCOL_VERSION` instead of these
defaults, for backward compatibility with its own already-shipped wire contract.

## Environment variables

| Name              | Description                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSL_KEY_PATH`    | Path to the SSL private key file.                                                                                                                                                                                                                                                                                                                                                                      |
| `SSL_CERT_PATH`   | Path to the SSL certificate file.                                                                                                                                                                                                                                                                                                                                                                      |
| `PORT`            | Base/default port for the application.                                                                                                                                                                                                                                                                                                                                                                 |
| `PORT_GRAPHQL`    | Port for the GraphQL API.                                                                                                                                                                                                                                                                                                                                                                              |
| `PORT_SOCKET`     | Port for WebSocket connections.                                                                                                                                                                                                                                                                                                                                                                        |
| `PORT_REST`       | Port for the REST API.                                                                                                                                                                                                                                                                                                                                                                                 |
| `PORT_SSR`        | Port for the SSR server.                                                                                                                                                                                                                                                                                                                                                                               |
| `ADMIN_SERVER_ID` | Read by `resolveApplicationServerId('admin', type)` (not by `@zanix/server` itself) to derive a stable, restart-safe id for `@zanix/core`'s embedded admin server's own `bootstrapServers`/`webServerManager.create()` call. `ZanixAdminHub.start()` reads its own `ADMIN_HUB_SERVER_ID` the same way — see [Utilities → Application server-id helpers](./UTILITIES.md#application-server-id-helpers). |

A type-specific variable (e.g. `PORT_GRAPHQL`) takes precedence over the generic `PORT`, which in
turn takes precedence over the constant defaults above. `PORT_SSR` only applies if you manually
create an `'ssr'` server via `webServerManager` — `bootstrapServers` doesn't start one
automatically.

## See also

- [Getting Started](./GETTING-STARTED.md) — where `bootstrapServers` and `webServerManager` are
  introduced.
- [Dependency Injection](./DEPENDENCY-INJECTION.md) — connector/provider defaults and lifecycle.
