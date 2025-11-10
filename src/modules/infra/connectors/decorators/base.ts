import type { ConnectorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ConnectorTypes, Lifetime } from 'typings/program.ts'

import { defineConnectorDecorator } from 'connectors/decorators/assembly.ts'

/**
 * Class decorator for defining core or general interactors with a specific connector type.
 *
 * When called with a simple connector type string, this decorator registers
 * the interactor with that core connector type.
 *
 * @param {ConnectorTypes} type - The type of the interactor connector.
 *
 * Defaults: `type`='custom', `startMode`='postBoot', `lifetime`='SINGLETON, `autoInitialize`=true
 *
 * ℹ️ The **connector** with a `TRANSIENT` lifetime should be used **only** during configuration or setup.
 * It is **not supported** when using StarMode with lazy initialization, as it has no practical effect.
 *
 * ⚠️ Be cautious when using a **transient connector** as a dependency of any other class,
 * since its reference will be discarded immediately after use.
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Connector(type?: ConnectorTypes): ZanixClassDecorator
/**
 * Class decorator for defining Provider or Client interactors with detailed connector options.
 *
 * This overload accepts a configuration object for generic connectors,
 * allowing customization of lifecycle and initialization behavior.
 *
 * @param {Object} options - Configuration options for the connector.
 * @param {ConnectorTypes} options.type - The generic connector type (e.g., 'custom'). Defaults to 'custom'
 * @param {StartMode} [options.startMode='postBoot'] - The instance initialization mode.
 *                                                Determines when the connector instance is started.
 * @param {Lifetime} [options.lifetime='SINGLETON'] - The connector's lifetime scope,
 *                                                    specifying the dependency injection strategy.
 * @param {boolean} [options.autoInitialize=true] - Determines whether the object should automatically
 *                                                  initialize itself upon instantiation.
 *                                                  When set to `true`, the instance will automatically
 *                                                  call its initialization logic right after being created.
 *                                                  When set to `false`, the instance will not initialize itself,
 *                                                  and you will need to explicitly call the initialization method.
 *                                                  This property defaults to `true` if not specified.
 *
 * ℹ️ The **connector** with a `TRANSIENT` lifetime should be used **only** during configuration or setup.
 * It is **not supported** when using StarMode with lazy initialization, as it has no practical effect.
 *
 * ⚠️ Be cautious when using a **transient connector** as a dependency of any other class,
 * since its reference will be discarded immediately after use.
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Connector<L extends Lifetime>(
  options: ConnectorDecoratorOptions<L>,
): ZanixClassDecorator
export function Connector<L extends Lifetime>(
  options?: ConnectorTypes | ConnectorDecoratorOptions<L>,
): ZanixClassDecorator {
  return defineConnectorDecorator(options)
}
