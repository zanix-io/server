import type { MiddlewareGuard, MiddlewareInterceptor } from './middlewares.ts'

/**
 * A read-only source of truth for one resource kind (e.g. templates, triggers), exposed under
 * `/.well-known/zanix/{resourceType}` — see `docs/applications.md`'s "Discovery" section. Deliberately
 * has no knowledge of HTTP, versioning, pagination, or auth: a module implementing this only
 * answers "what do I currently have," never how that gets addressed or transported.
 *
 * `resourceType` isn't a field here on purpose — it's supplied at the registration site
 * (`defineDiscovery(resourceType, provider)`), the same way a `@Controller`'s `prefix` is supplied
 * at the decoration site rather than baked into the underlying business class.
 */
export interface DiscoveryProvider<T> {
  /**
   * Full materialization of the resource's current state. Fine for resources confirmed to stay
   * small (dozens–low thousands of items) — large/unbounded resources are an explicitly deferred
   * capability (`stream()`), not designed yet; see `docs/applications.md`.
   */
  snapshot(): Promise<T[]>

  /**
   * Optional. The cheapest possible way to answer "has anything changed since I last asked" — a
   * row count + hash, a monotonic counter, `max(updatedAt)`, etc. Lets the discovery mount skip
   * calling `snapshot()` again when nothing changed. Never load-bearing for correctness — a
   * provider with no cheap way to compute one still works correctly, just without that
   * optimization; the consistency of `snapshot()` itself is entirely the provider's own
   * responsibility (a DB transaction, snapshot isolation, or any other internal mechanism).
   */
  version?(): Promise<string | number> | string | number
}

/**
 * The transport-agnostic resolution of one `defineDiscovery(resourceType, ...)` registration —
 * facts that would hold regardless of which transport eventually exposes the resource (HTTP today,
 * potentially an event bus later). Never HTTP-specific — see `DiscoveryHttpRuntime` for that layer.
 */
export interface DiscoveryContract {
  resourceType: string
  protocolVersion: number
}

/** What `defineDiscovery` actually stores per `(application, resourceType)` — see its own doc. */
export interface DiscoveryRegistration {
  provider: DiscoveryProvider<unknown>
  guards: MiddlewareGuard[]
}

/**
 * The HTTP-specific resolution of a `DiscoveryContract` — everything the HTTP mount needs that a
 * hypothetical non-HTTP transport wouldn't.
 *
 * `guards` are whatever the registering module supplied via `defineDiscovery`'s own options (e.g.
 * built from `@zanix/auth`'s `AuthTokenValidation`), plus the discovery protocol-version guard
 * appended last — `@zanix/server` has no built-in notion of permissions/roles/tokens of its own
 * (that's `@zanix/auth`, a separate package this one doesn't depend on), so it never invents an
 * auth policy here; it only forwards whatever guard functions it was given, the same way any other
 * route already can. **Discovery endpoints are unauthenticated by default if the registering
 * module supplies no guards** — this is the caller's responsibility, not something `@zanix/server`
 * enforces silently.
 *
 * `interceptors` stamps the negotiated `DISCOVERY_PROTOCOL_HEADER` onto the response — reusing
 * `createProtocolVersionInterceptor`, the same mechanism `/admin/*`'s `versionProtocol` option
 * already uses internally, just with Discovery's own header/version constants instead of admin's.
 */
export interface DiscoveryHttpRuntime {
  path: string
  guards: MiddlewareGuard[]
  interceptors: MiddlewareInterceptor[]
}
