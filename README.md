# Zanix - Server

[![Version](https://img.shields.io/jsr/v/@zanix/server?color=blue&label=jsr)](https://jsr.io/@zanix/server/versions)

[![Release](https://img.shields.io/github/v/release/zanix-io/server?color=blue&label=git)](https://github.com/zanix-io/server/releases)

[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

1. [Description](#description)
2. [Features](#features)
3. [Installation](#installation)
4. [Basic Usage](#basic-usage)
5. [Documentation](#documentation)
6. [Contributing](#contributing)
7. [Changelog](#changelog)
8. [License](#license)
9. [Resources](#resources)

## Description

Zanix Server is a library within the **Zanix** ecosystem, a collection of tools designed to
streamline server management in projects using the Zanix framework. This library offers key
functionalities for efficiently running and managing servers, making it easier to integrate and
deploy applications within Deno.

## Features

### **Architecture Overview**

This repository follows a **hybrid architectural pattern**, inspired by the **Adapter Pattern** and
enhanced with **modular service orchestration** to support scalability, testability, and
maintainability. The design enforces **separation of concerns**, enabling clean integration with
external systems while keeping business logic isolated.

Below is a high-level overview of the architecture of a **ZANIX** application:

```
+-------------------------------------------------+
|                EXTERNAL INPUTS                  |  <- HTTP, GraphQL, WebSocket, Events
+-------------------------------------------------+
                        |
                        v
+-------------------------------------------------+
|                    HANDLERS                     |  <- *.handler.ts
|        Controllers, Resolvers, Sockets          |
+-------------------------------------------------+
                        |
                        v
+-------------------------------------------------+
|                  INTERACTORS                    |  <- *.interactor.ts
|   Core Business Logic, Application Services     |
+-------------------------------------------------+
                        |
                        v
+-------------------------------------------------+
|                   PROVIDERS                     |  <- *.provider.ts
|         Technical Orchestration Layer           |
|   (Repositories, DataServices, InfraServices)   |
|    Use CONNECTORS to access external systems    |
+-------------------------------------------------+
                        |
                        v
+-------------------------------------------------+
|                   CONNECTORS                    |  <- *.connector.ts
|  DB, APIs, Queues, Cache, External Integrations |
|    Pure infrastructure layer, no domain logic   |
+-------------------------------------------------+
                 ▲             ▲
                 |             |
                 |             |
+----------------+-------------+------------------+
|             DEPENDENCIES (DSL/Defs)             |  <- *.defs.ts
|      Middleware, Queues, Jobs, Models, etc.     |
+-------------------------------------------------+
```

The `DEPENDENCIES (DSL/Defs)` layer is consumed by all four layers above it (handlers, interactors,
providers, and connectors) — the diagram only draws its two most direct connections to keep the
ASCII art readable.

---

### **Component Descriptions**

- **Handlers** (`*.handler.ts`): Handle **incoming requests or events**. Include controllers,
  resolvers, and WebSocket handlers. They delegate execution to **Interactors** while remaining free
  of business logic.

- **Interactors** (`*.interactor.ts`): Encapsulate the **core business logic** and
  **application-level orchestration**. Interactors call **Providers** to perform operations that
  involve external systems or technical workflows.

- **Providers** (`*.provider.ts`): Serve as the **technical orchestration layer**, bridging
  interactors and connectors. They may **fuse the responsibilities of repositories and data
  services**, orchestrating multiple connectors while keeping domain logic separate.

- **Connectors** (`*.connector.ts`): Handle **low-level integration** with external systems
  (databases, caches, APIs, queues, etc.). They are pure infrastructure components with no domain
  logic.

- **Dependencies / Definitions / DSL** (`*.defs.ts`): Contain domain definitions, metadata
  structures, and DSL-based declarations used to define, create, or register entities within the
  module. These files establish the foundational contracts, schemas, and configurable behaviors—such
  as middleware pipes, queues, jobs, auth guards, or model utilities—that other components
  (handlers, interactors, providers, and connectors) depend on.

---

### **File Naming Conventions**

| Component Type           | File Suffix      | Example                |
| ------------------------ | ---------------- | ---------------------- |
| Handler                  | `.handler.ts`    | `user.handler.ts`      |
| Interactor               | `.interactor.ts` | `auth.interactor.ts`   |
| Provider                 | `.provider.ts`   | `user.provider.ts`     |
| Connector                | `.connector.ts`  | `payment.connector.ts` |
| Definitions (DSL/Domain) | `.defs.ts`       | `model.defs.ts`        |

`@zanix/server` itself doesn't scan the filesystem — a class registers as soon as its decorator
runs, regardless of file name, as long as something imports it. These suffixes (and their resolution
order, exported as `ZANIX_SERVER_MODULES` — see [Configuration](./docs/CONFIGURATION.md)) matter for
tooling that auto-discovers modules by convention, such as `@zanix/core`'s bootstrap.

---

### Error Handling and Logging

Zanix Server provides an advanced mechanism for managing and tracking errors. For a detailed guide
on how errors are logged and handled in the system, check out the full documentation
[here](./docs/ERRORS.md).

## Installation

To install **Zanix Server** in your project, use [Deno](https://deno.com/) with the following
imports:

```ts
import * as server from 'jsr:@zanix/server@[version]'
```

> Requires **Deno 2.9 or later** (see the [CHANGELOG](./CHANGELOG.md) for version compatibility
> notes).

**Important:**

1. **Install Deno**: Ensure Deno is installed on your system. If not, follow the
   [official installation guide](https://docs.deno.com/runtime/getting_started/installation).

2. **Install VSCode Extension**: If using Visual Studio Code, install the **Deno extension** for
   syntax highlighting, IntelliSense, and linting. Get it from the
   [VSCode marketplace](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno).

3. **Add Deno to PATH**: Ensure Deno is in your system’s `PATH` so the plugin works correctly:
   - **macOS/Linux**: Add to `.bashrc`, `.zshrc`, or other shell config files:
     ```bash
     export PATH="$PATH:/path/to/deno"
     ```
   - **Windows**: Add the Deno folder to your system’s `PATH` via Environment Variables.

---

### Importing Features

Rather than the wildcard import above, you'll typically import only what you need. The table below
groups the main exports by category — each links to a guide with full usage examples:

| Category           | Key exports                                                                                                                              | Guide                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| REST Handlers      | `Controller`, `Get`, `Post`, `Patch`, `Put`, `Delete`, `Request`, `ZanixController`                                                      | [Handlers](./docs/HANDLERS.md)                         |
| GraphQL Handlers   | `Resolver`, `Query`, `Mutation`, `GQLRequest`, `ZanixResolver`                                                                           | [Handlers](./docs/HANDLERS.md)                         |
| WebSocket Handlers | `Socket`, `ZanixWebSocket`                                                                                                               | [Handlers](./docs/HANDLERS.md)                         |
| Interactors        | `Interactor`, `ZanixInteractor`                                                                                                          | [Dependency Injection](./docs/DEPENDENCY-INJECTION.md) |
| Connectors         | `Connector`, `ZanixDatabaseConnector`, `ZanixAsyncmqConnector`, `ZanixCacheConnector`, `ZanixKVConnector`, `RestClient`, `GraphQLClient` | [Dependency Injection](./docs/DEPENDENCY-INJECTION.md) |
| Providers          | `Provider`, `ZanixProvider`, `ZanixCacheProvider`, `ZanixWorkerProvider`, `ZanixAsyncMQProvider`                                         | [Dependency Injection](./docs/DEPENDENCY-INJECTION.md) |
| Middlewares        | `Guard`, `Pipe`, `Interceptor`, `RequestValidation`, `registerGlobalGuard`, `registerGlobalPipe`, `registerGlobalInterceptor`            | [Middlewares](./docs/MIDDLEWARES.md)                   |
| Constants          | `GRAPHQL_PORT`, `SOCKET_PORT`, `JSON_CONTENT_HEADER`, and more                                                                           | [Configuration](./docs/CONFIGURATION.md)               |
| Server management  | `webServerManager`, `bootstrapServers`                                                                                                   | [Getting Started](./docs/GETTING-STARTED.md)           |
| Program access     | `ProgramModule`                                                                                                                          | [Dependency Injection](./docs/DEPENDENCY-INJECTION.md) |

```typescript
import { Controller, Get, ZanixController } from 'jsr:@zanix/server@[version]'
```

> For a guided walkthrough of handlers, middlewares, and dependency injection, see the
> [documentation](#documentation) section below.

---

## Basic Usage

Define a controller and start the server — the recommended, decorator-based way to use Zanix Server:

```typescript
import { bootstrapServers, Controller, Get, ZanixController } from 'jsr:@zanix/server@[version]'

@Controller('hello')
class HelloController extends ZanixController {
  @Get()
  public sayHello() {
    return { message: 'Hello from Zanix!' }
  }
}

await bootstrapServers({ rest: { globalPrefix: '/api' } })
```

This starts a REST server exposing `GET /api/hello`. For manual control over individual servers —
without controllers — see
[Getting Started: manual server control](./docs/GETTING-STARTED.md#advanced-manual-server-control).

### Special Environment Variables

Zanix Server reads a handful of environment variables to configure SSL and per-server-type ports —
see the [Configuration](./docs/CONFIGURATION.md#environment-variables) guide for the full list.

## Documentation

- [Getting Started](./docs/GETTING-STARTED.md) — build and run your first server end to end.
- [Handlers](./docs/HANDLERS.md) — REST controllers, GraphQL resolvers, WebSocket handlers, and
  request validation.
- [Middlewares](./docs/MIDDLEWARES.md) — guards, pipes, interceptors, and global middleware
  registration.
- [Dependency Injection](./docs/DEPENDENCY-INJECTION.md) — connectors, providers, interactors, and
  their lifecycle (`lifetime`/`startMode`).
- [Configuration](./docs/CONFIGURATION.md) — default ports, constants, and environment variables.
- [Error Handling](./docs/ERRORS.md) — how errors are logged, serialized, and returned to clients.
- [Utilities Reference](./docs/UTILITIES.md) — routing, compression, and target-management helpers.

The full API reference (every exported class, decorator, and type, generated from source) is
published on [jsr.io/@zanix/server](https://jsr.io/@zanix/server/doc). For the broader Zanix
ecosystem, see the [Zanix organization on GitHub](https://github.com/zanix-io).

## Contributing

If you'd like to contribute to this library, please follow these steps:

1. Report Issues: If you encounter any bugs or have suggestions for improvement, please open an
   issue on the GitHub repository. Be sure to provide detailed information to help us understand the
   problem.

2. Fork the Repository: Create your own fork of the repository to make changes.

3. Create a New Branch: Create a descriptive branch name for your feature or bug fix.

4. Make Your Changes: Implement the feature or fix the bug, ensuring you follow the project's coding
   style and guidelines.

5. Write Tests: If applicable, write tests to verify that your changes work as expected.

6. Submit a Pull Request: Once you're satisfied with your changes, submit a pull request with a
   clear description of the changes you’ve made.

## Changelog

For a detailed list of changes, please refer to the [CHANGELOG](./CHANGELOG.md) file.

## License

This library is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more details.

## Resources

- [Deno Documentation](https://docs.deno.com/)
- [Zanix Framework Documentation](https://github.com/zanix-io)

---

_Developed with ❤️ by Ismael Calle | [@iscam2216](https://github.com/iscam2216)_
