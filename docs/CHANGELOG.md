# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
