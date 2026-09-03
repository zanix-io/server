import type { CoreConnectors, CoreProviders } from 'typings/program.ts'
import type { RegistryContainer } from './metadata/registry.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { DiscoveryProvider } from 'typings/discovery.ts'
import type { MiddlewareGuard } from 'typings/middlewares.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { ZanixRoutesGetter } from 'typings/router.ts'
import type {
  ClassConstructor,
  CoreModules,
  ZanixConnectorClass,
  ZanixConnectorsGetter,
  ZanixInteractorClass,
  ZanixInteractorGeneric,
  ZanixInteractorsGetter,
  ZanixProviderClass,
  ZanixProvidersGetter,
} from 'typings/targets.ts'

import { type AsyncContext, asyncContext } from 'modules/infra/base/storage.ts'
import { getTargetKey } from 'utils/targets.ts'
import { getCoreProviderSlot, resolveCoreProviderTargetAlias } from 'providers/core/all.ts'
import { getCoreConnectorSlot, resolveCoreConnectorTargetAlias } from 'connectors/core/all.ts'
import { InternalError } from '@zanix/errors'
import ProgramModule from './mod.ts'

/**
 * Composes the explicit "missing core slot" error described in the ADR for this mechanism
 * (`registerCoreProviderSlot`/`registerCoreConnectorSlot`, see `providers/core/all.ts`): naming
 * the slot and, when known, the package expected to register it — never a generic "not found".
 * Two distinct failure modes: the slot itself was never registered (its owning `/core` module
 * likely wasn't imported), or it was registered but resolving an actual instance still failed
 * (registered, but no concrete implementation was ever instantiated for it in this process).
 */
function missingCoreSlotError(
  kind: 'provider' | 'connector',
  key: string,
  slot: { sourcePackage?: string } | undefined,
  verbose?: boolean,
  cause?: unknown,
): InternalError {
  const hint = slot?.sourcePackage
    ? ` Did you forget to import "${slot.sourcePackage}"?`
    : ' Check that the package owning this capability was imported.'

  const message = slot
    ? `Core ${kind} slot "${key}" is registered but no implementation was found for it in the ` +
      `current process.${hint}`
    : `Missing core ${kind} slot "${key}". No provider was registered for this slot.${hint}`

  return new InternalError(message, {
    meta: {
      source: 'zanix',
      slot: key,
      kind,
      sourcePackage: slot?.sourcePackage,
    },
    cause,
    shouldLog: !!verbose,
  })
}

/**
 * Narrows a caught resolution error down to specifically "no target was ever registered for this
 * key" (see `BaseInstancesContainer.getInstance`'s own `targetName` fallback string,
 * `modules/program/metadata/targets/instances.ts`) — as opposed to any other failure (a real bug
 * inside an already-resolved provider/connector's own constructor, for instance). Only the former
 * should be reworded into the friendlier "missing core slot" message; anything else must propagate
 * unchanged so a real error is never masked behind a misleading "did you forget to import" hint.
 */
function isUnresolvedTargetError(e: unknown): boolean {
  const meta = (e as { meta?: { targetName?: string } })?.meta
  return typeof meta?.targetName === 'string' &&
    meta.targetName.includes('unknown')
}

/**
 * Represents the main program interface that can be exported and used by other libraries.
 *
 * This class is intended to provide reusable functionality and act as a shared program module.
 *
 * @exports Program
 */

export class Program {
  /**
   * AsyncLocalStorage instance that manages a context shared across
   * asynchronous operations within the same request or logical scope.
   *
   * This allows you to store and retrieve contextual information
   * (such as request IDs, tenant info, or user session data)
   * without explicitly passing it through function parameters.
   *
   * @example
   * // Initialize context at the start of a request
   * asyncContext.run({ id: 'abc123' }, async () => {
   *   // Later, anywhere in async code:
   *   console.log(asyncContext.getStore()?.id); // 'abc123'
   * });
   *
   * @type {AsyncContext}
   */
  public asyncContext: AsyncContext = asyncContext

