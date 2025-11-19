import type {
  CoreConnectorTemplates,
  ZanixConnectorClass,
  ZanixConnectorGeneric,
} from 'typings/targets.ts'
import type { ZanixConnector } from 'connectors/base.ts'
import type { CoreConnectors } from 'typings/program.ts'

import { getConnectors } from 'modules/program/public.ts'
import { CoreBaseClass } from '../base/core.ts'
import { ZANIX_PROPS } from 'utils/constants.ts'
import { TargetError } from 'utils/errors.ts'

/**
 * Abstract base class for implementing **providers** and the technical orchestration layer in the Zanix framework.
 *
 * `ZanixProvider` serves as the **technical orchestration layer**, acting as a bridge between **interactors** and **connectors**.
 * It may **fuse the responsibilities of repositories and data services**, orchestrating multiple connectors while keeping
 * the domain logic separate.
 *
 * This class is designed to be extended by concrete provider implementations, allowing for a modular and scalable
 * architecture in the Zanix framework.
 *
 * The provider handles communication with other system components such as connectors and other providers, enabling
 * complex interactions and reusability of business logic and infrastructure services.
 *
 * @abstract
 * @extends CoreBaseClass
 *
 * @template T - A generic type representing the core connectors used by this provider. By default, it is set to `object`,
 *               which corresponds to the base core connector types, unless explicitly specified.
 */
export abstract class ZanixProvider<T extends CoreConnectorTemplates = object>
  extends CoreBaseClass<T> {
  /**
   * Get a connector instance and checks if is available.
   *
   * This method ensures that the requested connector instance exists
   * in the current context before executing the provided callback function.
   * If the instance is not available, it throws a `TargetError`.
   */
  protected getProviderConnector<T extends ZanixConnectorGeneric>(
    connector: CoreConnectors | ZanixConnectorClass<T>,
    verbose?: boolean,
  ): T {
    const { startMode } = this[ZANIX_PROPS]

    try {
      return getConnectors(this.contextId, false).get<T>(connector)
    } catch {
      throw new TargetError('An error occurred in the system', startMode, {
        code: 'CONNECTOR_INSTANCE_NOT_FOUND',
        cause: `The "${connector}" instance is not available in this Provider.`,
        shouldLog: verbose,
        meta: {
          connector,
          target: 'provider',
          source: 'zanix',
          suggestion:
            'Check environment variables and configuration settings to ensure this connector is properly configured.',
        },
      })
    }
  }

  /** Not method implemented base error */
  private methodNotImplementedError(methodName: string) {
    const { startMode } = this[ZANIX_PROPS]
    return new TargetError('An error occurred in the system', startMode, {
      code: 'METHOD_NOT_IMPLEMENTED',
      cause: `Connector '${methodName}' method was not implemented.`,
      meta: {
        target: 'provider',
        source: 'zanix',
      },
    })
  }

  /**
   * Retrieves a different connector based on the given identifier.
   *
   * @param { unknown } target - The identifier for the desired connector.
   * @returns {ZanixConnector} - A `ZanixConnector`.
   */
  public abstract use(target: unknown): ZanixConnector
}
