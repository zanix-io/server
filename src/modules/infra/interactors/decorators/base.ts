import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ZanixConnector } from 'connectors/base.ts'
import type { Lifetime } from 'typings/program.ts'

import { defineInteractorDecorator } from './assembly.ts'

/**
 * Class decorator for `interactors` that depend on connectors (e.g., clients or service providers).
 *
 * This decorator is used to configure how an interactor integrates with a specific connector,
 * such as a database provider.
 * It also defines the dependency injection strategy and lifecycle behavior.
 *
 * By default, the interactor uses the `SCOPED` lifetime strategy unless otherwise specified.
 *
 * ℹ️ The **interactor** with a `TRANSIENT` lifetime should be used **only** during configuration or setup.
 * It is **not supported** when using StarMode with lazy initialization, as it has no practical effect.
 *
 * ⚠️ Be cautious when using a **transient interactor** as a dependency of any handler,
 * since its reference will be discarded immediately after use.
 *
 * @param {InteractorDecoratorOptions} options - Configuration object that defines:
 *   - `Connector`: The class used to resolve the connector dependency.
 *   - `lifetime`: (Optional) The lifetime strategy for the interactor (`SCOPED`, `SINGLETON`, etc.).
 *   - `startMode`: (Optional) The lifetime strategy for the interactor (`onSetup`, `onBoot`, `postBoot`).
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Interactor<C extends typeof ZanixConnector, L extends Lifetime>(
  options?: InteractorDecoratorOptions<C, L>,
): ZanixClassDecorator {
  return defineInteractorDecorator(options)
}