  /**
   * Retrieves a provider from the `ProgramModule` based on the provided context ID.
   *
   * This function creates an object with a `get` method that allows fetching a provider using either
   * a class type (`ZanixProviderClass<D>`) or a string identifier (`CoreProviders`). The `get` method
   * returns the provider associated with the provided key.
   * If a context ID (`ctxId`) is provided, it is passed to the `getProvider` method to scope the provider retrieval.
   *
   * @warning ⚠️ **Important: Use this accessor carefully.**
   * Misusing direct provider retrieval can break dependency injection patterns, bypass lifecycle rules,
   * or lead to unintended singleton/multi-instance behaviors.
   * Prefer relying on framework-managed injection whenever possible.
   *
   * @param {string} [ctxId] - An optional context ID to specify the scope or context of the provider. If not provided,
   *                            the provider is retrieved globally.
   * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `true`
   *
   * @returns {ZanixProvidersGetter<T>} An object with a `get` method that retrieves the requested
   * provider — pass `T` explicitly (the same `CoreModules` map given to the calling
   * `ZanixInteractor`/`ZanixProvider`/`ZanixConnector`) to get a precise return type back for a
   * string key; a class reference is always precisely typed regardless of `T`.
   *
   * For a *core* slot (`cache`, `auth`, `asyncmq`, ...), both forms resolve the identical
   * singleton: `get('cache')` and `get(Target)` — where `Target` is whatever class a package (or
   * a consumer rewriting that slot) decorated with `@Provider({ type: 'cache' })` — are aliases
   * of the same cached instance, never two separate ones. This only holds for a class actually
   * decorated for that slot; a plain reference to the slot's abstract contract type resolves
   * nothing (it isn't itself a registered target).
   *
   * @example
   * const providers = getProviders('myContextId');
   * const provider = providers.get(MyProviderClass);
   */
  public getProviders<T extends CoreModules = object>(
    ctxId?: string,
    verbose?: boolean,
    caller?: TargetBaseClass,
  ): ZanixProvidersGetter<T> {
    const get = (Provider: ZanixProviderClass | CoreProviders) => {
      if (typeof Provider !== 'string') {
        // A class that was decorated for a core slot (e.g. a consumer's own `@Provider({ type:
        // 'cache' })` rewrite) resolves through its slot's canonical string key here, so it
        // shares the exact same cached singleton as `get('cache')` — see
        // `resolveCoreProviderTargetAlias`'s doc (`providers/core/all.ts`). Any other class (the
        // common case) has no alias and resolves under its own class-derived key, unchanged.
        const targetKey = getTargetKey(Provider)
        const key = resolveCoreProviderTargetAlias(targetKey) ?? targetKey
        return ProgramModule.targets.getProvider(key, {
          contextId: ctxId,
          verbose,
          caller,
        })
      }

      // No eager `getCoreProviderSlot` pre-check here — that registry only ever knows about the
      // 5 REGISTERED core slots, but `key` may just as validly be a custom `slot` string a plain
      // `@Provider({ slot })` chose (see that decorator's own doc) with no such pre-declaration
      // at all: the first `defineTarget` call under that string IS its registration. Attempting
      // the real lookup directly, and consulting `getCoreProviderSlot` only to enrich the error
      // when it genuinely fails, covers both a core AND a custom slot with the identical
      // "resolved, or a clear reason why not" behavior — `getInstance`'s own `targetName:
      // "'unknown': ..."` shape (`isUnresolvedTargetError`) fires identically whether `key` was
      // never registered as ANY kind of target at all.
      const key = Provider

      try {
        return ProgramModule.targets.getProvider(key, {
          contextId: ctxId,
          verbose,
          caller,
        })
      } catch (e) {
        if (isUnresolvedTargetError(e)) {
          throw missingCoreSlotError('provider', key, getCoreProviderSlot(key), verbose, e)
        }
        throw e
      }
    }

    return { get } as unknown as ZanixProvidersGetter<T>
  }

