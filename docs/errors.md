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
      if (value === 1) {
        await redis.pexpire(`err-log-throttle:${status}`, windowMs)
      }
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
      if (value === 1) {
        await cache.expire(`err-log-throttle:${status}`, windowMs)
      }
      return value
    },
    async reset(status) {
      await ProgramModule.providers.get(ThrottleCacheProvider).del(
        `err-log-throttle:${status}`,
      )
    },
  },
})
```

`ProgramModule.providers` is shorthand for `ProgramModule.getProviders()` with no context (see
[Dependency Injection](./dependency-injection.md#accessing-instances-outside-any-class-programmodule)).
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

## Uncaught Error Monitoring

Where [Error Log Throttling](#error-log-throttling) suppresses log noise from repeated _HTTP_
errors, `UncaughtErrorMonitor` tracks a different, always-more-serious signal: real uncaught errors
and unhandled promise rejections captured by `attachGlobalErrorHandlers` (see the
[Utilities](#utilities) table below) — the two `UNCAUGHT_ERROR`/`UNHANDLED_PROMISE_REJECTION` codes.
It reuses the exact same pluggable store `ErrorLogThrottle` installs (the default in-memory one, or
whatever backend you passed via `ErrorLogThrottle`'s own `store` option /
`setErrorLogThrottleStore`) under a synthetic key that can never collide with a real HTTP status —
there's no separate storage to wire up for this.

Occurrences are counted automatically the moment `attachGlobalErrorHandlers` installs (which itself
happens automatically the first time a server actually binds its listener — see the
`attachGlobalErrorHandlers` row below). There's nothing to opt into for the counting itself; what IS
opt-in is what happens once the count crosses the threshold within the rolling window:

- By default (`threshold: 10`, `windowMs: 5` minutes, `exitOnThreshold: false`), crossing the
  threshold only affects readiness — and only if you've explicitly wired `uncaughtErrorRateCheck`
  into your own `HealthOptions.checks` (see below). The process itself keeps running either way.
- With `exitOnThreshold: true`, crossing the threshold ALSO makes the framework's own
  automatically-installed handler drain — `WebServerManager.stopAll()` (every server this package's
  own `webServerManager` singleton registered, regardless of `type`/Application/ anchoring) followed
  by closing every registered connection — and then call `Deno.exit(1)`, so an external supervisor
  (systemd/PM2/a container orchestrator's restart policy) restarts the process instead of leaving it
  running indefinitely in a possibly-corrupted state. This drain step is internal to that automatic
  installation; it isn't currently configurable by a consumer.

Once `windowMs` passes with no further crossing, the readiness signal self-heals back to healthy on
its own next read — no manual action needed.

### Setting the threshold and window

Instantiate `UncaughtErrorMonitor` once during application startup, e.g. right before
`bootstrapServers` — the same "constructor-as-config-setter" idiom `ErrorLogThrottle` itself uses.
Only the options you pass are changed; anything omitted keeps its current value (the built-in
defaults, if this is the first call):

```ts
import { bootstrapServers, UncaughtErrorMonitor } from 'jsr:@zanix/server@[version]'

// Only degrade readiness after 25 uncaught errors/unhandled rejections within 15 minutes,
// instead of the built-in default of 10 within 5 minutes.
new UncaughtErrorMonitor({ threshold: 25, windowMs: 15 * 60_000 })

await bootstrapServers({ rest: { globalPrefix: '/api' } })
```

### Reflecting it in readiness only (`uncaughtErrorRateCheck`)

Plug the ready-made `uncaughtErrorRateCheck` check into `HealthOptions.checks` — `health` is a
sibling of `rest`/`graphql`/`socket`/`ssr` in `bootstrapServers()`'s options, not nested under any
one of them:

```ts
import { bootstrapServers, uncaughtErrorRateCheck } from 'jsr:@zanix/server@[version]'

