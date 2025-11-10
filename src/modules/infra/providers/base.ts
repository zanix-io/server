import type { CoreConnectorTemplates } from 'typings/targets.ts'
import type { ZanixConnector } from 'connectors/base.ts'

import { CoreBaseClass } from '../base/core.ts'

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
   * Retrieves a different connector based on the given identifier.
   *
   * @param { unknown } target - The identifier for the desired connector.
   * @returns {ZanixConnector} - A `ZanixConnector`.
   */
  public abstract use(target: unknown): ZanixConnector
}