  /**
   * Retrieves a connector from the `ProgramModule` based on the provided context ID.
   *
   * This function creates an object with a `get` method that allows fetching a connector using either
   * a class type (`ZanixConnectorClass<D>`) or a string identifier (`CoreConnectors`). The `get` method
   * returns the connector associated with the provided key.
   * If a context ID (`ctxId`) is provided, it is passed to the `getConnector` method to scope the connector retrieval.
   *
   * @warning ⚠️ **Important: Use this accessor carefully.**
   * Misusing direct provider retrieval can break dependency injection patterns, bypass lifecycle rules,
   * or lead to unintended singleton/multi-instance behaviors.
   * Prefer relying on framework-managed injection whenever possible.
   *
   * @param {string} [ctxId] - An optional context ID to specify the scope or context of the connector. If not provided,
   *                            the connector is retrieved globally.
   * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `true`
   *
   * @returns {ZanixConnectorsGetter<T>} An object with a `get` method that retrieves the requested
   * connector — same `T` reasoning as {@link getProviders}.
   *
   * @example
   * const connectors = getConnectors('myContextId');
   * const connector = connectors.get(MyConnectorClass);
   */
  public getConnectors<T extends CoreModules = object>(
    ctxId?: string,
    verbose?: boolean,
    caller?: TargetBaseClass,
  ): ZanixConnectorsGetter<T> {
    const get = (Connector: ZanixConnectorClass | CoreConnectors) => {
      if (typeof Connector !== 'string') {
        // See the matching branch in `getProviders` above — same reasoning, connector side.
        const targetKey = getTargetKey(Connector)
        const key = resolveCoreConnectorTargetAlias(targetKey) ?? targetKey
        return ProgramModule.targets.getConnector(key, {
          contextId: ctxId,
          verbose,
          caller,
        })
      }

      const key = Connector
      const slot = getCoreConnectorSlot(key)
      if (!slot) {
        throw missingCoreSlotError('connector', key, undefined, verbose)
      }

      try {
        return ProgramModule.targets.getConnector(key, {
          contextId: ctxId,
          verbose,
          caller,
        })
      } catch (e) {
        if (isUnresolvedTargetError(e)) {
          throw missingCoreSlotError('connector', key, slot, verbose, e)
        }
        throw e
      }
    }

    return { get } as unknown as ZanixConnectorsGetter<T>
  }

  /**
   * Retrieves a interactor from the `ProgramModule` based on the provided context ID.
   *
   * This function creates an object with a `get` method that allows fetching a interactor using either
   * a class type (`ZanixInteractorClass<T>`). The `get` method returns the interactor associated with the provided key.
   * If a context ID (`ctxId`) is provided, it is passed to the `getInteractor` method to scope the interactor retrieval.
   *
   * @warning ⚠️ **Important: Use this accessor carefully.**
   * Misusing direct provider retrieval can break dependency injection patterns, bypass lifecycle rules,
   * or lead to unintended singleton/multi-instance behaviors.
   * Prefer relying on framework-managed injection whenever possible.
   *
   * @param {string} [ctxId] - A context ID to specify the scope or context of the interactor. If not provided,
   *                            the interactor is retrieved globally.
   * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `true`
   *
   * @returns {ZanixInteractorsGetter} An object with a `get` method that retrieves the requested interactor.
   *
   * @example
   * const interactors = getInteractors('myInteractorCtxId');
   * const interactor = interactors.get(MyInteractorClass);
   */
  public getInteractors: (
    ctxId: string,
    verbose?: boolean,
    caller?: TargetBaseClass,
  ) => ZanixInteractorsGetter = (
    ctxId,
    verbose,
    caller,
  ) => ({
    get: <T extends ZanixInteractorGeneric>(
      Interactor: ZanixInteractorClass<T>,
    ): T =>
      ProgramModule.targets.getInteractor<T>(getTargetKey(Interactor), {
        contextId: ctxId,
        verbose,
        caller,
      }),
  })

  /**
   * Shorthand for {@link getProviders} called with no `ctxId` — resolves globally, which is all
   * that `SINGLETON`-lifetime providers (the default for `@Provider`) ever need, since `ctxId` is
   * ignored for them regardless. Prefer {@link getProviders} directly when you do need to scope
   * the lookup to a specific context (e.g. a `SCOPED` provider).
   *
   * @example
   * const provider = ProgramModule.providers.get(MyProviderClass);
   */
  public get providers(): ZanixProvidersGetter<object> {
    return this.getProviders()
  }

  /**
   * Shorthand for {@link getConnectors} called with no `ctxId` — resolves globally, which is all
   * that `SINGLETON`-lifetime connectors (the default for `@Connector`) ever need, since `ctxId`
   * is ignored for them regardless. Prefer {@link getConnectors} directly when you do need to
   * scope the lookup to a specific context.
   *
   * @example
   * const connector = ProgramModule.connectors.get(MyConnectorClass);
   */
  public get connectors(): ZanixConnectorsGetter<object> {
    return this.getConnectors()
  }

