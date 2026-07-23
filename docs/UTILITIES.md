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

## Routing

```ts
import { cleanRoute } from 'jsr:@zanix/server@[version]'

cleanRoute('///folder1/folder2//file') // -> '/folder1/folder2/file'
cleanRoute('  \\API\\Users\\  ') // -> '/api/users'
```

`cleanRoute` normalizes a route path: trims whitespace, converts backslashes to forward slashes,
collapses repeated slashes, ensures a single leading `/`, removes any trailing slash, and lowercases
the result. It's the same normalization the framework applies internally to every registered route.

## Request payload parsing

```ts
import { processUrlParams } from 'jsr:@zanix/server@[version]'

processUrlParams({ user: 'John%20Doe', tags: ['NodeJS%20Dev'] })
// -> { user: 'John Doe', tags: ['NodeJS Dev'] }
```

Recursively `decodeURIComponent`s every string value in an object or array, in place. If decoding
fails partway through (a malformed `%` sequence), the error is swallowed — values decoded before the
failure stay decoded, the rest are left untouched.

## Target/instance management

These back the dependency-injection system described in
[Dependency Injection](./DEPENDENCY-INJECTION.md) and are mostly useful for tests or custom
bootstrapping code:

| Export                             | Purpose                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTargetKey(target?)`            | Returns a stable, unique key for a class constructor (used internally to identify registered targets). Different classes always get different keys, even if they share the same `name`.                                                                                                     |
| `targetInitializations(startMode)` | Initializes every registered connector/provider/interactor targeted for the given `startMode`, in parallel. Called automatically by `bootstrapServers` for each mode in order (`onSetup` → `onBoot` → `postBoot`).                                                                          |
| `closeAllConnections()`            | Closes every registered connector instance concurrently. Called automatically on process `unload`.                                                                                                                                                                                          |
| `cleanupInitializationsMetadata()` | Resets both `onBoot` and `postBoot` initialization metadata in one call. The normal `bootstrapServers`/`webServerManager` flow clears each mode individually as that stage completes; this function is mainly useful for tests or custom bootstrap scripts that want to reset both at once. |

## See also

- [Getting Started](./GETTING-STARTED.md) — where `bootstrapServers` orchestrates these internally.
- [Error Handling](./ERRORS.md) — `httpErrorResponse` and friends, for building error responses.
