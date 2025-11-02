import type { ModuleTypes, StartMode } from 'typings/program.ts'

import { MiddlewaresContainer } from './metadata/middlewares.ts'
import { DecoratorsContainer } from './metadata/decorators.ts'
import { RouteContainer } from './metadata/routes.ts'
import { TargetContainer } from './metadata/targets/main.ts'
import { ContextContainer } from 'modules/program/metadata/context.ts'
import { HANDLER_METADATA_PROPERTY_KEY } from 'utils/constants.ts'

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
   * Route container that interacts with middlewares and targets.
   * @type {RouteContainer}
   */
  public routes: RouteContainer = new RouteContainer(this.middlewares, this.targets)

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
   * Method to clean up metadata stored in containers.
   * Resets the containers for routes, middlewares, decorators, and targets.
   */
  public cleanupMetadata(mode: Extract<StartMode, 'postBoot' | 'onBoot'> = 'onBoot'): void {
    if (mode === 'postBoot') {
      /** Clean metadata postBoot */
      const removeTargets: (`type:${ModuleTypes}` | `startMode:${StartMode}`)[] = [
        'type:connector',
        'type:resolver',
        'startMode:postBoot',
      ]

      this.targets.resetContainer(removeTargets)
      return
    }

    /** Clean metadata onBoot */

    // remove all routes in container
    this.routes.resetContainer()
    delete this.routes['middlewares' as never]
    delete this.routes['targets' as never]
    // remove all middlewares in container
    this.middlewares.resetContainer()
    // remove all metadata used in decorators execution
    this.decorators.resetContainer()
    // remove unnecesary handlers class `properties` or `symbols` and already instanced targets
    const alreadyStartedTargets: `startMode:${StartMode}`[] = [
      'startMode:onSetup',
      'startMode:onBoot',
    ]
    this.targets.resetContainer([HANDLER_METADATA_PROPERTY_KEY, ...alreadyStartedTargets])
  }
}

/**
 * A frozen singleton instance of the `InternalProgram` class to ensure only one instance exists.
 * @type {Readonly<InternalProgram>}
 */
const ProgramModule: Readonly<InternalProgram> = Object.freeze(new InternalProgram()) as Readonly<
  InternalProgram
>
export default ProgramModule
