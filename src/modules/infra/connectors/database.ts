import { ZanixConnector } from './base.ts'

/**
 * Abstract base class for connectors that integrate with database systems.
 *
 * This class extends {@link ZanixConnector} and provides a standardized foundation
 * for implementing connectors to relational or non-relational databases, such as
 * PostgreSQL, MySQL, MongoDB, or SQLite.
 *
 * It inherits the connection lifecycle management provided by `ZanixConnector`,
 * ensuring consistent behavior across different database implementations.
 *
 * Extend this class to create custom database connectors tailored to your application's persistence layer.
 *
 * @abstract
 * @extends ZanixConnector
 */
export abstract class ZanixDatabaseConnector extends ZanixConnector {
}
