# Dependency Injection: Connectors, Providers, and Interactors

Zanix Server's dependency injection system is built around three target types, each with a distinct
responsibility (see the [architecture overview](../README.md#architecture-overview) for how they fit
into the request flow):

- **Connectors** (`@Connector`) — pure infrastructure: databases, caches, message queues, external
  APIs. No domain logic.
- **Providers** (`@Provider`) — the technical orchestration layer, bridging interactors and
  connectors.
- **Interactors** (`@Interactor`) — core business logic, consumed by handlers.

All three are registered with a class decorator that controls **when** the instance is created
(`startMode`) and **how long it lives** (`lifetime`).

## Lifetime

| Value       | Behavior                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SINGLETON` | A single instance is reused for the entire application lifecycle.                                                                                     |
| `SCOPED`    | A new instance is created per server request, reused throughout that request's duration.                                                              |
| `TRANSIENT` | A new instance is created on every call/invocation; nothing is reused. Not available for `@Provider` — only `@Connector` and `@Interactor` accept it. |

## Start mode

| Value      | Behavior                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------- |
| `onSetup`  | Initialized before the server starts. If initialization fails, the server does not start. |
| `onBoot`   | Initialized right after `onSetup`; the server waits for it to complete before proceeding. |
| `postBoot` | Initialized after the server has started, in the background, without blocking startup.    |
| `lazy`     | Initialized only when first needed; never blocks server startup.                          |

> ⚠️ A `TRANSIENT` lifetime is not compatible with `startMode: 'lazy'` — a transient instance is
> always tied to a specific call, so it cannot be lazily shared. Be cautious using a transient
> connector/interactor as a dependency of another class: its reference is discarded immediately
> after use.

## Connectors

```ts
import { Connector, ZanixConnector } from 'jsr:@zanix/server@[version]'

@Connector({ startMode: 'onBoot', lifetime: 'SINGLETON' })
class DatabaseConnector extends ZanixConnector {
  protected override initialize() {
    // connect to the underlying resource
  }
  public override isHealthy() {
    return true
  }
}
```

Defaults when no options are given: `type: 'custom'`, `startMode: 'postBoot'`,
`lifetime: 'SINGLETON'`, `autoInitialize: true`.

### `autoInitialize`

Controls whether the connector initializes itself automatically on instantiation:

- `true` (default) — initializes automatically.
- `false` — you must call the initialization method manually.
- An object — fine-tunes automatic initialization:
  - `timeoutConnection` — max time (ms) to wait for the connection. Defaults to **10000ms**.
  - `retryInterval` — time (ms) between retries. Defaults to **500ms**.

## Providers

The idiomatic way for a provider to reach its connector is through a **named, typed slot**: declare
which core connector(s) it depends on via the generic type parameter, and access them through the
matching getter (`this.database`, `this.cache`, `this.worker`, `this.asyncmq`, or `this.kvLocal`).
The connector itself is typically a concrete class from a companion Zanix package — e.g.
`ZanixMongoConnector` from `@zanix/datamaster` — rather than something `@zanix/server` provides
directly (see
[Built-in connector and provider base classes](#built-in-connector-and-provider-base-classes) below
for the abstract bases `@zanix/server` _does_ ship):

```ts
import { Provider, ZanixProvider } from 'jsr:@zanix/server@[version]'
import type { ZanixMongoConnector } from '@zanix/datamaster'

@Provider()
class UsersRepository extends ZanixProvider<{ database: ZanixMongoConnector }> {
  public findById(id: string) {
    return this.database.getModel('User').findById(id)
  }
}
```

Defaults when no options are given: `type: 'custom'`, `startMode: 'lazy'`, `lifetime: 'SINGLETON'`.

For a connector that doesn't fit one of the named slots (`database`/`cache`/`worker`/`asyncmq`/
`kvLocal`), you have two other options: reach it dynamically with
[`this.connectors.get(X)`](#reaching-other-dependencies-thisproviders-thisconnectors-thisinteractors)
(same mechanism the named getters use internally), or expose your own single lookup method by
overriding `use()` — a separate, independent extension point meant to be the provider's own public
entry point for other code to call (e.g. `someProvider.use(SomeConnector)`):

```ts
@Provider()
class NotificationsProvider extends ZanixProvider {
  public override use(target: unknown) {
    return this.getProviderConnector(target as never)
  }
}
```

## Interactors

```ts
import { Interactor, ZanixInteractor } from 'jsr:@zanix/server@[version]'

@Interactor({ Connector: DatabaseConnector })
class UsersInteractor extends ZanixInteractor<{ Connector: DatabaseConnector }> {
  public findById(id: string) {
    return this.connector.findById(id)
  }
}
```

An interactor may declare a `Connector`, a `Provider`, or both as dependencies, accessed via
`this.connector`/`this.provider`. Defaults when no options are given: `lifetime: 'SCOPED'`,
`startMode: 'lazy'`.

> ⚠️ Only declare **custom** connectors/providers this way (ones extending `ZanixConnector`/
> `ZanixProvider` directly). Passing a class that extends one of the
> [built-in base classes](#built-in-connector-and-provider-base-classes) (`ZanixDatabaseConnector`,
> `ZanixCacheConnector`, etc.) as `@Interactor`'s `Connector`/`Provider` option throws an
> `InternalError` — access those through the matching named getter instead (`this.database`,
> `this.cache`, etc., same as on a [provider](#providers)), without declaring them on the decorator
> at all.

## Reaching other dependencies (`this.providers`, `this.connectors`, `this.interactors`)

`this.connector`/`this.provider` (above) only give you the _one_ dependency declared on the
decorator. Both providers and interactors also expose dynamic getters for reaching **any other**
registered connector or provider by class — this is the common pattern when a provider or interactor
needs more than one dependency:

```ts
class UsersInteractor extends ZanixInteractor {
  public async registerUser(data: UserData) {
    const users = this.providers.get(UsersRepository)
    const roles = this.providers.get(RolesRepository)
    const cache = this.connectors.get(RedisConnector)
    // ...
  }
}
```

Interactors additionally expose `this.interactors.get(OtherInteractorClass)` to call another
interactor directly (circular self-references resolve to the same instance rather than recursing).

| Getter                    | Available on           | Resolves                                                    |
| ------------------------- | ---------------------- | ----------------------------------------------------------- |
| `this.connectors.get(X)`  | Providers, Interactors | Any registered connector, by class or `CoreConnectors` key. |
| `this.providers.get(X)`   | Providers, Interactors | Any registered provider, by class or `CoreProviders` key.   |
| `this.interactors.get(X)` | Interactors only       | Any registered interactor, by class.                        |

> ℹ️ These getters resolve within the **current request's context** automatically — you don't pass a
> context id yourself here (unlike the `ProgramModule` accessors below, which are for use _outside_
> a handler/interactor/provider instance and do require one).

## Built-in connector and provider base classes

Instead of extending `ZanixConnector`/`ZanixProvider` directly, you can extend one of these
ready-made **abstract** base classes for common infrastructure. `@zanix/server` only ships the
abstractions below — a concrete, ready-to-use connector for a specific technology (MongoDB, Redis,
etc.) either comes from a companion Zanix package built on top of one of these bases (e.g.
`ZanixMongoConnector` from `@zanix/datamaster`, extending `ZanixDatabaseConnector`), or you write it
yourself, as shown in the `PostgresConnector` example below.

| Class                    | Extends          | Purpose                                                                              |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------ |
| `ZanixDatabaseConnector` | `ZanixConnector` | Foundation for relational/non-relational database connectors.                        |
| `ZanixAsyncmqConnector`  | `ZanixConnector` | Foundation for message broker connectors (RabbitMQ, Kafka, MQTT...).                 |
| `ZanixCacheConnector`    | `ZanixConnector` | Foundation for caching backends (Redis, Memcached, in-memory).                       |
| `ZanixKVConnector`       | `ZanixConnector` | Foundation for key-value store connectors, with optional TTL support.                |
| `RestClient`             | `ZanixConnector` | REST HTTP client with base URL resolution, JSON parsing, and unified error handling. |
| `GraphQLClient`          | `RestClient`     | Extends `RestClient` to simplify sending GraphQL queries over `POST`.                |
| `ZanixCacheProvider`     | `ZanixProvider`  | Orchestrates one or more `ZanixCacheConnector`s.                                     |
| `ZanixWorkerProvider`    | `ZanixProvider`  | Orchestrates background/worker task execution.                                       |
| `ZanixAsyncMQProvider`   | `ZanixProvider`  | Orchestrates one or more `ZanixAsyncmqConnector`s.                                   |

```ts
import { Connector, ZanixDatabaseConnector } from 'jsr:@zanix/server@[version]'

@Connector({ startMode: 'onBoot' })
class PostgresConnector extends ZanixDatabaseConnector {
  protected override initialize() {
    // open the database connection
  }
  public override getModel(model: unknown) {
    // return the model/repository for `model`
  }
}
```

## Accessing instances outside any class (`ProgramModule`)

The getters above (`this.connector`, `this.providers.get(...)`, etc.) only work from within a
provider, interactor, or handler instance. For the rarer case where you need an instance from
somewhere with no `this` at all — a standalone script, a test, or a custom middleware function —
`ProgramModule` exposes the same accessors directly:

```ts
import { ProgramModule } from 'jsr:@zanix/server@[version]'

const provider = ProgramModule.getProviders().get(NotificationsProvider)
const connector = ProgramModule.getConnectors('some-context-id').get(DatabaseConnector)
const interactor = ProgramModule.getInteractors('some-context-id').get(UsersInteractor)
```

| Method                            | Signature                                           | Notes                                                                                                                  |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `getProviders(ctxId?, verbose?)`  | returns `{ get(ProviderClass \| CoreProviders) }`   | `ctxId` is optional; omitted retrieves globally.                                                                       |
| `getConnectors(ctxId?, verbose?)` | returns `{ get(ConnectorClass \| CoreConnectors) }` | `ctxId` is optional; omitted retrieves globally.                                                                       |
| `getInteractors(ctxId, verbose?)` | returns `{ get(InteractorClass) }`                  | `ctxId` is **required** for interactors.                                                                               |
| `registry`                        | `RegistryContainer`                                 | The underlying DI metadata registry.                                                                                   |
| `asyncContext`                    | `AsyncContext`                                      | The `AsyncLocalStorage` wrapper used for per-request context (see `enableALS` in [Handlers](./HANDLERS.md#enableals)). |

> ⚠️ Use these accessors carefully: bypassing the normal injection flow can break lifecycle rules
> (e.g. `SCOPED`/`TRANSIENT` semantics) or lead to unintended singleton/multi-instance behavior.
> Prefer framework-managed injection (`@Interactor`, `@Controller({ Interactor })`, etc.) whenever
> possible.

## See also

- [Handlers](./HANDLERS.md) — how to inject an `Interactor` into a controller, resolver, or socket.
- [Configuration](./CONFIGURATION.md) — default ports and other constants.
- [Error Handling](./ERRORS.md) — errors raised when a dependency can't be resolved.
