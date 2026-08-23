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

> ℹ️ For a `@Connector`, `onSetup`/`onBoot` fail on the very first failed `initialize()` attempt —
> both already abort startup, so retrying in-process would only delay that fail-fast signal, which
> an orchestrator's own restart policy (where configured) is the appropriate place to handle
> instead. `postBoot`/`lazy` retry `initialize()` per `autoInitialize`'s `retryInterval`/
> `timeoutConnection` (see below) before giving up, since nothing external is positioned to retry
> either of those once the server has already reported started.

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

Defaults when no options are given: `slot: 'custom'`, `startMode: 'postBoot'`,
`lifetime: 'SINGLETON'`, `autoInitialize: true`.

### `autoInitialize`

Controls whether the connector initializes itself automatically on instantiation:

- `true` (default) — initializes automatically.
- `false` — you must call the initialization method manually. `initialize()` is then never called by
  the framework at all, so none of `timeoutConnection`/`retryInterval` below ever apply.
- An object — fine-tunes automatic initialization:
  - `timeoutConnection` — max time (ms) to wait for the connection. Defaults to **10000ms**. Also
    the budget `connectorModuleInitialization`'s post-ready `isHealthy()` polling uses, for every
    `startMode`.
  - `retryInterval` — time (ms) between retries. Defaults to **500ms**. Governs two different retry
    loops: `initialize()` itself (only for `startMode: 'postBoot'`/`'lazy'` — see the
    [start mode note](#start-mode) above) and the post-ready `isHealthy()` polling (every
    `startMode`).

### `connectorKey` — a connector's own identity

Every connector instance exposes `protected readonly connectorKey: string` — the DI key it was
actually registered under: the literal slot string for a class aliased to a core slot (`'database'`,
regardless of which subclass implements it), or an auto-generated key unique to that class
otherwise. `getConnectorKey(ConnectorClass)` resolves the same value from the class itself, before
any instance exists — useful for a companion package that needs to bind its own state to a specific
connector without requiring that connector to declare an explicit `slot` (`@zanix/datamaster`'s
`registerModel(model, type, ConnectorClass)` is the reference example: two different connector
classes always resolve to two different keys, decorated with a slot or not).

```ts
import { getConnectorKey } from 'jsr:@zanix/server@[version]'

@Connector({ slot: 'billing' })
class BillingConnector extends ZanixConnector {/* ... */}

getConnectorKey(BillingConnector) // "billing", once BillingConnector has been decorated
```

## Providers

The idiomatic way for a provider to reach its connector is through a **named, typed slot**: declare
which core connector(s) it depends on via the generic type parameter, and access them through the
matching getter (`this.database`, `this.cache`, `this.worker`, `this.asyncmq`, `this.kvLocal`, or
`this.search`). The connector itself is typically a concrete class from a companion Zanix package —
e.g. `ZanixMongoConnector` from `@zanix/datamaster` — rather than something `@zanix/server` provides
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

Defaults when no options are given: `slot: 'custom'`, `startMode: 'lazy'`, `lifetime: 'SINGLETON'`.

For a connector that doesn't fit one of the named slots (`database`/`cache`/`worker`/`asyncmq`/
`kvLocal`/`search`), you have two other options: reach it dynamically with
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

