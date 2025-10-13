import { ZanixConnector } from './base.ts'

/**
 * Abstract base class for connectors that integrate with caching systems.
 *
 * This class extends {@link ZanixConnector} and is intended to be used as the foundation
 * for implementing connectors to caching backends such as Redis, Memcached, or in-memory stores.
 *
 * It inherits lifecycle management logic from `ZanixConnector`, ensuring safe and consistent
 * handling of connection setup and teardown.
 *
 * Extend this class to create custom cache connector implementations suited to your application's needs.
 *
 * @abstract
 * @extends ZanixConnector
 */
export abstract class ZanixCacheConnector extends ZanixConnector {
}
