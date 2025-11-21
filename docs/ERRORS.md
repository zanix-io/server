# Error Handling and Logging

Zanix Server includes an advanced error logging mechanism based on
**[ZanixLogger](https://jsr.io/@zanix/utils)** that helps to efficiently manage and track errors in
your application. Here’s an overview of how errors are handled and logged:

## Logging Criteria:

- **Unknown Errors**: If the error does not have the `_logged` property, it is considered unknown,
  and the system will log it.
- **Already Logged Errors**: If the error has the `_logged` property set to `true`, it will **not**
  be logged again, as it is already registered.
- **Explicitly Marked Errors**: If the `_logged` property is set to `false`, the error will **not**
  be logged, unless it meets certain conditions (see below).

## Special Exceptions:

1. **Concurrent HTTP Errors**: Errors caused by concurrent HTTP requests will be logged, even if
   their `_logged` property is set to `false`.
2. **Server Errors (HTTP Status >= 500)**: Errors with an HTTP status code of 500 or higher
   (server-side errors) will **always** be logged, regardless of the `_logged` property value.

## Error Status Validation:

The logging system also checks the `status` property of the error object. The `status` property is
defined as `{ value: number }`, and it is used to validate the error's severity. This is
particularly important for HTTP errors:

- **HTTP Status Validation**: If an error has a `status` property with a value of **500 or higher**,
  it will be treated as a server error and logged, regardless of the `_logged` property.

## Error Concurrency:

To prevent excessive logging of the same Http error, Zanix Server uses a concurrency system:

- If an error occurs more than **50 times within the last hour**, it will not be logged to avoid
  flooding the logs with repetitive entries.
- If the error exceeds the concurrency limit or the expiration time (one hour), a new log entry will
  be created.

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
