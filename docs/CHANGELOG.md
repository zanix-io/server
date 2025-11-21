# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
