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

> 💡 If you're building a full application, the recommended entrypoint is
> **[`@zanix/core`](https://jsr.io/@zanix/core)**, which wires this package together with
> `@zanix/asyncmq`, `@zanix/datamaster`, `@zanix/auth`, and `@zanix/notifications` via
> `Zanix.start()`/`Zanix.startWorker()`. `@zanix/server` provides the underlying DI/decorator
> primitives those packages (and `@zanix/core`) build on.

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
order, exported as `ZANIX_SERVER_MODULES` — see [Configuration](./docs/configuration.md)) matter for
tooling that auto-discovers modules by convention, such as `@zanix/core`'s bootstrap.

---

### Error Handling and Logging

Zanix Server provides an advanced mechanism for managing and tracking errors. For a detailed guide
on how errors are logged and handled in the system, check out the full documentation
[here](./docs/errors.md).

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

| Category                      | Key exports                                                                                                                                                           | Guide                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| REST Handlers                 | `Controller`, `Get`, `Post`, `Patch`, `Put`, `Delete`, `Request`, `ZanixController`                                                                                   | [Handlers](./docs/handlers.md)                                           |
| GraphQL Handlers              | `Resolver`, `Query`, `Mutation`, `GQLRequest`, `ZanixResolver`                                                                                                        | [Handlers](./docs/handlers.md)                                           |
| WebSocket Handlers            | `Socket`, `ZanixWebSocket`                                                                                                                                            | [Handlers](./docs/handlers.md)                                           |
| Interactors                   | `Interactor`, `ZanixInteractor`                                                                                                                                       | [Dependency Injection](./docs/dependency-injection.md)                   |
| Connectors                    | `Connector`, `ZanixDatabaseConnector`, `ZanixAsyncmqConnector`, `ZanixCacheConnector`, `ZanixKVConnector`, `RestClient`, `GraphQLClient`, `registerCoreConnectorSlot` | [Dependency Injection](./docs/dependency-injection.md)                   |
| Providers                     | `Provider`, `ZanixProvider`, `ZanixCacheProvider`, `ZanixWorkerProvider`, `dispatchWorkerTask`, `ZanixAsyncMQProvider`, `registerCoreProviderSlot`                    | [Dependency Injection](./docs/dependency-injection.md)                   |
| Middlewares                   | `Guard`, `Pipe`, `Interceptor`, `RequestValidation`, `registerGlobalGuard`, `registerGlobalPipe`, `registerGlobalInterceptor`                                         | [Middlewares](./docs/middlewares.md)                                     |
| Error Handling                | `httpErrorResponse`, `attachGlobalErrorHandlers`, `ErrorLogThrottle`                                                                                                  | [Error Handling](./docs/errors.md)                                       |
| Constants                     | `GRAPHQL_PORT`, `SOCKET_PORT`, `JSON_CONTENT_HEADER`, and more                                                                                                        | [Configuration](./docs/configuration.md)                                 |
| Server management             | `webServerManager`, `bootstrapServers`                                                                                                                                | [Getting Started](./docs/getting-started.md)                             |
| Application server-id helpers | `resolveApplicationServerId`, `resolvePreviousApplicationServerId`                                                                                                    | [Utilities Reference](./docs/utilities.md#application-server-id-helpers) |
| Program access                | `ProgramModule`                                                                                                                                                       | [Dependency Injection](./docs/dependency-injection.md)                   |

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
[Getting Started: manual server control](./docs/getting-started.md#advanced-manual-server-control).

### Health & Readiness

`GET /health` (liveness, always a cheap `200`) and `GET /ready` (readiness) are registered
automatically, on by default, on every port that ends up hosting real content — `rest`, `graphql`,
`socket`, or `ssr` alike, never the sole reason a listener starts:

```typescript
await bootstrapServers({
  rest: { application: 'shop', globalPrefix: '/api' },
  health: {
    checks: {
      redis: async () => (await redisConnector.ping()) === 'PONG',
    },
  },
})
// GET /health -> 200 { status: 'ok' }
// GET /ready  -> 200/503 {
//   status,
//   shared: { status, checks: { ...coreConnectors } },
//   apps: { shop: { status, checks: { redis } } },
// }
```

`/ready`'s body always separates two dimensions: `shared` (every auto-discovered core connector's
`isReady`/`isHealthy` — process-wide infrastructure, not owned by any one Application) and `apps`
(each Application's own `health.checks`, keyed by Application name). When two or more Applications
share a port, `/health` stays a single, first-claim-wins default (it never varies per Application),
but `/ready` aggregates every sharing Application's own `checks` under its own `apps` entry — no
Application's checks are ever silently dropped in favor of another's.

`health: false` disables both; an object overrides `path`/`readyPath` or adds `checks` (merged into
the auto-discovered ones, each receiving a `providers`/`connectors` getter to reach any registered
target). Writing your own `@Controller`/`@Get('/health')` at the same path replaces the default
entirely, no separate flag needed. See [`BootstrapServerOptions.health`](./mod.ts)'s own doc for the
full shape, and [`docs/applications.md`](./docs/applications.md) for how this plays with multiple
servers/Applications sharing one port.

### Special Environment Variables

Zanix Server reads a handful of environment variables to configure SSL and per-server-type ports —
see the [Configuration](./docs/configuration.md#environment-variables) guide for the full list.

## Documentation

- [Getting Started](./docs/getting-started.md) — build and run your first server end to end.
- [Handlers](./docs/handlers.md) — REST controllers, GraphQL resolvers, WebSocket handlers, SSR
  controllers, and request validation.
- [Applications](./docs/applications.md) — Application composition, anchored servers, shared ports,
  boot sessions, and Discovery.
- [Middlewares](./docs/middlewares.md) — guards, pipes, interceptors, and global middleware
  registration.
- [Dependency Injection](./docs/dependency-injection.md) — connectors, providers, interactors, and
  their lifecycle (`lifetime`/`startMode`).
- [Configuration](./docs/configuration.md) — default ports, constants, and environment variables.
- [Error Handling](./docs/errors.md) — how errors are logged, serialized, and returned to clients.
- [Utilities Reference](./docs/utilities.md) — routing, compression, and target-management helpers.

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

5. Write Tests: If applicable, write tests to verify that your changes work as expected. Run
   `deno test --allow-all` — that already includes the performance regression gate, which fails only
   on a significant slowdown of a critical request-path operation. If you touched the request
   pipeline (routing, middlewares, context or response building), also run `deno task bench` for
   before/after evidence. See [Benchmarks & Performance Regression](./docs/benchmarks.md) for what
   the suite measures, and `src/@tests/performance/baseline.ts` for every recorded baseline and why
   each threshold is what it is.

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
