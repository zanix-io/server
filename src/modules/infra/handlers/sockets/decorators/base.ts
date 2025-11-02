import type { RtoTypes } from '@zanix/types'
import type { SocketDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { ZanixInteractorClass } from 'typings/targets.ts'

import { defineSocketDecorator } from './assembly.ts'

/**
 * Class decorator for defining a WebSocket API endpoint.
 *
 * When provided a route string, this decorator registers the class as a WebSocket
 * handler bound to the specified route.
 *
 * @param {string} route - The WebSocket route path.
 * @returns {ZanixClassDecorator} The class decorator.
 */
export function Socket(
  route: string,
): ZanixClassDecorator
/**
 * Class decorator for defining a WebSocket API endpoint with detailed options.
 *
 * Allows configuration of the WebSocket route, validation schema, and interactor injection.
 *
 * @param {Object} options - Configuration object for the WebSocket endpoint.
 * @param {string} options.route - The WebSocket route path.
 * @param {RtoTypes | RtoTypes['Body']} [options.rto] - Optional request transfer object(s) for
 *        validating socket event data (message body) and request parameters or query.
 * @param {ZanixInteractorClass} [options.Interactor] - Optional interactor class to inject for handling business logic.
 * @returns {ZanixClassDecorator} The class decorator.
 */
export function Socket(options: {
  /** Route path */
  route: string
  /** Rto to validate socket event data on message (Body) and request search or params */
  rto?: RtoTypes | RtoTypes['Body']
  /**
   * Enables `AsyncLocalStorage` to extend context per request, even in singleton instances.
   * This ensures each request gets its own context, preventing shared state in singleton scenarios.
   * Defaults to `false`
   */
  enableALS?: boolean
  /** Interactor name for injection */
  Interactor?: ZanixInteractorClass
}): ZanixClassDecorator

export function Socket(
  options?: SocketDecoratorOptions,
): ZanixClassDecorator {
  return defineSocketDecorator(options)
}
