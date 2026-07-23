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

1. **Concurrent HTTP Errors**: Errors caused by concurrent HTTP requests will be logged, even if
   their `_logged` property is set to `false`.
2. **Server Errors (HTTP Status >= 500)**: Errors with an HTTP status code of 500 or higher
   (server-side errors) will **always** be logged, regardless of the `_logged` property value.

## Error Status Validation

The logging system also checks the `status` property of the error object. The `status` property is
defined as `{ value: number }`, and it is used to validate the error's severity. This is
particularly important for HTTP errors:

- **HTTP Status Validation**: If an error has a `status` property with a value of **500 or higher**,
  it will be treated as a server error and logged, regardless of the `_logged` property.

## Error Concurrency

To prevent excessive logging of the same HTTP error, Zanix Server tracks how many times each status
code has occurred within a rolling one-hour window:

- Occurrences are **suppressed** (not logged) while the count for that status code stays under 50
  within the current hour, to avoid flooding the logs with repetitive entries.
- Once the count **exceeds 50** within that window, that occurrence **is logged** — once, with
  metadata noting the concurrency threshold was exceeded — and the window resets.
- If the hour elapses before the threshold is reached, the window resets without logging that
  occurrence.

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
| `TargetError`                                   | Internal factory used by connectors/providers/interactors to build a lifecycle-aware error (`InternalError` outside `'lazy'` start mode, `HttpError` otherwise). Mentioned here for completeness; application code should prefer the standard error types from `@zanix/utils`. |

## See also

- [Dependency Injection](./DEPENDENCY-INJECTION.md) — the `startMode`/`lifetime` values referenced
  by `TargetError`.
- [Middlewares](./MIDDLEWARES.md) — how thrown errors from guards/pipes become HTTP responses.
