# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-07-23

### Added

- **New guides in `docs/`**: [Getting Started](./docs/GETTING-STARTED.md),
  [Handlers](./docs/HANDLERS.md), [Middlewares](./docs/MIDDLEWARES.md),
  [Dependency Injection](./docs/DEPENDENCY-INJECTION.md), [Configuration](./docs/CONFIGURATION.md),
  and [Utilities Reference](./docs/UTILITIES.md), linked from the README's new `Documentation`
  section.
- **Validated `docs/HANDLERS.md`/`docs/MIDDLEWARES.md` against a second real production consumer**
  (a WebSocket/RabbitMQ-heavy service), documenting: the `this.socket`/`this.registry` pattern for
  tracking live socket connections and pushing messages to them proactively (outside the
  request/response cycle of `onmessage`); and that `@Guard`/`@Pipe`/`@Interceptor` on `@Socket`
  classes only take effect at the class level, never on an individual lifecycle method — a `@Socket`
  class has exactly one route (the connection/upgrade), unlike `@Controller`/`@Resolver` which
  register one route per decorated method, so there is no per-method route for a method-level
  middleware to attach to. (Traced end-to-end through the route-assembly code before concluding this
  — it is expected behavior given the single-route model, not a bug.)
- **Validated `docs/DEPENDENCY-INJECTION.md` against a real production consumer**, surfacing the
  dominant real-world dependency-access patterns that were missing: `ZanixProvider<{ database: X }>`
  named-slot getters (`this.database`/`.cache`/`.worker`/`.asyncmq`/`.kvLocal`) as the idiomatic way
  a provider reaches its connector, and `this.providers.get(X)`/`this.connectors.get(X)`/
  `this.interactors.get(X)` for reaching dependencies beyond the single one declared on
  `@Interactor`/`@Provider`. Also added the `@Post({ Body })` no-path overload example to
  [Handlers](./docs/HANDLERS.md), a real-practice note to
  [Middlewares](./docs/MIDDLEWARES.md#advanced-building-your-own-middleware-decorator) about
  building app-level guard packages, and a clarification in the README's
  [file naming conventions](./README.md#file-naming-conventions) that `@zanix/server` itself doesn't
  scan the filesystem — the suffix convention matters for tooling like `@zanix/core`, not for
  `@zanix/server`'s own registration.
- Documented previously-uncovered public exports: `ProgramModule`'s instance accessors
  (`getConnectors`/`getProviders`/`getInteractors`/`registry`/`asyncContext`) in
  [Dependency Injection](./docs/DEPENDENCY-INJECTION.md), `GQLRequest` in
  [Handlers](./docs/HANDLERS.md), `defineMiddlewareDecorator` in
  [Middlewares](./docs/MIDDLEWARES.md), and the error/routing/compression helper functions
  (`httpErrorResponse`, `getSerializedErrorResponse`, `attachGlobalErrorHandlers`, `TargetError`,
  `cleanRoute`, `processUrlParams`, `gzipResponse`, `gzipResponseFromResponse`, `getTargetKey`,
  `targetInitializations`, `closeAllConnections`, `cleanupInitializationsMetadata`) in
  [Error Handling](./docs/ERRORS.md) and the new [Utilities Reference](./docs/UTILITIES.md).
- **`@example` blocks** across all REST/GraphQL/Socket handler decorators (`Controller`, `Get`,
  `Post`, `Patch`, `Put`, `Delete`, `Request`, `Resolver`, `Query`, `Mutation`, `Socket`) and the
  `Connector`/`Provider`/`Interactor` class decorators, grounded in real, compiling usage.
- **Dozens of previously-internal types now publicly exported** from the package entrypoint (e.g.
  `Lifetime`, `StartMode`, `ConnectorTypes`, `ProviderTypes`, `HandlerContext`-related types,
  `TargetBaseClass`, `HandlerBaseClass`, `ContextualBaseClass`, `CoreBaseClass`,
  `RegistryContainer`, and many more), so consumers extending Zanix base classes can now name every
  type involved in their public signatures.

### Changed

- **README restructured**: the ~150-line "Importing Features" catalog was replaced with a compact
  table linking to the new guides, the install steps were moved directly under `Installation`, and a
  duplicated `webServerManager` example was removed. The README shrank from ~390 to ~260 lines; the
  removed detail now lives in `docs/` instead.

### Fixed

- `@Resolver({...})`'s object-argument overload incorrectly required an `Interactor`, unlike
  `@Controller`; it's now optional, matching the underlying type.
- `closeAllConnections` didn't `return` the result of each connector's `close()` call, so
  `Promise.all` never actually awaited asynchronous connectors and silently swallowed rejections.
- Corrected numerous outdated or inaccurate JSDoc comments found during a full documentation audit:
  wrong `@returns`/`@throws` types, guard-header timing described backwards, copy-pasted docs
  between unrelated decorators, stale `@extends` tags, missing/renamed fields in public types, and a
  broken `jsr.io` badge link in the README.
- `deno doc --lint` findings reduced from 93 to a single documented exception (a third-party `redis`
  type whose own internal type graph isn't publicly resolvable).
- Broken `CHANGELOG`/`LICENSE` links in the README (pointed at `./docs/` after those files moved to
  the project root).
- README inaccuracies: missing `Changelog` entry in the table of contents, a `ZanixAsyncmqProvider`
  import typo (the real export is `ZanixAsyncMQProvider`), and a `webServerManager.start('rest')`
  example that passed the server type instead of the `ServerID` returned by `create()`.
- Final consistency/accuracy pass across `docs/`, verified with independent read-only reviews:
  `ERRORS.md`'s "Error Concurrency" section had the suppression logic backwards (it described errors
  as suppressed _after_ exceeding the 50/hour threshold, when the real code suppresses them _until_
  the threshold is hit, then logs once and resets); a `DEPENDENCY-INJECTION.md` claim that the named
  connector getters (`this.database`, etc.) are "built on top of" `use()` was false — they call
  `this.connectors.get()`/`this.providers.get()` directly, an unrelated mechanism; the `Lifetime`
  table didn't note that `@Provider` excludes `TRANSIENT` at the type level; the `Interactor`
  section was missing its "Defaults when no options are given" line and didn't document that passing
  a _core_ connector/provider (one extending a built-in base class) to `@Interactor`'s options
  throws — it must be accessed via the matching named getter instead. Also fixed
  heading/anchor/admonition-marker inconsistencies, reworded a heading whose ampersand ("&")
  produced an ambiguous double-hyphen slug on some markdown renderers, and de-duplicated the
  "Special Environment Variables" table that was repeated verbatim in both the README and
  [Configuration](./docs/CONFIGURATION.md#environment-variables) (README now links to it instead).

## [1.4.18] - 2026-07-23

### Changed

- Updated the library to be compatible with Deno 2.9.

## [1.4.12] - 2025-12-19

### Changed

- `ZanixWorkerProvider` abstrac class.

## [1.4.10] - 2025-12-17

### Fixed

- 🛠️ Improved CORS logic in `corsGuard`:

  - `Access-Control-Allow-Origin` is now set dynamically based on `credentials`:

    - `credentials: true` → returns the actual request origin (`requestOrigin`).
    - `credentials: false` → returns `"*"` to allow any origin.
  - Added `Access-Control-Allow-Credentials: true` **only when `credentials: true`**.
  - Added `Vary: Origin` **only when a dynamic origin is returned**, ensuring caches and proxies do
    not reuse responses across different origins.
  - Requests without an `Origin` header are no longer unnecessarily blocked.
  - Preflight (`OPTIONS`) requests and allowed methods/headers validation are fully supported.
  - Overall improvements to security and browser/proxy compatibility for cross-origin requests, with
    or without credentials.

## [1.4.5] - 2025-12-11

### Added

- Support for asynchronous message queue handling (Async MQ).

## [1.4.4] - 2025-12-09

### Added

- Multiple server types can now run on the same port, enabling single-port deployment environments.

## [1.4.0] - 2025-12-09

### Added

- **RegistryContainer**: a new container for storing and managing internal metadata and registry
  entries.
- **RegistryContainer integration** across `PublicModule`, interactor classes, provider classes, and
  socket classes.
- **Support for instance registration by ID**, allowing components such as sockets to be registered,
  retrieved, and managed using unique identifiers.

## [1.3.18] - 2025-12-07

### Fixed

- Fixed an issue where routes failed to resolve correctly when both `prefix` and `endpoint` were
  empty strings.

## [1.3.13] - 2025-11-27

### Fixed

- PATCH, PUT, and DELETE methods now properly accept a request body (payload).

## [1.3.11] - 2025-11-26

### Fixed

- Fixed an issue where RestClient returned responses with an incorrect Content-Type format.

## [1.3.7] - 2025-11-25

### Fixed

- Avoided the use of reserved names in target injector classes.
- Clarified the error message provided by the connector injections.

## [1.3.6] - 2025-11-25

### Added

- `cookiesGuard`: Added a new guard that parses incoming request cookies and exposes only user-level
  cookies, filtering out internal framework cookies that start with `X-Znx-`.\
  This guard centralizes cookie handling at the server level and prevents framework-specific cookies
  from being exposed in the request context.

## [1.3.5] - 2025-11-25

### Fixed

- HTTP error responses now display the full details.

## [1.3.4] - 2025-11-20

### Added

- Allowed using the same route path with different HTTP methods.

## [1.3.3] - 2025-11-20

### Fixed

- Resolved internal errors metadata and issues caused by serialization.

## [1.3.1] - 2025-11-20

### Added

- **Advanced Error Logging System**:

  - Introduced a new error logging mechanism based on `ZanixLogger` to efficiently manage and track
    errors in the server.
  - Errors are now validated by the `status` property (`{ value: number }`) to identify server-side
    errors (HTTP status 500+), which will always be logged.
  - **Concurrency control**: Errors caused by high concurrency (more than 50 occurrences within the
    last hour) will no longer flood the logs, ensuring a clean log history.
  - Critical errors (HTTP status >= 500) are logged automatically, regardless of the `_logged`
    property.
  - Customizable error codes and messages in critical error classes, helping developers manage
    server exceptions more efficiently.

### Changed

- **Error Handling Workflow**:

  - The logging system now checks for the `status` and `status.value` properties in error objects to
    determine if the error should be treated as a server error.
  - Added a validation mechanism for errors with `status: { value: number }` to ensure proper
    logging of server errors.

### Fixed

- Minor bug fixes related to error logging concurrency handling.

## [1.2.10] - 2025-11-20

### **Fixed**

- **Handled unhandledrejection error**: Resolved an issue with unhandled promise rejections,
  preventing unexpected behavior due to unhandled asynchronous exceptions.
- **Connector initialization order**: Corrected the initialization order of connectors and
  providers, ensuring providers are initialized **after** connectors are fully ready for use,
  preventing potential inconsistencies.

## [1.2.9] - 2025-11-19

### Changed

- Replaced Higher-Order Component (HOC) files with `defs` files to unify module definitions and
  centralize DSL-based declarations, metadata, and foundational structures. This improves
  consistency and simplifies the architecture for components like handlers, interactors, providers,
  and connectors.

## [1.2.8] - 2025-11-18

### Fixed

- `RestClient` body support for all content types.

### Added

- Ephemeral per-request context store (`locals`).

## [1.2.7] - 2025-11-18

### Changed

- Provider instance check replaced with `getProviderConnector`.
- All Guard Middlewares can access to `interactors`, `providers` and `connectors`.

### Fixed

- **`RestClient`**: Endpoints without a base URL now work correctly when the full URL is provided in
  the `endpoint` parameter.

## [1.2.6] - 2025-11-18

### 🚀 **Added**

- **New abstract base classes for HTTP and GraphQL clients**

  - **`RestClient`**: Provides a standardized layer for performing REST operations (`GET`, `POST`,
    `PUT`, `PATCH`, `DELETE`) with:

    - Automatic base URL resolution
    - Default header handling
    - JSON request/response serialization
    - Unified error handling via `HttpError`
  - **`GraphQLClient`**: Extends `RestClient` to simplify sending GraphQL queries using:

    - Automatic `POST` requests
    - GraphQL-specific payload handling
    - Inherited header management, JSON parsing, and error handling

These classes enable easier, more consistent, and reusable implementations of specialized REST and
GraphQL API clients.

## [1.2.5] - 2025-11-17

## [1.2.4] - 2025-11-17

### Added

- **Key-value store connectors**: support for key-value store core connectors

## [1.2.3] - 2025-11-16

## [1.2.2] - 2025-11-16

## [1.2.1] - 2025-11-16

### Added

- **cache ttl offset**: custom function `getTTLWithOffset` to process maximum random offset in
  seconds to add.

## [1.2.0] - 2025-11-16

### Changed

- The `Cache` abstract namespace is now deprecated.
- The `Cache` abstract `client` are adapted to diffetent caches.

## [1.1.5] - 2025-11-15

## [1.1.4] - 2025-11-15

### Changed

- The `Cache` abstract class now supports **typed clients**, allowing for better type safety and
  easier integration with different cache providers.
- The `Cache` abstract provider has been updated to include support for **`withLock`**
  functionality, enabling efficient locking mechanisms for resource access control, preventing race
  conditions in concurrent environments.

## [1.1.3] - 2025-11-14

### Changed

- Cache abstract class now supports scheduler functionality.
- Cache abstract provider now supports retrieving client instances.

### Added

- **Guard Middleware Support**: Added support for middleware decorators and DSLs in
  [Guard](../src/modules/infra/middlewares/defs/guards.ts).

## [1.1.2] - 2025-11-11

### Fixed

- Cache and Worker providers Injection and testing.

## [1.1.1] - 2025-11-11

### Fixed

- Cache and Worker providers.

## [1.1.0] - 2025-11-10

### Added

- Introduced a **technical orchestration layer** for providers in `.providers.ts`, enabling better
  modularity and management of provider interactions.

### Changed

- Updated connector access and definitions: connectors can no longer access other connectors,
  ensuring a more isolated and secure structure.
- Interactors now have access to both providers and connectors, allowing for enhanced flexibility in
  interactions and data flow.
- The **Cache Core** has been refactored into a **Cache Provider**, streamlining cache management
  and improving provider interactions.
- The **Worker Core** is now refactored as a **Worker Provider**, enabling better separation of
  concerns and enhancing worker management capabilities.

## [1.0.15] - 2025-11-03

### Added

- Session base types
- Some documentation

## [1.0.14] - 2025-11-01

### Added

- `AsyncLocalStorage` support for handlers, using `enableALS` flag decorator.
- `CORS` validation middleware.

### Changed

- contextId as optional on constructor

## [1.0.13] - 2025-10-23

### Fixed

- getTargetKey for different classes with the same name

## [1.0.12] - 2025-10-23

### Added

- Connector general options

## [1.0.11] - 2025-10-23

### Fixed

- Connector start and stop methods wrapper
- Freeze instances

## [1.0.10] - 2025-10-22

### Fixed

- Connector core templates
- Program module privacity
- Metadata cleanup

### Added

- Server bootstrap
- Additional exported modules

## [1.0.9] - 2025-10-20

### Fixed

- Exporting additional classes

## [1.0.8] - 2025-10-20

### Fixed

- Connector and database connector structure

## [1.0.7] - 2025-10-17

### Fixed

- Connector default configuration

## [1.0.6] - 2025-10-17

### Added

- Exporting additional types

## [1.0.5] - 2025-10-17

### Fixed

- Decorators types

## [1.0.4] - 2025-10-15

### Fixed

- Fix stop and start methods for multiple servers

## [1.0.3] - 2025-10-15

### Removed

- Reserved ports

### Added

- Already addr in use error

## [1.0.2] - 2025-10-15

### Fixed

- Multiple server creation

### Added

- Reserved ports and names

## [1.0.1] - 2025-10-13

### Added

- Some modules to export

### Fixed

- Global types to local types

### Changed

- Readme.md

## [1.0.0] - 2025-10-13

### Added

- REST Servers: Efficient and scalable REST API server management for seamless communication.
- GraphQL Servers: Easily build and manage GraphQL endpoints for flexible data querying.
- Socket Servers: Real-time communication via WebSockets for interactive, event-driven applications.
- Interactors and Connectors: Built with design patterns like the Adapter pattern, ensuring clean
  separation of concerns and flexibility when integrating with external services and APIs.
