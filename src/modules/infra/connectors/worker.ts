import { ZanixConnector } from './base.ts'

/**
 * Abstract base class for connectors that integrate with background job or worker systems.
 *
 * This class extends {@link ZanixConnector} and is designed to be the foundation for implementing
 * connectors to background processing tools such as BullMQ, Agenda, Temporal, or custom job queues.
 *
 * It inherits lifecycle and connection state management from `ZanixConnector`,
 * ensuring reliable initialization and teardown of worker-related services.
 *
 * Extend this class to implement custom connectors for job schedulers, workers, or task queues.
 *
 * @abstract
 * @extends ZanixConnector
 */
export abstract class ZanixWorkerConnector extends ZanixConnector {
}
