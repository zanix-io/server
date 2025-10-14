import type { ConnectorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ConnectorTypes, GenericConnectors, Lifetime, StartMode } from 'typings/program.ts'

import { defineConnectorDecorator } from 'connectors/decorators/assembly.ts'

/**
 * Class decorator for defining core or general interactors with a specific connector type.
 *
 * When called with a simple connector type string, this decorator registers
 * the interactor with that core connector type.
 *
 * @param {ConnectorTypes} type - The type of the interactor connector.
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Connector(type: ConnectorTypes): ZanixClassDecorator
/**
 * Class decorator for defining Provider or Client interactors with detailed connector options.
 *
 * This overload accepts a configuration object for generic connectors,
 * allowing customization of lifecycle and initialization behavior.
 *
 * @param {Object} options - Configuration options for the connector.
 * @param {GenericConnectors} options.type - The generic connector type (e.g., 'custom').
 * @param {StartMode} [options.startMode='postBoot'] - The instance initialization mode.
 *                                                Determines when the connector instance is started.
 * @param {Lifetime} [options.lifetime='SINGLETON'] - The connector's lifetime scope,
 *                                                    specifying the dependency injection strategy.
 * @returns {ZanixClassDecorator} The class decorator function.
 */
export function Connector(options: {
  type: GenericConnectors
  startMode?: StartMode
  lifetime?: Lifetime
}): ZanixClassDecorator
export function Connector(options: ConnectorDecoratorOptions): ZanixClassDecorator {
  return defineConnectorDecorator(options)
}