await bootstrapServers({
  health: {
    checks: { uncaughtErrors: uncaughtErrorRateCheck },
  },
})
```

`/ready` now reports this check as failing once the monitor's own threshold is crossed within its
window, same as any other custom `HealthOptions.checks` entry — only readiness is affected, never
liveness (`/health`). Never wired in automatically: the framework never assumes uncaught-error state
should affect your own readiness contract, so this only takes effect once you add it yourself.

### Exiting once the threshold is crossed

```ts
import { bootstrapServers, UncaughtErrorMonitor } from 'jsr:@zanix/server@[version]'

new UncaughtErrorMonitor({ exitOnThreshold: true })

await bootstrapServers({ rest: { globalPrefix: '/api' } })
```

In practice this fires once: the process exits as soon as the threshold is first crossed, before
another uncaught error could cross it again.

---

## Accessing the original request in `onError`

`onError` (passed per server type, e.g. `bootstrapServers({ rest: { onError } })`) only ever
receives the error — never the `Request` that triggered it. That's normally fine, but some decisions
genuinely need the request: what the client sent in a header, what path it asked for, whether it's a
browser or an API client. Set `attachRequestToErrors: true` on that same server type to make it
available, then read it back inside `onError` with `getRequestFromError`:

```ts
import { bootstrapServers, getRequestFromError } from 'jsr:@zanix/server@[version]'
import { HttpError } from 'jsr:@zanix/utils@[version]/errors'

