import type { ProviderDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { Lifetime, ProviderTypes } from 'typings/program.ts'

import { defineProviderDecorator } from 'providers/decorators/assembly.ts'

/**
 * Class decorator for defining core or general interactors with a specific provider type.
 *
 * When called with a simple provider type string, this decorator registers
 * the interactor with that core provider type.
 *
 * @param {ProviderTypes} type - The type of the interactor provider.
 *
 * Defaults: `type`='custom', `startMode`='postBoot', `lifetime`='SINGLETON'
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Provider(type?: ProviderTypes): ZanixClassDecorator
/**
 * Class decorator for defining Provider or Client interactors with detailed provider options.
 *
 * This overload accepts a configuration object for generic providers,
 * allowing customization of lifecycle and initialization behavior.
 *
 * @param {Object} options - Configuration options for the provider.
 * @param {CoreProviders} options.type - The generic provider type (e.g., 'custom'). Defaults to 'custom'
 * @param {StartMode} [options.startMode='postBoot'] - The instance initialization mode.
 *                                                Determines when the provider instance is started.
 * @param {Lifetime} [options.lifetime='SINGLETON'] - The provider's lifetime scope,
 *                                                    specifying the dependency injection strategy.
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Provider<L extends Exclude<Lifetime, 'TRANSIENT'>>(
  options: ProviderDecoratorOptions<L>,
): ZanixClassDecorator
export function Provider<L extends Exclude<Lifetime, 'TRANSIENT'>>(
  options?: ProviderTypes | ProviderDecoratorOptions<L>,
): ZanixClassDecorator {
  return defineProviderDecorator(options)
}
