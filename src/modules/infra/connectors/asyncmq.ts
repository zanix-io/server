import type { CoreConnectorTemplates } from 'typings/targets.ts'

import { ZanixConnector } from './base.ts'

/**
 * Abstract base class for connectors that integrate with asynchronous message queue (AsyncMQ) systems.
 *
 * This class extends {@link ZanixConnector} and serves as a specialized foundation
 * for implementing connectors to message brokers such as RabbitMQ, Kafka, MQTT, etc.
 *
 * It inherits the connection lifecycle management logic from `ZanixConnector`, including
 * safe connection handling and support for lazy initialization.
 *
 * Extend this class to create a custom AsyncMQ connector tailored to your messaging infrastructure.
 *
 * @abstract
 * @extends ZanixConnector
 *
 * @template T - A generic type representing the type of core connectors used by the current connector.
 *               By default, it is set to `object`, meaning the base core connector types are provided unless explicitly specified.
 */
export abstract class ZanixAsyncmqConnector<T extends CoreConnectorTemplates = object>
  extends ZanixConnector<T> {
}
