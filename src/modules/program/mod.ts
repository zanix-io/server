import type { ModuleTypes, StartMode } from 'typings/program.ts'

import { MiddlewaresContainer } from './metadata/middlewares.ts'
import { DecoratorsContainer } from './metadata/decorators.ts'
import { RouteContainer } from './metadata/routes.ts'
import { TargetContainer } from './metadata/targets/main.ts'
import { ContextContainer } from 'modules/program/metadata/context.ts'
import { HANDLER_METADATA_PROPERTY_KEY } from 'utils/constants.ts'
import { RegistryContainer } from './metadata/registry.ts'
import { ApplicationContainer } from './metadata/application.ts'
import { DiscoveryContainer } from './metadata/discovery.ts'
import { BootSessionContainer } from './metadata/session.ts'

/**
 * Class that manages containers for middlewares, targets, routes, decorators, and context.
 * Provides methods for cleaning up metadata stored in these containers.
 */
export class InternalProgram {
  /**
   * Middleware container that handles middleware functions.
   * @type {MiddlewaresContainer}
   */
  public middlewares: MiddlewaresContainer = new MiddlewaresContainer()

  /**
   * Target container that stores the targets (destinations).
   * @type {TargetContainer}
   */
  public targets: TargetContainer = new TargetContainer()

  /**
   * Application container resolving which Application (composition boundary — see
   * `docs/HANDLERS.md`) a capability being registered right now belongs to.
   * @type {ApplicationContainer}
   */
  public applications: ApplicationContainer = new ApplicationContainer()

  /**
   * Boot-session container resolving which top-level `bootstrapServers()`-driven sequence a
   * capability being registered right now belongs to — see its own doc. Declared before `routes` so
   * it's available for injection there.
   * @type {BootSessionContainer}
   */
  public sessions: BootSessionContainer = new BootSessionContainer()

  /**
   * Route container that interacts with middlewares and targets.
   * @type {RouteContainer}
   */
  public routes: RouteContainer = new RouteContainer(
    this.middlewares,
    this.targets,
    this.applications,
    this.sessions,
  )

  /**
   * Decorator container that handles custom decorators.
   * @type {DecoratorsContainer}
   */
  public decorators: DecoratorsContainer = new DecoratorsContainer()

  /**
   * Context container that manages the overall application context.
   * @type {ContextContainer}
   */
  public context: ContextContainer = new ContextContainer()

  /**
   * Decorator container that handles custom registry.
   * @type {RegistryContainer}
   */
  public registry: RegistryContainer = new RegistryContainer()

  /**
   * Registry of `DiscoveryProvider`s (see `docs/HANDLERS.md`'s "Discovery" section) — read-only
   * `/.well-known/zanix/{resourceType}` snapshots, one bucket per Application.
   * @type {DiscoveryContainer}
   */
  public discovery: DiscoveryContainer = new DiscoveryContainer()

  /**
   * Method to clean up metadata stored in containers for initializations.
   * Resets the containers for routes, middlewares, decorators, and targets.
   *
   * @param mode The initialization phase whose metadata should be cleaned up.
   * @param finalize Defaults to `true`. For `mode: 'postBoot'`, gates `type:resolver` (the
   * pending-GraphQL-resolvers registry), the route registry, and the discovery-provider registry.
   * For `mode: 'onBoot'`, gates the global middlewares/decorators registries. All of these are each
   * read by *every* `bootstrapServers()` call in a multi-call boot sequence (e.g. an internal admin
   * server followed by a public one) — they must only be purged once the whole sequence is done,
   * which only the caller knows. Pass `false` for every call except the last one in such a
   * sequence. `type:connector` is intentionally never purged here at all — see
   * `closeAllConnections`, which clears it once actually done with it, at process shutdown rather
   * than at boot completion.
   */
  public cleanupInitializationsMetadata(
    mode: Extract<StartMode, 'postBoot' | 'onBoot'>,
    finalize: boolean = true,
  ): void {
    if (mode === 'postBoot') {
      /** Clean metadata postBoot */
      const removeTargets: (`${ModuleTypes}:startMode:${StartMode}`)[] = [
        'provider:startMode:postBoot',
        'connector:startMode:postBoot',
        'interactor:startMode:postBoot',
        'provider:startMode:onBoot',
        'connector:startMode:onBoot',
        'interactor:startMode:onBoot',
        'provider:startMode:onSetup',
        'connector:startMode:onSetup',
        'interactor:startMode:onSetup',
      ]

      this.targets.resetContainer(removeTargets)

      if (finalize) {
        // Preserves only what a DIFFERENT, still-in-flight session currently owns — everything
        // else is swept, exactly like the original unscoped full wipe. Empty whenever no other
        // session is genuinely concurrent right now (the common case, including every call within
        // one single-session multi-call sequence), so this reduces to that original full wipe then.
        const foreignApplications = this.sessions.getForeignActiveApplications()
        if (foreignApplications.size) {
          this.targets.resetResolversExceptApplications(foreignApplications)
          this.routes.resetExceptApplications(foreignApplications)
          this.discovery.resetExceptApplications(foreignApplications)
        } else {
          this.targets.resetContainer(['type:resolver'])
          this.routes.resetContainer()
          this.discovery.resetContainer()
        }
      }
      return
    }

    /** Clean metadata onBoot */

    // Routes are deliberately NOT cleared here (unlike middlewares/decorators below): a consumer
    // that calls `bootstrapServers` more than once in the same boot (e.g. the `admin` Application's
    // server first, then `main`'s — see `@zanix/core`'s `start.ts`) needs the shared route registry
    // to still hold every route not yet claimed by an earlier call, regardless of which Application
    // it belongs to. Each server's own dispatch table is built once at `webServerManager.create()`
    // time from this registry and never reads it again at request time, so leaving it populated for
    // the life of the process has no request-time cost.
    if (finalize) {
      // remove all middlewares in container
      this.middlewares.resetContainer()
      // remove all metadata used in decorators execution
      this.decorators.resetContainer()
    }
    // remove unnecesary handlers class `properties` or `symbols` and already instanced targets
    const alreadyStartedTargets: `startMode:${StartMode}`[] = [
      'startMode:onSetup',
      'startMode:onBoot',
    ]
    this.targets.resetContainer([HANDLER_METADATA_PROPERTY_KEY, ...alreadyStartedTargets])
  }
}

/**
 * A frozen singleton instance of the `InternalProgram`.
 * @type {Readonly<InternalProgram>}
 */
const ProgramModule: Readonly<InternalProgram> = Object.freeze(new InternalProgram()) as Readonly<
  InternalProgram
>
export default ProgramModule
