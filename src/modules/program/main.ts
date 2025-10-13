import { MiddlewaresContainer } from './metadata/middlewares.ts'
import { DecoratorsContainer } from './metadata/decorators.ts'
import { RouteContainer } from './metadata/routes.ts'
import { TargetContainer } from './metadata/targets.ts'
import { ContextContainer } from 'modules/program/metadata/context.ts'

/**
 * Class that manages containers for middlewares, targets, routes, decorators, and context.
 * Provides methods for cleaning up metadata stored in these containers.
 */
export class Program {
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
  public cleanupMetadata(): void {
    this.routes.resetContainer()
    this.middlewares.resetContainer()
    this.decorators.resetContainer()
    this.targets.resetContainer(['properties'])
  }
}

/**
 * A frozen singleton instance of the `Program` class to ensure only one instance exists.
 * @type {Program}
 */
export default Object.freeze(new Program()) as Readonly<Program>
