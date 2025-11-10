# Zanix - Server

[![Version](https://img.shields.io/jsr/v/@zanix/server?color=blue&label=jsr)](https://jsr.io/@zanix/zerver/versions)

[![Release](https://img.shields.io/github/v/release/zanix-io/server?color=blue&label=git)](https://github.com/zanix-io/server/releases)

[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

1. [Description](#description)
2. [Features](#features)
3. [Installation](#installation)
4. [Basic Usage](#basic-usage)
5. [Documentation](#documentation)
6. [Contributing](#contributing)
7. [License](#license)
8. [Resources](#resources)

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
|  Controllers, Resolvers, Subscribers, Sockets   |
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
|             DEPENDENCIES (HOCs)                 |  <- *.hoc.ts
|  Middleware, Jobs, Models, Auth Guards, etc.    |
+-------------------------------------------------+
```

---

### **Component Descriptions**

- **Handlers** (`*.handler.ts`): Handle **incoming requests or events**. Include controllers,
  resolvers, subscribers, and WebSocket handlers. They delegate execution to **Interactors** while
  remaining free of business logic.

- **Interactors** (`*.interactor.ts`): Encapsulate the **core business logic** and
  **application-level orchestration**. Interactors call **Providers** to perform operations that
  involve external systems or technical workflows.

- **Providers** (`*.provider.ts`): Serve as the **technical orchestration layer**, bridging
  interactors and connectors. They may **fuse the responsibilities of repositories and data
  services**, orchestrating multiple connectors while keeping domain logic separate.

- **Connectors** (`*.connector.ts`): Handle **low-level integration** with external systems
  (databases, caches, APIs, queues, etc.). They are pure infrastructure components with no domain
  logic.

- **Dependencies / HOCs** (`*.hoc.ts`): Shared reusable building blocks (Higher-Order Components)
  that enhance or wrap components, such as middlewares, jobs, auth guards, or model utilities.

---

### **File Naming Conventions**

| Component Type               | File Suffix      | Example                |
| ---------------------------- | ---------------- | ---------------------- |
| Handler                      | `.handler.ts`    | `user.handler.ts`      |
| Interactor                   | `.interactor.ts` | `auth.interactor.ts`   |
| Provider                     | `.provider.ts`   | `user.provider.ts`     |
| Connector                    | `.connector.ts`  | `payment.connector.ts` |
| Higher-Order Component (HOC) | `.hoc.ts`        | `model.hoc.ts`         |

---

## Installation

To install **Zanix Server** in your project, use [Deno](https://deno.com/) with the following
imports:

```ts
import * as server from 'jsr:@zanix/server@[version]'
```

## Importing Features

To use specific features from **Zanix Server** in your project, you can import various handlers,
interactors, connectors, middlewares, and constants as needed. Below is an example of how to import
different components:

### 1. **Handlers**

Handlers allow you to define the behavior of different types of servers, such as REST, GraphQL, and
WebSocket. You can import them individually based on your needs:

- **REST Handlers** For REST API endpoints, you can import the core controllers and decorators:

  ```typescript
  import {
    Controller,
    Delete,
    Get,
    Patch,
    Post,
    Put,
    Request,
    ZanixController,
  } from 'jsr:@zanix/server@[version]'
  ```

  Use these decorators to define the routing for different HTTP methods, such as `@Get()`,
  `@Post()`, etc.

- **GraphQL Handlers** For GraphQL-based endpoints, you can import the resolvers and their
  respective decorators:

  ```typescript
  import { GQLRequest, Mutation, Query, Resolver, ZanixResolver } from 'jsr:@zanix/server@[version]'
  ```

- **WebSocket Handlers** For real-time communication with WebSockets, you can import the base
  WebSocket handler and socket decorators:

  ```typescript
  import { Socket, ZanixWebSocket } from 'jsr:@zanix/server@[version]'
  ```

### 2. **Interactors**

Interactors handle the business logic of your application. You can import them to integrate complex
operations seamlessly:

```typescript
import { Interactor, ZanixInteractor } from 'jsr:@zanix/server@[version]'
```

### 3. **Connectors**

Connectors help integrate external services, databases, and communication layers into your
application. You can import connectors based on the service you need to integrate:

- **Database Connector**

  ```typescript
  import { ZanixDatabaseConnector } from 'jsr:@zanix/server@[version]'
  ```

- **Async Message Queue Connector**

  ```typescript
  import { ZanixAsyncmqConnector } from 'jsr:@zanix/server@[version]'
  ```

- **Cache Connector**

  ```typescript
  import { ZanixCacheConnector } from 'jsr:@zanix/server@[version]'
  ```

### 4. **Middlewares**

Middlewares provide hooks for managing requests, validation, or transformations. You can import
global middlewares or specific decorators to apply functionality to your server:

- **Global Interceptors and Pipes**

  ```typescript
  import { defineGlobalInterceptorHOC, defineGlobalPipeHOC } from 'jsr:@zanix/server@[version]'
  ```

- **Specific Middlewares (Validation, Interceptors, etc.)**

  ```typescript
  import { Interceptor, Pipe, RequestValidation } from 'jsr:@zanix/server@[version]'
  ```

### 5. **Constants**

You may also need constants for specific configurations like GraphQL ports, socket ports, and
content headers. Here’s how you can import them:

```typescript
import { GRAPHQL_PORT, JSON_CONTENT_HEADER, SOCKET_PORT } from 'jsr:@zanix/server@[version]'
```

### 6. **WebServerManager**

The `webServerManager` instance helps you manage different types of web servers dynamically. You can
import and use it to create, start, stop, and retrieve information about your servers:

```typescript
import { webServerManager } from 'jsr:@zanix/server@[version]'

// Example of starting a REST server:
const server = webServerManager.create('rest', { handler: () => new Response('Hello World') })
webServerManager.start('rest')
```

By importing the required modules and using the provided classes, decorators, and utilities, you can
easily configure and run your desired server types within the Zanix framework.

---

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

## Basic Usage

Here’s a basic example of how to use the module:

```typescript
import { webServerManager } from 'jsr:@zanix/server@[version]'

// Example of starting a REST server:
const serverId = webServerManager.create('rest', { handler: () => new Response('Hello World') })
webServerManager.start(serverId)
```

### 🔧 Special Environment Variables

Zanix Server provides the following environment variables to customize and configure different parts
of your development environment:

| Name            | Description                           |
| --------------- | ------------------------------------- |
| `SSL_KEY_PATH`  | Path to the SSL private key file      |
| `SSL_CERT_PATH` | Path to the SSL certificate file      |
| `PORT`          | Base/default port for the application |
| `PORT_GRAPHQL`  | Port for the GraphQL API              |
| `PORT_SOCKET`   | Port for WebSocket connections        |
| `PORT_REST`     | Port for the REST API                 |

Refer to the full documentation for more advanced usage and examples.

## Documentation

For full documentation, check out the [official Zanix website](https://github.com/zanix-io) for
detailed usage, advanced examples, and more.

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

For a detailed list of changes, please refer to the [CHANGELOG](./docs/CHANGELOG.md) file.

## License

This library is licensed under the MIT License. See the [LICENSE](./docs/LICENSE) file for more
details.

## Resources

- [Deno Documentation](https://docs.deno.com/)
- [Zanix Framework Documentation](https://github.com/zanix-io)

---

_Developed with ❤️ by Ismael Calle | [@iscam2216](https://github.com/iscam2216)_
