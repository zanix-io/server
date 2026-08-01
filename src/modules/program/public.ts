import type { CoreConnectors, CoreProviders } from 'typings/program.ts'
import type { RegistryContainer } from './metadata/registry.ts'
import type { ZanixConnector } from 'connectors/base.ts'
import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { DiscoveryProvider } from 'typings/discovery.ts'
import type { MiddlewareGuard } from 'typings/middlewares.ts'
import type {
  ZanixConnectorClass,
  ZanixConnectorsGetter,
  ZanixInteractorClass,
  ZanixInteractorGeneric,
  ZanixInteractorsGetter,
  ZanixProviderClass,
  ZanixProviderGeneric,
  ZanixProvidersGetter,
} from 'typings/targets.ts'

import { type AsyncContext, asyncContext } from 'modules/infra/base/storage.ts'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from './mod.ts'

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
   * @returns {ZanixProvidersGetter} An object with a `get` method that retrieves the requested provider.
   *
   * @example
   * const providers = getProviders('myContextId');
   * const provider = providers.get(MyProviderClass);
   */
  public getProviders(
    ctxId?: string,
    verbose?: boolean,
    caller?: TargetBaseClass,
  ): ZanixProvidersGetter {
    return {
      get: <D extends ZanixProviderGeneric>(
        Provider: ZanixProviderClass<D> | CoreProviders,
      ): D => {
        const key = typeof Provider === 'string' ? Provider : getTargetKey(Provider)
        return ProgramModule.targets.getProvider<D>(key, { contextId: ctxId, verbose, caller })
      },
    }
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
   * @returns {ZanixConnectorsGetter} An object with a `get` method that retrieves the requested connector.
   *
   * @example
   * const connectors = getConnectors('myContextId');
   * const connector = connectors.get(MyConnectorClass);
   */
  public getConnectors(
    ctxId?: string,
    verbose?: boolean,
    caller?: TargetBaseClass,
  ): ZanixConnectorsGetter {
    return {
      get: <D extends ZanixConnector>(
        Connector: ZanixConnectorClass<D> | CoreConnectors,
      ): D => {
        const key = typeof Connector === 'string' ? Connector : getTargetKey(Connector)
        return ProgramModule.targets.getConnector<D>(key, { contextId: ctxId, verbose, caller })
      },
    }
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
  public get providers(): ZanixProvidersGetter {
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
  public get connectors(): ZanixConnectorsGetter {
    return this.getConnectors()
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
   * Runs `setup` with `name` as the Application (see `docs/HANDLERS.md`'s "Applications" section)
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
  public defineApplication(name: string, setup: () => void | Promise<void>): Promise<void> {
    return ProgramModule.applications.define(name, setup)
  }

  /**
   * Registers `provider` as the read-only source of truth for `resourceType`, exposed under
   * `/.well-known/zanix/{resourceType}` once a REST server for the current Application activates
   * (see `docs/HANDLERS.md`'s "Discovery" section). Attributed to whichever `defineApplication(...)`
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
    ProgramModule.discovery.define(application, resourceType, {
      provider,
      guards: options.guards ?? [],
    })
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
