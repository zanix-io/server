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
| `ADMIN_REST_PORT`      | `30248`                                                                          | Default port reserved for an admin REST server.                                                                                                   |
| `ADMIN_GRAPHQL_PORT`   | `30249`                                                                          | Default port reserved for an admin GQL server.                                                                                                    |
| `ADMIN_SOCKET_PORT`    | `30250`                                                                          | Default port reserved for an admin socket server.                                                                                                 |
| `ADMIN_STATIC_PORT`    | `30251`                                                                          | Default port reserved for an admin static server.                                                                                                 |
| `JSON_CONTENT_HEADER`  | `{ 'Content-Type': 'application/json' }`                                         | Default JSON content-type header.                                                                                                                 |
| `ZANIX_SERVER_MODULES` | `['.handler.ts', '.interactor.ts', '.connector.ts', '.provider.ts', '.defs.ts']` | Ordered list of module file suffixes (see the [file naming conventions](../README.md#file-naming-conventions)); `.defs.ts` must be resolved last. |

`GRAPHQL_PORT` and `SOCKET_PORT` are the actual fallback ports used by `bootstrapServers` when no
explicit `port` is given for that server type (REST defaults to `8000` unless overridden by the
`PORT`/`PORT_REST` environment variables — see below).

## Environment variables

| Name            | Description                            |
| --------------- | -------------------------------------- |
| `SSL_KEY_PATH`  | Path to the SSL private key file.      |
| `SSL_CERT_PATH` | Path to the SSL certificate file.      |
| `PORT`          | Base/default port for the application. |
| `PORT_GRAPHQL`  | Port for the GraphQL API.              |
| `PORT_SOCKET`   | Port for WebSocket connections.        |
| `PORT_REST`     | Port for the REST API.                 |
| `PORT_SSR`      | Port for the SSR server.               |

A type-specific variable (e.g. `PORT_GRAPHQL`) takes precedence over the generic `PORT`, which in
turn takes precedence over the constant defaults above. `PORT_SSR` only applies if you manually
create an `'ssr'` server via `webServerManager` — `bootstrapServers` doesn't start one
automatically.

## See also

- [Getting Started](./GETTING-STARTED.md) — where `bootstrapServers` and `webServerManager` are
  introduced.
- [Dependency Injection](./DEPENDENCY-INJECTION.md) — connector/provider defaults and lifecycle.