@Interactor()
class UsersInteractor extends ZanixInteractor {
  public findById(id: string) {
    return this.providers.get(UsersRepository).findById(id)
  }
}
```

Defaults when no options are given: `lifetime: 'SCOPED'`, `startMode: 'lazy'`.

## Reaching other dependencies (`this.providers`, `this.connectors`, `this.interactors`)

Providers and interactors expose dynamic getters for reaching **any** registered connector or
provider by class — the standard pattern for every dependency a provider or interactor needs,
whether it's the only one or one of several:

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

A string key (`this.providers.get('auth')`) resolves too, but only returns a precisely-typed result
if you've declared that key on your class's own `CoreModules` generic — see
[Typing a string-keyed `get` call](#typing-a-string-keyed-get-call) below; otherwise you get back
the loosely-typed base provider/connector type (still correct at runtime, just less specific).
String-key lookup only works for **core** slots (`cache`, `auth`, `asyncmq`, ...) — a custom
provider/connector you register yourself has no string key at all, only its class, unless you
register your own slot first (see [Registering your own core slot](#registering-your-own-core-slot)
below).

If you rewrite a core slot with your own implementation (`@Provider({ slot: 'cache' })` extending
`ZanixCacheProvider`), `this.providers.get('cache')` and `this.providers.get(YourCacheClass)`
resolve the exact same singleton instance — pick whichever reads better at the call site; neither
creates a second instance.

| Getter                    | Available on           | Resolves                                          |
| ------------------------- | ---------------------- | ------------------------------------------------- |
| `this.connectors.get(X)`  | Providers, Interactors | Any registered connector, by class or string key. |
| `this.providers.get(X)`   | Providers, Interactors | Any registered provider, by class or string key.  |
| `this.interactors.get(X)` | Interactors only       | Any registered interactor, by class.              |

## Typing a string-keyed `get` call

`this.providers.get('auth')`/`this.connectors.get('asyncmq')` resolve correctly at runtime
regardless of typing (or throw an explicit "missing core slot" error naming the slot and the package
expected to own it, if nothing registered it). To also get a _precisely-typed_ result back for a
string key — instead of the loosely-typed base provider/connector type — declare that key on the
`CoreModules` generic your class extends:

```ts
import type { ZanixAuthProvider } from '@zanix/auth'

class UsersInteractor extends ZanixInteractor<{ auth: ZanixAuthProvider }> {
  public async currentUserRole() {
    return this.providers.get('auth').session // typed as ZanixAuthProvider, not the generic base
  }
}
```

This works the same way for `ZanixProvider<T>`/`ZanixConnector<T>`. There is no ambient/global
mechanism for this (an earlier design tried `declare module` augmentation, but that doesn't reliably
carry a real per-key type across package boundaries, and JSR's `no-slow-types` publish check flags
ambient module augmentation reachable from a package's public surface) — an explicit generic on your
own class is the one reliable way to get full typing for a string key.

> ℹ️ These getters resolve within the **current request's context** automatically — you don't pass a
> context id yourself here (unlike the `ProgramModule` accessors below, which are for use _outside_
> a handler/interactor/provider instance and do require one).

## Registering your own core slot

`registerCoreProviderSlot`/`registerCoreConnectorSlot` let you give your **own** provider/connector
a string key — the same mechanism `@zanix/auth`, `@zanix/notifications`, and `@zanix/asyncmq` use
internally to register `'auth'`, `'notifications'`, and `'asyncmq'`. This is a two-step flow, and
the **order matters**:

```ts
import { Connector, registerCoreConnectorSlot, ZanixConnector } from 'jsr:@zanix/server@[version]'

// Step 1 — register the slot's contract, once, BEFORE any decorator references it.
export abstract class BillingConnector extends ZanixConnector {
  abstract charge(amount: number): Promise<void>
}
registerCoreConnectorSlot('billing', BillingConnector)

