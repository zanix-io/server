import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ZanixConnectors } from 'typings/targets.ts'

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
 * @param {InteractorDecoratorOptions} options - Configuration object that defines:
 *   - `Connector`: The class used to resolve the connector dependency.
 *   - `lifetime`: (Optional) The lifetime strategy for the interactor (`SCOPED`, `SINGLETON`, etc.).
 *   - Other custom options for registration or metadata.
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Interactor<C extends ZanixConnectors>(
  options?: InteractorDecoratorOptions<C>,
): ZanixClassDecorator {
  return defineInteractorDecorator(options)
}
