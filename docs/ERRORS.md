# Error Handling and Logging

Zanix Server includes an advanced error logging mechanism based on
**[ZanixLogger](https://jsr.io/@zanix/utils)** that helps to efficiently manage and track errors in
your application. Here’s an overview of how errors are handled and logged:

## Logging Criteria

- **Unknown Errors**: If the error does not have the `_logged` property, it is considered unknown,
  and the system will log it.
- **Already Logged Errors**: If the error has the `_logged` property set to `true`, it will **not**
  be logged again, as it is already registered.
- **Explicitly Marked Errors**: If the `_logged` property is set to `false`, the error will **not**
  be logged, unless it meets certain conditions (see below).

## Special Exceptions

1. **Repeated HTTP Errors**: Once an error's occurrence count crosses the throttle threshold (see
   [Error Log Throttling](#error-log-throttling) below), that occurrence will be logged even if its
   `_logged` property is set to `false`.
2. **Server Errors (HTTP Status >= 500)**: Errors with an HTTP status code of 500 or higher
   (server-side errors) will **always** be logged, regardless of the `_logged` property value — this
   is the default behavior and can be changed, see
   [Customizing the threshold, window, and storage](#customizing-the-threshold-window-and-storage).

## Error Status Validation

The logging system also checks the `status` property of the error object. The `status` property is
defined as `{ value: number }`, and it is used to validate the error's severity. This is
particularly important for HTTP errors:

- **HTTP Status Validation**: If an error has a `status` property with a value of **500 or higher**,
  it will be treated as a server error and logged, regardless of the `_logged` property.

## Error Log Throttling

To prevent excessive logging of the same HTTP error, Zanix Server tracks how many times each status
code has occurred within a rolling window:

- Occurrences are **suppressed** (not logged) while the count for that status code stays under the
  threshold within the current window, to avoid flooding the logs with repetitive entries.
- Once the count **reaches the threshold**, that occurrence **is logged** — once, with metadata
  noting the threshold was exceeded — and the window resets.
- If the window elapses before the threshold is reached, it resets without logging that occurrence.

By default the threshold is **50** occurrences per **1-hour** window, and the count is tracked
**locally, in-memory, per server instance** — each replica keeps its own count.

### Customizing the threshold, window, and storage

Use `ErrorLogThrottle` to change the defaults, or to share the count across a fleet of instances
instead of tracking it per-process. Instantiate it once during application startup, e.g. right
before `bootstrapServers`:

```ts
import { bootstrapServers, ErrorLogThrottle } from 'jsr:@zanix/server@[version]'

// Loosen the throttle: 100 occurrences per 10-minute window instead of 50 per hour
new ErrorLogThrottle({ threshold: 100, windowMs: 10 * 60_000 })

await bootstrapServers({ rest: { globalPrefix: '/api' } })
```

To make the throttling apply across every server instance instead of per-process, pass a `store`
that implements `increment`/`reset` against a shared backend (Redis, Deno KV, etc.):

```ts
new ErrorLogThrottle({
  store: {
    async increment(status, windowMs) {
      const value = await redis.incr(`err-log-throttle:${status}`)
      if (value === 1) await redis.pexpire(`err-log-throttle:${status}`, windowMs)
      return value
    },
    async reset(status) {
      await redis.del(`err-log-throttle:${status}`)
    },
  },
})
```

Only the options you pass are changed — anything omitted keeps its current value (the built-in
defaults, if this is the first call). This only needs to be best-effort: it powers log-noise
suppression, not a security control, so a small race on the very first `increment` of a new window
is an acceptable trade-off for a simple, backend-agnostic contract.

#### Using a Zanix-managed provider/connector as the backend

The `store` you pass to `ErrorLogThrottle` is a plain object, not a class — its `increment`/`reset`
have no `this` bound to any Zanix target, so `this.cache`/`this.database` (only available inside a
`ZanixProvider`/`ZanixInteractor`/`ZanixConnector` subclass) don't work there directly. To reuse a
provider or connector you already have registered (e.g. a custom Redis provider), resolve it via
`ProgramModule` instead — it's a global singleton, importable from anywhere, no request or `this`
required:

```ts
import { ErrorLogThrottle, ProgramModule } from 'jsr:@zanix/server@[version]'
import { ThrottleCacheProvider } from './providers/throttle-cache.provider.ts' // your own @Provider()

new ErrorLogThrottle({
  store: {
    async increment(status, windowMs) {
      const cache = ProgramModule.providers.get(ThrottleCacheProvider)
      const value = await cache.incr(`err-log-throttle:${status}`)
      if (value === 1) await cache.expire(`err-log-throttle:${status}`, windowMs)
      return value
    },
    async reset(status) {
      await ProgramModule.providers.get(ThrottleCacheProvider).del(`err-log-throttle:${status}`)
    },
  },
})
```

`ProgramModule.providers` is shorthand for `ProgramModule.getProviders()` with no context (see
[Dependency Injection](./DEPENDENCY-INJECTION.md#accessing-instances-outside-any-class-programmodule)).
Only `SINGLETON`-lifetime providers/connectors work here (the default for `@Provider`) — the
throttle count must be shared across every request, and even code paths with no request at all.

By default, only status codes `400`–`499` are throttled — server errors (`>= 500`) always bypass
throttling and are logged unconditionally, per the [Special Exceptions](#special-exceptions) above.
Pass `maxStatus` to change that upper bound; there's no equivalent lower bound, since statuses below
`400` aren't errors to begin with (2xx is success, 3xx is a redirect):

```ts
// Also throttle server errors instead of always logging them unsuppressed.
// Only do this if you accept that a burst of identical server errors can go
// silently unlogged until the window resets.
new ErrorLogThrottle({ maxStatus: 600 })
```

To keep specific status codes fully visible while still throttling the rest — e.g. always log auth
failures but throttle everything else — pass `excludeStatuses`. Listed statuses bypass throttling
entirely and are logged every single time:

```ts
new ErrorLogThrottle({ excludeStatuses: [401, 403] })
```

---

## Using Errors from ZanixUtils

To ensure consistency and help manage known errors, it's recommended to use the predefined error
types available in **[ZanixUtils](https://jsr.io/@zanix/utils)**. These errors are standardized and
follow the conventions of Zanix's error handling system. By using them, you avoid manually managing
the `_logged` property and benefit from predefined behavior and additional metadata, such as the
`status` property. This reduces manual intervention and makes error handling more consistent.

## Custom Errors

If you need to create custom errors, ensure they follow the structure expected by the error logging
system. You should include both the `_logged` property and the `status` property as needed to
control whether an error is logged and how it is handled.

## Utilities

Zanix Server also exports a few lower-level helpers for building error responses manually — useful
in custom middlewares, scripts, or when integrating with code outside the normal handler flow.

```ts
import { httpErrorResponse } from 'jsr:@zanix/server@[version]'

const error = { status: { value: 404 }, message: 'Not Found' }
const response = httpErrorResponse(error)
// response.status === 404
// response.headers.get('Content-Type') === 'application/json'
```

| Export                                          | Purpose                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `httpErrorResponse(error, options?)`            | Builds a JSON `Response` for an error, using its `status.value` (defaults to `400`) and merging in any extra `options.headers`.                                                                                                                                                |
| `getSerializedErrorResponse(error, contextId?)` | Serializes an error into the JSON string used by `httpErrorResponse`, without building a `Response`.                                                                                                                                                                           |
| `attachGlobalErrorHandlers(self)`               | Registers global handlers for uncaught errors and unhandled promise rejections on the given `Window`-like object, forwarding them into the logging system described above. Called automatically on startup — you generally don't need to call it yourself.                     |
| `new ErrorLogThrottle(options?)`                | Configures the [error log throttling](#error-log-throttling) threshold, window, and/or storage backend described above. See that section for examples.                                                                                                                         |
| `ErrorLogThrottleStore` (type)                  | The `{ increment(status, windowMs), reset(status) }` contract a custom `store` passed to `ErrorLogThrottle` must implement.                                                                                                                                                    |
| `ErrorLogThrottleConfig` (type)                 | The `{ threshold?, windowMs?, maxStatus?, excludeStatuses? }` shape accepted by `ErrorLogThrottle`.                                                                                                                                                                            |
| `TargetError`                                   | Internal factory used by connectors/providers/interactors to build a lifecycle-aware error (`InternalError` outside `'lazy'` start mode, `HttpError` otherwise). Mentioned here for completeness; application code should prefer the standard error types from `@zanix/utils`. |

## See also

- [Dependency Injection](./DEPENDENCY-INJECTION.md) — the `startMode`/`lifetime` values referenced
  by `TargetError`.
- [Middlewares](./MIDDLEWARES.md) — how thrown errors from guards/pipes become HTTP responses.