// Step 2 — decorate the concrete implementation, extending the contract above.
@Connector({ slot: 'billing' })
export class StripeConnector extends BillingConnector {
  protected override initialize() {}
  protected override close() {}
  public override isHealthy() {
    return true
  }
  public override async charge(amount: number) {
    // ...
  }
}
```

Once both steps have run, `this.connectors.get('billing')` and
`this.connectors.get(StripeConnector)` resolve the exact same singleton — same behavior as a
built-in core slot (see [Typing a string-keyed `get` call](#typing-a-string-keyed-get-call) to get a
precise return type back for the string form). `registerCoreProviderSlot` works identically for
`@Provider`.

> ⚠️ **`registerCore*Slot` must run before the `@Connector`/`@Provider` decorator for that slot is
> evaluated — not merely before you call `get()`.** A class decorator runs synchronously the instant
> its class is declared. If `registerCoreConnectorSlot('billing', ...)` is placed _after_ the
> `@Connector({ slot: 'billing' })` class in the same file (or otherwise executes later), the
> decorator doesn't see `'billing'` as a known slot yet and silently falls back to treating it as a
> plain custom connector, keyed by its own class instead of `'billing'`.
> `this.connectors.get(StripeConnector)` still works in that case, but
> `this.connectors.get('billing')` throws
> `Core connector slot "billing"
> is registered but no implementation was found for it in the current process`
> — the slot itself got registered, but no target was ever stored under that key. If you hit that
> error, check the order, not just presence, of the two calls. For a library package (not a single
> app), put the `registerCore*Slot` call in its own entrypoint (e.g. `your-package/core.ts`) that
> consumers import before anything that decorates against the slot — see `@zanix/auth`'s
> `auth/src/modules/providers/core.ts` for the reference pattern.

## Built-in connector and provider base classes

Instead of extending `ZanixConnector`/`ZanixProvider` directly, you can extend one of these
ready-made **abstract** base classes for common infrastructure. `@zanix/server` only ships the
abstractions below — a concrete, ready-to-use connector for a specific technology (MongoDB, Redis,
etc.) either comes from a companion Zanix package built on top of one of these bases (e.g.
`ZanixMongoConnector` from `@zanix/datamaster`, extending `ZanixDatabaseConnector`), or you write it
yourself, as shown in the `PostgresConnector` example below.

These are specifically the slots with a dedicated `this.xxx` getter on `CoreBaseClass` (`cache`,
`database`, `asyncmq`, `worker`, `kvLocal`, `search`) — hosting that getter's return-type signature
is what requires `@zanix/server` to import the abstract contract directly, so it's the only package
that can host it without creating a reverse dependency. Core slots _without_ a dedicated getter
(`auth`, `notifications`) have no such requirement, so their abstract contracts live with their
owning package instead: `@zanix/auth`'s `ZanixCoreAuthProvider` and `@zanix/notifications`'s
`ZanixCoreNotificationsProvider` — extend those directly from the owning package, not from
`@zanix/server`.

| Class                    | Extends          | Purpose                                                                              |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------ |
| `ZanixDatabaseConnector` | `ZanixConnector` | Foundation for relational/non-relational database connectors.                        |
| `ZanixAsyncmqConnector`  | `ZanixConnector` | Foundation for message broker connectors (RabbitMQ, Kafka, MQTT...).                 |
| `ZanixCacheConnector`    | `ZanixConnector` | Foundation for caching backends (Redis, Memcached, in-memory).                       |
| `ZanixKVConnector`       | `ZanixConnector` | Foundation for key-value store connectors, with optional TTL support.                |
| `RestClient`             | `ZanixConnector` | REST HTTP client with base URL resolution, JSON parsing, and unified error handling. |
| `GraphQLClient`          | `RestClient`     | Extends `RestClient` to simplify sending GraphQL queries over `POST`.                |
| `ZanixSearchConnector`   | `RestClient`     | Foundation for search/indexing engine connectors (Elasticsearch, OpenSearch...).     |
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

### `RestClient`'s `ETag` caching

`GET` requests are cached and revalidated through conditional `ETag`/`If-None-Match` by default — no
code change needed to benefit from it. The first `GET` to a URL that returns an `ETag` header caches
`{ etag, value }`; every later `GET` to that same URL sends `If-None-Match`, and a `304` reuses the
cached value instead of re-parsing a body:

```ts
class BillingClient extends RestClient {}

const client = new BillingClient({ baseUrl: 'https://billing.internal' })

await client.http.get('invoices/123') // caches the ETag, if the response sent one
await client.http.get('invoices/123') // sends If-None-Match; a 304 reuses the cached value
await client.http.get('invoices/123', { etag: false }) // opts this one call out
```

Disable it per client (`new BillingClient({ etag: false })`) or per call (`{ etag: false }` in a
request's options) when a `GET`'s response genuinely changes on every call. The cache key is scoped
by `protected etagIdentityHeaders` (default: the resolved `AUTH_HEADERS.user`/`AUTH_HEADERS.api`
header values) — so two different callers hitting the same URL with different credentials never
share a cached value; override it in a subclass to scope by additional/different headers.

### Presenting a client certificate (mTLS)

Pass a `Deno.HttpClient` via the constructor's `client` option to have every request from that
instance issued through it — e.g. one built with `Deno.createHttpClient({ cert, key })` to present a
client certificate:

```ts
const client = Deno.createHttpClient({ cert: myCert, key: myKey })

class SecureClient extends RestClient {}

