# Utilities Reference

Lower-level helper functions exported by Zanix Server. Most of these are used internally by the
framework itself (route matching, connector lifecycle, response compression) and are exposed mainly
for advanced use cases — custom tooling, tests, or scripts that need the same behavior outside the
normal request flow. Most applications never need to call these directly.

## Response compression

```ts
import { gzipResponse, gzipResponseFromResponse } from 'jsr:@zanix/server@[version]'

// From a string body (e.g. a JSON payload):
return gzipResponse(JSON.stringify({ data: largePayload }))

// From an existing Response:
const upstream = await fetch('https://example.com/data.json')
return gzipResponseFromResponse(upstream, { threshold: 512 })
```

Both compress the body only when it's larger than `threshold` (bytes, default **1024**) and the
content type is compressible (text, json, javascript, xml, svg, css, html); otherwise the body is
returned unmodified.

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
Application's server `id` — see [Handlers → Applications](./HANDLERS.md#applications)) stay
consistent by default instead of being derived independently.

## Target/instance management

These back the dependency-injection system described in
[Dependency Injection](./DEPENDENCY-INJECTION.md) and are mostly useful for tests or custom
bootstrapping code:

| Export                             | Purpose                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTargetKey(target?)`            | Returns a stable, unique key for a class constructor (used internally to identify registered targets). Different classes always get different keys, even if they share the same `name`.                                                                                                     |
| `targetInitializations(startMode)` | Initializes every registered connector/provider/interactor targeted for the given `startMode`, in parallel. Called automatically by `bootstrapServers` for each mode in order (`onSetup` → `onBoot` → `postBoot`).                                                                          |
| `closeAllConnections()`            | Closes every registered connector instance concurrently, then clears the `type:connector` registry — process shutdown, not boot completion, is that registry's true end of life, since this is its only reader afterward. Called automatically on process `unload`.                         |
| `cleanupInitializationsMetadata()` | Resets both `onBoot` and `postBoot` initialization metadata in one call. The normal `bootstrapServers`/`webServerManager` flow clears each mode individually as that stage completes; this function is mainly useful for tests or custom bootstrap scripts that want to reset both at once. |

## Admin server helpers

```ts
import {
  ADMIN_SERVER_ID_ENV,
  guardSingleAdminRegistration,
  releaseAdminRegistration,
  resolveAdminServerId,
} from 'jsr:@zanix/server@[version]'
```

Shared plumbing for a package that builds an "admin server" pattern on top of `@zanix/server` —
`@zanix/core`'s embedded admin support and `@zanix/admin`'s own standalone deployment both call
these rather than each hand-rolling the same logic independently. A typical application doesn't call
these directly.

| Export                                | Purpose                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveAdminServerId(type)`          | Resolves `` `${ADMIN_SERVER_ID}-${type}` `` from the `ADMIN_SERVER_ID` env var (read at call time, not import time) to pass as `bootstrapServers`'s explicit `id` — see [Handlers → Applications](./HANDLERS.md#applications) for why a stable `id` matters. Returns `undefined` when the env var isn't set, falling back to a randomly generated default.                |
| `guardSingleAdminRegistration(owner)` | Throws an `InternalError` if a _different_ `owner` already called this in the current process — guards against `@zanix/core`'s embedded admin support and `@zanix/admin`'s standalone `start()` both registering admin metadata at once, which would otherwise silently corrupt the shared route/resolver registries. A repeated call with the _same_ `owner` is a no-op. |
| `releaseAdminRegistration(owner)`     | Releases the claim `guardSingleAdminRegistration` took, if `owner` is the one currently holding it. Pair with it on `stop()` so a service that shuts down doesn't hold the claim forever — needed for test suites that start/stop the same service repeatedly in one process.                                                                                             |
| `ADMIN_SERVER_ID_ENV`                 | The literal env var name (`'ADMIN_SERVER_ID'`) that `resolveAdminServerId()` reads — exported so callers reference the same constant instead of hardcoding the string.                                                                                                                                                                                                    |

## See also

- [Getting Started](./GETTING-STARTED.md) — where `bootstrapServers` orchestrates these internally.
- [Error Handling](./ERRORS.md) — `httpErrorResponse` and friends, for building error responses.