  /**
   * Read-only introspection over persisted route metadata — the same static metadata a route
   * decorator (`@Controller`/`@SsrController`/`@Resolver`) wrote at registration time. Never
   * mutates anything, and reflects composition-time state only: safe to call before, during, or
   * after a real boot, including from a process that only composed metadata (e.g. `@zanix/core`'s
   * `Zanix.compose()`) and never actually started a server — the intended use case for a static
   * analysis tool (e.g. an OpenAPI generator) that needs to read what routes exist without being
   * able to invoke anything.
   *
   * Also exposes `hasRoutesForTarget(Target, type?)`, a plain existence check — see
   * {@link ZanixRoutesGetter}'s own doc.
   *
   * @example
   * const routes = ProgramModule.routes.getRoutes('rest')
   * for (const [key, route] of Object.entries(routes ?? {})) {
   *   console.log(route.path, route.httpMethod, route.rto)
   * }
   */
  public get routes(): ZanixRoutesGetter {
    return {
      getRoutes: (type) => ProgramModule.routes.getRoutes(type),
      hasRoutesForTarget: (Target, type) => ProgramModule.routes.hasRoutesForTarget(Target, type),
    }
  }

  /**
   * Provides access to the internal `RegistryContainer` used by the dependency
   * injection system.
   *
   * This getter exposes the metadata registry responsible for storing DI-related
   * information such as provider definitions, constructor metadata, parameter
   * injection tokens, lifecycle annotations, and other reflection-based data
   * required by the framework to resolve dependencies at runtime.
   *
   * The `RegistryContainer` acts as the backbone of the DI mechanism, allowing
   * the framework to:
   * - Resolve providers and their dependencies
   * - Track scoped or contextual instances
   * - Store metadata generated by decorators (@Inject, @Provider, etc.)
   * - Support advanced DI features such as multi-providers or contextual injection
   *
   * @protected
   * @returns {RegistryContainer} The DI metadata registry maintained by the `ProgramModule`.
   */
  public get registry(): RegistryContainer {
    return ProgramModule.registry
  }

  /**
   * Runs `setup` with `name` as the Application (see `docs/applications.md`'s "Applications" section)
   * that every route/resolver/socket registered inside it (via `@Controller`/`@Resolver`/`@Socket`)
   * belongs to — composition-time only, resolved once per capability at the instant it registers
   * and persisted onto its own metadata as an ordinary field; never consulted again once a server
   * actually activates. Nestable: a `defineApplication` call inside another's `setup` temporarily
   * overrides the ambient Application for its own duration, then reverts.
   *
   * Intended for first-party framework composition code (`@zanix/core`'s `main`/`admin` wiring,
   * `@zanix/admin`'s own standalone bootstrap) — not yet a documented, stable API for arbitrary
   * third-party plugin packages to author their own installable Applications.
   *
   * @example
   * await ProgramModule.defineApplication('admin', () => {
   *   createTriggersAdminController()
   * })
   */
  public defineApplication(
    name: string,
    setup: () => void | Promise<void>,
  ): Promise<void> {
    return ProgramModule.applications.define(name, setup)
  }

  /**
   * Registers `provider` as the read-only source of truth for `resourceType`, exposed under
   * `/.well-known/zanix/{resourceType}` once a REST server for the current Application activates
   * (see `docs/applications.md`'s "Discovery" section). Attributed to whichever `defineApplication(...)`
   * scope is active the instant this call runs, the same way `RouteContainer.defineRoute` resolves
   * a route's Application — call it inside the same scope as the routes/controllers it accompanies.
   *
   * `resourceType` is supplied here, not on the provider itself — the same reason a `@Controller`'s
   * `prefix` is supplied at the decoration site rather than baked into the underlying business
   * class: the provider only knows how to fetch its data, never how it's addressed externally.
   *
   * A plain, re-callable function rather than a decorator or cached side-effect import,
   * deliberately: the discovery registry is wiped at the end of every finalized boot sequence (the
   * same reason `@zanix/admin`'s own `defineAdminMetadata()` has to be one) — a process that boots
   * more than once needs this to genuinely re-run each time, not resolve an already-evaluated ES
   * module namespace.
   *
   * `@zanix/server` has no built-in notion of permissions/roles/tokens — that's `@zanix/auth`, a
   * separate package this one doesn't depend on — so `options.guards`, if given, are forwarded
   * as-is to the underlying route (the same generic `MiddlewareGuard` mechanism any other route
   * already uses); **omitting them leaves the endpoint unauthenticated**, not implicitly protected.
   *
   * @example
   * await ProgramModule.defineApplication('admin', () => {
   *   ProgramModule.defineDiscovery('templates', createTemplatesDiscoveryProvider())
   * })
   */
  public defineDiscovery(
    resourceType: string,
    provider: DiscoveryProvider<unknown>,
    options: { guards?: MiddlewareGuard[] } = {},
  ): void {
    const application = ProgramModule.applications.getCurrent()
    ProgramModule.sessions.recordApplication(application)
    ProgramModule.discovery.define(application, resourceType, {
      provider,
      guards: options.guards ?? [],
    })
  }