const secureClient = new SecureClient({
  baseUrl: 'https://secure.internal',
  client,
})
```

This is passed straight through to `fetch()`'s own `client` option — not part of the standard
`RequestInit` shape, so `RestClient`'s options type declares it explicitly rather than relying on
the spread to carry it implicitly.

The cache itself is stored via the `'cache:local'` core connector slot when a package that owns it
(e.g. `@zanix/datamaster`) is registered, or an in-process `Map` otherwise — nothing to configure,
and no observable difference in behavior either way. If nothing is registered under that slot, this
falls back to the `Map` transparently; once a connector _is_ resolved, though, it's used as-is — a
`'cache:local'` connector whose own `get`/`set` throws will fail the request, same as any other
connector misbehaving inside a method it owns.

### `RestClient`'s unified error handling

Every failed call — a non-2xx upstream response or a genuine transport-level failure (DNS, timeout,
connection refused) — throws a `RestClientError`. `RestClient` has no domain knowledge of whose
fault a non-2xx response is, so it always defaults to `'BAD_GATEWAY'` as the honest status; the real
upstream status, when one exists, survives structured in `meta.upstreamStatus`/
`meta.upstreamStatusText` and is readable directly off the error via
`RestClientError.realHttpStatus` for whichever caller does have the context to reclassify it:

```ts
import { RestClientError } from 'jsr:@zanix/server@[version]'

try {
  await client.http.get('/users/1')
} catch (error) {
  if (error instanceof RestClientError && error.realHttpStatus === 404) {
    // the resource genuinely doesn't exist upstream — not "my dependency is down"
  }
}
```

### Restricting a `ZanixWorkerProvider`'s own permissions

`ZanixWorkerProvider`'s constructor takes an optional third argument, `permissions`, forwarded as-is
to the `WorkerManager` pool it builds internally — restricts what EVERY worker in THAT provider's
own pool may do (`net`/`read`/`write`/`env`/`run`/`ffi`/`sys`), independent of the host process's
own (broader) permission set. Since every task still needs `read`/`net` to import its own module
(see below), a useful restricted profile usually keeps `read` open and narrows the rest:

```ts
@Provider()
class SandboxedWorkerProvider extends ZanixWorkerProvider {
  constructor(contextId?: string) {
    super(contextId, 3, { net: false, write: false, env: false, run: false }) // `read` stays implicit-open
  }
  // ...
}
```

Fixed for the pool's entire lifetime — a subclass needing DIFFERENT permission profiles for
different tasks needs a SEPARATE `ZanixWorkerProvider` (and thus a separate DI slot/subclass) per
profile, never one shared pool. Omit entirely (the default) for unchanged, unrestricted behavior —
every existing subclass keeps working exactly as before this option existed.

**Requires Deno's still-unstable `worker-options` feature** (`"unstable": ["worker-options"]` in
`deno.jsonc`/`deno.json`, or `--unstable-worker-options`), and — since an object `permissions` value
replaces the _entire_ permission set rather than inheriting unlisted categories — the task's own
module needs `read` (or `net`, for a remote `metaUrl`) no matter what the task itself does, or every
task in that pool fails before it ever runs. See `@zanix/utils`' own `/workers` subpath
documentation for the full `permissions` shape and its honest limitation (access restriction only —
not a CPU/ memory quota).

### Dispatching background work: `dispatchWorkerTask`

`ZanixWorkerProvider.executeGeneralTask` (above) only helps once you already have a `'worker'`
provider instance resolved — which needs either a named getter (`this.worker`, only available from
inside a `ZanixProvider`/`ZanixConnector`/`ZanixInteractor`) or a manual DI lookup.
`dispatchWorkerTask` is a free function wrapping that same dispatch, usable from anywhere —
including a plain factory function with no `this` at all:

```ts
import { dispatchWorkerTask } from 'jsr:@zanix/server@[version]'

function myTask(payload: string) {
  return payload.toUpperCase()
}

const invoke = dispatchWorkerTask(myTask, {
  mode: 'persisted', // or 'one-time'
  metaUrl: import.meta.url,
  callback: ({ response, error }) => {
    if (error) console.error(error)
    else console.log(response)
  },
})

invoke('hello')
```

Two dispatch strategies, selected via `mode`:

- **`'one-time'`**: spins up a fresh, throwaway `WorkerManager` instance per call and closes it once
  the task finishes — no DI resolution, works identically inside or outside a booted application.
- **`'persisted'`**: reuses the app's `'worker'` core-provider pool
  (`ZanixWorkerProvider#executeGeneralTask`) instead of paying worker startup cost on every call.
  Falls back to `'one-time'` behavior automatically — silently, regardless of `verbose` — when that
  provider can't be resolved (e.g. outside a booted Zanix Core application, or no `'worker'` slot
  implementation registered), so it's always safe to request regardless of runtime.