await bootstrapServers({
  rest: {
    attachRequestToErrors: true,
    onError(error) {
      const request = getRequestFromError(error)
      // Echo back the client's own correlation id (or mint one) so their logs and yours can be
      // tied together for this exact failed request — impossible without the request in scope,
      // since `onError` otherwise has no way to read any header at all.
      const requestId = request?.headers.get('x-request-id') ??
        crypto.randomUUID()

      const isHttpError = error instanceof HttpError
      const status = isHttpError ? error.status.value : 500
      const message = isHttpError ? error.message : 'Internal Server Error'

      return new Response(JSON.stringify({ message, requestId }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    },
  },
})
```

A request to an unmatched route under this server's own prefix (e.g. `GET /api/does-not-exist`) now
gets:

```json
{
  "message": "NOT_FOUND",
  "requestId": "<whatever X-Request-Id the client sent, or a fresh uuid>"
}
```

This applies to every error that reaches `onError` this way, not just `NOT_FOUND` —
`METHOD_NOT_ALLOWED` from route matching, a CORS rejection (`BAD_REQUEST`/`METHOD_NOT_ALLOWED`), and
any custom `guard`/`pipe` throw all go through the same path, so the same `onError` handles all of
them uniformly.

**Defaults to `false`, and stays inert until you explicitly read it.** The attached request is
stored as a non-enumerable property — invisible to `serializeError`, `console.error(error)`,
`JSON.stringify`, and this package's own client-response/backend-logging paths — so turning this on
never by itself puts request data into a log line. But non-enumerable isn't a hard access boundary:
`Object.getOwnPropertyNames(error)` still lists the property, and something that walks an error's
_every_ own property regardless of enumerability (a verbose error-reporting/observability SDK, for
instance) would still see it once attached. That's why it's opt-in rather than always-on: a
`Request` can carry `Authorization`/cookies, so only turn this on for a server type whose `onError`
actually needs it.

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

`httpErrorResponse`/`getSerializedErrorResponse` both build their JSON body from
`getPublicErrorResponse`, which narrows the error down to what's actually safe for an external
caller by default: `id`, `contextId`, `name`, `message`, `code`, `status`, and `userMessage` —
`meta`/`cause` are only included when the error itself opts in via `@zanix/errors`'
`ErrorOptions.exposeMeta`/`exposeCause` (both `false`/unset by default), and `stack` is never
included regardless of any flag. Call `getPublicErrorResponse` directly when you need that same
narrowed shape without building a full `Response`/JSON string around it.

| Export                                          | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `httpErrorResponse(error, options?)`            | Builds a JSON `Response` for an error, using its `status.value` (defaults to `500`) and merging in any extra `options.headers`.                                                                                                                                                                                                                                                                                                                                                                                |
| `getSerializedErrorResponse(error, contextId?)` | Serializes an error into the JSON string used by `httpErrorResponse`, without building a `Response`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `getPublicErrorResponse(error, contextId?)`     | The narrowed, client-safe object both of the above serialize — see above for exactly which fields it includes and how `meta`/`cause` opt in.                                                                                                                                                                                                                                                                                                                                                                   |
| `getRequestFromError(error)`                    | Reads back the `Request` attached via `attachRequestToErrors` (see [Accessing the original request in `onError`](#accessing-the-original-request-in-onerror)) — `undefined` if the server type never opted in, or the error never went through it.                                                                                                                                                                                                                                                             |
| `attachRequestToError(error, request)`          | The lower-level function `attachRequestToErrors: true` uses internally. Only call this yourself when building a fully custom `handler` (bypassing the default route-matching one) and you want the same `onError`-visible-request contract for your own thrown errors.                                                                                                                                                                                                                                         |
| `attachGlobalErrorHandlers(self)`               | Registers global handlers for uncaught errors and unhandled promise rejections on the given `Window`-like object, forwarding them into the logging system described above. Called automatically the first time a server actually binds its listener (via `bootstrapServers()` or a direct `webServerManager.start()` call), so you generally don't need to call it yourself. Merely importing `@zanix/server`, or registering a server via `WebServerManager.create()` without starting it, never triggers it. |
| `new ErrorLogThrottle(options?)`                | Configures the [error log throttling](#error-log-throttling) threshold, window, and/or storage backend described above. See that section for examples.                                                                                                                                                                                                                                                                                                                                                         |
| `ErrorLogThrottleStore` (type)                  | The `{ increment(status, windowMs), reset(status) }` contract a custom `store` passed to `ErrorLogThrottle` must implement.                                                                                                                                                                                                                                                                                                                                                                                    |
| `ErrorLogThrottleConfig` (type)                 | The `{ threshold?, windowMs?, maxStatus?, excludeStatuses? }` shape accepted by `ErrorLogThrottle`.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `new UncaughtErrorMonitor(options?)`            | Configures the [uncaught-error monitoring](#uncaught-error-monitoring) threshold, window, and/or `exitOnThreshold` described above. See that section for examples.                                                                                                                                                                                                                                                                                                                                             |
| `uncaughtErrorRateCheck`                        | Ready-made `HealthCheckFn` reflecting the uncaught-error monitor's own state — plug it into `HealthOptions.checks` to make `/ready` report it as failing once the configured threshold is crossed. See [Reflecting it in readiness only](#reflecting-it-in-readiness-only-uncaughterrorratecheck).                                                                                                                                                                                                             |
| `UncaughtErrorMonitorConfig` (type)             | The `{ threshold?, windowMs?, exitOnThreshold? }` shape accepted by `UncaughtErrorMonitor`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `WebServerManager.stopAll()`                    | Stops every server registered on a `WebServerManager` instance (e.g. this package's own `webServerManager` singleton) — what the framework's own automatic handler calls, alongside closing every registered connection, right before `Deno.exit(1)` once `exitOnThreshold` is crossed (see [Uncaught Error Monitoring](#uncaught-error-monitoring)). Also usable directly for a full manual shutdown outside that flow.                                                                                       |
| `TargetError`                                   | Internal factory used by connectors/providers/interactors to build a lifecycle-aware error (`InternalError` outside `'lazy'` start mode, `HttpError` otherwise). Mentioned here for completeness; application code should prefer the standard error types from `@zanix/utils`.                                                                                                                                                                                                                                 |

## See also

- [Dependency Injection](./dependency-injection.md) — the `startMode`/`lifetime` values referenced
  by `TargetError`.
- [Middlewares](./middlewares.md) — how thrown errors from guards/pipes become HTTP responses.
