# Utilities Reference

Lower-level helper functions exported by Zanix Server. Most of these are used internally by the
framework itself (route matching, connector lifecycle, response compression) and are exposed mainly
for advanced use cases — custom tooling, tests, or scripts that need the same behavior outside the
normal request flow. Most applications never need to call these directly.

## Response compression

Every server started via `bootstrapServers`/`webServerManager` already gzip-compresses eligible
responses on its own — this is the `gzip` option on `ServerOptions` (`false` to disable, or
`{ threshold }` to tune it), applied automatically to any request sending `Accept-Encoding: gzip`.
The functions below are the same compression the framework uses internally, exported for advanced
cases — building a custom handler outside the normal request flow, a script, or a test that wants
identical behavior.

```ts
import {
  gzipResponse,
  gzipResponseFromResponse,
  gzipStreamingResponse,
} from 'jsr:@zanix/server@[version]'

// From a string body (e.g. a JSON payload):
return gzipResponse(JSON.stringify({ data: largePayload }))

// From an existing, already-buffered Response:
const upstream = await fetch('https://example.com/data.json')
return gzipResponseFromResponse(upstream, { threshold: 512 })

// From a Response whose body must stay a LIVE stream — e.g. a hand-rolled SSR handler:
return gzipStreamingResponse(await renderPageToStream(page))
```

`gzipResponse` and `gzipResponseFromResponse` compress the body only when it's larger than
`threshold` (bytes, default **1024**) and the content type is compressible (text, json, javascript,
xml, svg, css, html); otherwise the body is returned unmodified. Both read the whole body into
memory first (`gzipResponseFromResponse` via `response.clone().arrayBuffer()`) — fine for a response
that's already fully materialized, but it would silently drain a live `ReadableStream` before
compressing a single byte of it.

`gzipStreamingResponse` exists for exactly that case: it pipes `response.body` directly through
`CompressionStream` without ever buffering it, so a genuinely streamed response (like SSR output)
keeps flowing to the client as it's produced. It has no `threshold` option — with a live stream the
total size isn't known upfront, so the only gate is content type; a non-compressible or bodyless
response is returned untouched. **`bootstrapServers` already picks this automatically for `ssr`
servers** (every other server type keeps the buffered compressor, which is the right choice for
them) — the public `gzip`/`GzipOptions` shape on `ServerOptions` is unchanged either way; only the
internal compression strategy for `ssr` responses changed. Call `gzipStreamingResponse` directly
only if you're building your own streaming response outside `bootstrapServers`' own request flow.

## Identity helpers

```ts
import { getServiceId, sanitizeIdentifier } from 'jsr:@zanix/server@[version]'

getServiceId() // e.g. 'my_service' — derived from deno.jsonc/deno.json's own "name"
sanitizeIdentifier('My Service!!') // 'my_service'
```

| Export                                  | Purpose                                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sanitizeIdentifier(value, maxLength?)` | Lowercases `value`, collapses every run of non-`[a-z0-9_]` characters to a single `_`, strips leading/trailing `_`, and caps the result at `maxLength` (default **64**).                      |
| `getServiceId()`                        | Derives a stable service identity from the project's own package name (`deno.jsonc`/`deno.json`'s `name`), sanitized the same way. Falls back to `'zanix_system'` when no name is configured. |

`ZanixDatabaseConnector`'s `defaultDbName` (the default Mongo database name) uses `getServiceId()`
internally, so a project's database name and its "who am I" identity elsewhere (e.g. a non-default
Application's server `id` — see [Applications](./applications.md#applications)) stay consistent by
default instead of being derived independently.

## Target/instance management

These back the dependency-injection system described in
[Dependency Injection](./dependency-injection.md) and are mostly useful for tests or custom
bootstrapping code:

| Export                                     | Purpose                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTargetKey(target?)`                    | Returns a stable, unique key for a class constructor (used internally to identify registered targets). Different classes always get different keys, even if they share the same `name`.                                                                                                                                                                         |
| `getConnectorKey(ConnectorClass)`          | Resolves the DI key a `@Connector`-decorated class was actually registered under, before any instance exists — see [Dependency Injection → `connectorKey`](./dependency-injection.md#connectorkey--a-connectors-own-identity).                                                                                                                                  |
| `targetInitializations(startMode)`         | Initializes every registered connector/provider/interactor targeted for the given `startMode`, in parallel. Called automatically by `bootstrapServers` for each mode in order (`onSetup` → `onBoot` → `postBoot`).                                                                                                                                              |
| `closeAllConnections()`                    | Closes every registered connector instance concurrently, then clears the `type:connector` registry — process shutdown, not boot completion, is that registry's true end of life, since this is its only reader afterward. Called automatically on process `unload`.                                                                                             |
| `cleanupInitializationsMetadata()`         | Resets both `onBoot` and `postBoot` initialization metadata in one call. The normal `bootstrapServers`/`webServerManager` flow clears each mode individually as that stage completes; this function is mainly useful for tests or custom bootstrap scripts that want to reset both at once.                                                                     |
| `connectorModuleInitialization(connector)` | Runs one connector instance's own `autoInitialize` wait-for-health logic (timeout/retry, per its own options) on demand — the same routine `targetInitializations` already calls internally for every registered connector at its `startMode`. Useful for re-running that same wait outside the normal boot flow, e.g. after manually reconnecting a connector. |

## Application server-id helpers

```ts
import {
  resolveApplicationServerId,
  resolvePreviousApplicationServerId,
} from 'jsr:@zanix/server@[version]'
```

Shared plumbing for a package that builds an "admin server"-style pattern on top of `@zanix/server`
— a second, Application-scoped server that wants a stable, predictable id across restarts instead of
a random one. `@zanix/core`'s embedded admin support (`'admin'` Application) and `@zanix/admin`'s
own standalone `ZanixAdminHub.start()` (`'admin-hub'` Application) both call these rather than each
hand-rolling the same env-var-suffixing logic independently, or needing their own named
function/env-var pair. A typical application doesn't call these directly.

| Export                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveApplicationServerId(application, type)`         | Resolves `` `${id}-${type}` `` from that Application's own stable-id env var — `` `${APPLICATION}_SERVER_ID` `` (e.g. `'admin'` → `ADMIN_SERVER_ID`, `'admin-hub'` → `ADMIN_HUB_SERVER_ID`) — read at call time, not import time, to pass as `bootstrapServers`'s explicit `id`. See [Applications](./applications.md#applications) for why a stable `id` matters. Returns `undefined` when the env var isn't set — there is no random fallback. |
| `resolvePreviousApplicationServerId(application, type)` | The rotation-window counterpart — resolves `` `${APPLICATION}_SERVER_ID_PREVIOUS` `` (e.g. `ADMIN_SERVER_ID_PREVIOUS`, `ADMIN_HUB_SERVER_ID_PREVIOUS`) to pass as `bootstrapServers`'s `previousId`. `compileRuntime` throws if this resolves to a value while `resolveApplicationServerId` doesn't (nothing to rotate from).                                                                                                                    |

Two independent Application-scoped servers in the same process (e.g. `@zanix/core`'s embedded
`admin` option alongside `@zanix/admin`'s own `ZanixAdminHub.start()`) each pin their own address
via their own env var pair, so they can both be anchored at once without colliding on the same
prefix — see [Applications → Boot sessions](./applications.md#boot-sessions) for how `@zanix/server`
also keeps their route registration from corrupting each other, even fired without a sequential
`await` between them.

## See also

- [Getting Started](./getting-started.md) — where `bootstrapServers` orchestrates these internally.
- [Error Handling](./errors.md) — `httpErrorResponse` and friends, for building error responses.