Calling from inside a class that already has `this.worker` available (correctly scoped to that
instance's own `contextId`)? Pass `provider: () => this.worker` instead of letting
`dispatchWorkerTask` do a second, unscoped global lookup — **as a function, not the resolved value
itself**: `this.worker` throws synchronously when no `'worker'` provider is registered, so passing
`this.worker` directly would throw while building this options object, before `dispatchWorkerTask`
ever runs, escaping the very fallback that's supposed to catch exactly that case:

```ts
@Provider()
class MyProvider extends ZanixWorkerProvider {
  send(payload: string) {
    return dispatchWorkerTask(myTask, {
      mode: 'persisted',
      metaUrl: import.meta.url,
      provider: () => this.worker,
    })(payload)
  }
}
```

`verbose` (forwarded to whichever underlying dispatch runs) controls only the `WorkerManager` task's
own error logging — set it `false` when `callback` already reports failures itself, to avoid
double-logging. It's unrelated to, and never affects, `'persisted'`'s silent fallback to
`'one-time'`. `dispatchWorkerTask` returns a bound `invoke` function rather than a `Promise` — wrap
it in `new Promise((resolve) => { ... options.callback = () => resolve() ... })` yourself when the
caller needs to await completion.

## Accessing instances outside any class (`ProgramModule`)

The getters above (`this.cache`, `this.providers.get(...)`, etc.) only work from within a provider,
interactor, or handler instance. For the rarer case where you need an instance from somewhere with
no `this` at all — a standalone script, a test, or a custom middleware function — `ProgramModule`
exposes the same accessors directly:

```ts
import { ProgramModule } from 'jsr:@zanix/server@[version]'

const provider = ProgramModule.getProviders().get(NotificationsProvider)
const connector = ProgramModule.getConnectors('some-context-id').get(
  DatabaseConnector,
)
const interactor = ProgramModule.getInteractors('some-context-id').get(
  UsersInteractor,
)

// Shorthand for the common case: no context needed (SINGLETON providers/connectors ignore
// ctxId anyway, which covers everything except SCOPED/TRANSIENT lookups)
const sameProvider = ProgramModule.providers.get(NotificationsProvider)
const sameConnector = ProgramModule.connectors.get(DatabaseConnector)
```

| Method                            | Signature                                           | Notes                                                                                                                  |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `getProviders(ctxId?, verbose?)`  | returns `{ get(ProviderClass \| CoreProviders) }`   | `ctxId` is optional; omitted retrieves globally.                                                                       |
| `getConnectors(ctxId?, verbose?)` | returns `{ get(ConnectorClass \| CoreConnectors) }` | `ctxId` is optional; omitted retrieves globally.                                                                       |
| `getInteractors(ctxId, verbose?)` | returns `{ get(InteractorClass) }`                  | `ctxId` is **required** for interactors.                                                                               |
| `providers`                       | returns `{ get(ProviderClass \| CoreProviders) }`   | Shorthand for `getProviders()` with no `ctxId`.                                                                        |
| `connectors`                      | returns `{ get(ConnectorClass \| CoreConnectors) }` | Shorthand for `getConnectors()` with no `ctxId`.                                                                       |
| `registry`                        | `RegistryContainer`                                 | The underlying DI metadata registry.                                                                                   |
| `asyncContext`                    | `AsyncContext`                                      | The `AsyncLocalStorage` wrapper used for per-request context (see `enableALS` in [Handlers](./handlers.md#enableals)). |

There's no `interactors` shorthand: `getInteractors` requires a `ctxId` (interactors default to
`SCOPED` lifetime, so there's no context-free "global" instance to shortcut to).

> ⚠️ Use these accessors carefully: bypassing the normal injection flow can break lifecycle rules
> (e.g. `SCOPED`/`TRANSIENT` semantics) or lead to unintended singleton/multi-instance behavior.
> Prefer framework-managed injection (`@Interactor`, `@Controller({ Interactor })`, etc.) whenever
> possible.

## See also

- [Handlers](./handlers.md) — how to inject an `Interactor` into a controller, resolver, or socket.
- [Configuration](./configuration.md) — default ports and other constants.
- [Error Handling](./errors.md) — errors raised when a dependency can't be resolved.