  /**
   * Removes every route previously registered for `Target` — across every server type, or only
   * `type` if given. `Target` is the exact class reference a route decorator
   * (`@Controller`/`@SsrController`/`@Resolver`/`@Socket`) ran against; routes registered through
   * the raw `{path, handler}` object form are never matched, since there's no class identity to
   * compare against.
   *
   * This exists for lazy re-registration flows that run OUTSIDE the ordinary boot cycle — the
   * motivating case is a dev-server that reimports a decorated class as a fresh module instance
   * after a file change: re-running its route decorator would otherwise collide with the
   * still-registered previous instance ("Route path ... is already defined"). Call this first,
   * against the OLD class reference, before reimporting.
   *
   * Not part of ordinary application composition — a route decorator already registers its own
   * class once, correctly, the first time; this is only for undoing that registration on purpose.
   *
   * @returns The number of route entries removed (`0` if `Target` had none registered).
   *
   * @example
   * const removed = ProgramModule.unregisterRoutes(PreviousPageModule.default)
   * const fresh = await import(`${pageFile}?t=${Date.now()}`)
   */
  public unregisterRoutes(
    Target: ClassConstructor,
    type?: WebServerTypes,
  ): number {
    return ProgramModule.routes.removeRoutesForTarget(Target, type)
  }

  /**
   * Removes every route registered under `application` — across every server type. Unlike
   * `unregisterRoutes` (keyed by decorated class), this is keyed by Application name, for
   * hot-uninstalling one Zanix App's whole route surface while every other Application (host or
   * sibling app) keeps serving unaffected — see `RouteContainer.removeRoutesForApplication`'s own
   * doc for why this is safer to call than `resetExceptApplications` when the caller only knows
   * ONE Application's own name.
   *
   * This only updates route metadata — an already-bound `Deno.serve()` listener keeps dispatching
   * to its own compiled route table until `WebServerManager.unmount()` also drops that
   * Application's live dispatch entry.
   *
   * @returns The number of route entries removed (`0` if `application` had none registered).
   */
  public unregisterApplicationRoutes(application: string): number {
    return ProgramModule.routes.removeRoutesForApplication(application)
  }

  /**
   * Runs `setup` (typically a whole top-level `start()`/`bootstrap()` sequence — e.g. every
   * `defineApplication`/`bootstrapServers()` call it makes) under one shared "boot session" (see
   * `BootSessionContainer`), so `finalize` cleanup at the end of that sequence's own last
   * `bootstrapServers()` call preserves whichever Applications an independent,
   * temporally-overlapping sequence (e.g. `Zanix.start()` and `ZanixAdminHub.start()` fired
   * without an `await` between them) currently owns, never wiping its not-yet-served
   * routes/discovery/resolvers — while still being free to sweep every Application THIS sequence
   * itself touched, even ones an earlier call in the SAME sequence registered but never itself
   * served. `bootstrapServers()` already wraps its own body in this, so a bare call gets a
   * session of its own; wrapping a WIDER multi-call sequence in one outer call here is what lets
   * every `bootstrapServers()` call nested inside share that one session instead of forking its own.
   * Nesting is safe and cheap: an inner `runBootSession` call while one is already active just
   * reuses the ambient session unchanged.
   *
   * @example
   * await ProgramModule.runBootSession(async () => {
   *   await defineAdminMetadata()
   *   await bootstrapServers(adminOptions, { finalize: false })
   *   await bootstrapServers(mainOptions) // last call — finalizes the whole session
   * })
   */
  public runBootSession<R>(setup: () => R | Promise<R>): Promise<R> {
    return ProgramModule.sessions.runSession(setup)
  }
}

/**
 * A frozen singleton instance of the `Program`,
 * to provide reusable functionality and act as a shared program module.
 *
 * @type {Readonly<Program>}
 */
const PublicProgramModule: Readonly<Program> = Object.freeze(new Program())

export const getConnectors = PublicProgramModule.getConnectors
export const getProviders = PublicProgramModule.getProviders
export const getInteractors = PublicProgramModule.getInteractors

export default PublicProgramModule
