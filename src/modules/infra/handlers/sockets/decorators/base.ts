import type { RtoTypes } from '@zanix/types'
import type {
  GenericHandlerOptions,
  SocketDecoratorOptions,
  ZanixClassDecorator,
} from 'typings/decorators.ts'

import { defineSocketDecorator } from './assembly.ts'

/**
 * Class decorator for defining a WebSocket API endpoint.
 *
 * When provided a route string, this decorator registers the class as a WebSocket
 * handler bound to the specified route.
 *
 * @param {string} route - The WebSocket route path.
 * @throws {InternalError} If the decorated class does not extend `ZanixWebSocket`.
 * @returns {ZanixClassDecorator} The class decorator.
 *
 * @example
 * ```ts
 * \@Socket('chat')
 * class ChatSocket extends ZanixWebSocket {
 *   protected override onmessage(ev: MessageEvent) {
 *     return { echo: ev.data }
 *   }
 * }
 * ```
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
 * @throws {InternalError} If the decorated class does not extend `ZanixWebSocket`.
 * @returns {ZanixClassDecorator} The class decorator.
 *
 * @example
 * ```ts
 * \@Socket({ route: 'chat', Interactor: ChatInteractor })
 * class ChatSocket extends ZanixWebSocket<ChatInteractor> {
 *   protected override onmessage(ev: MessageEvent) {
 *     return { reply: this.interactor.handle(ev.data) }
 *   }
 * }
 * ```
 */
export function Socket(
  options: GenericHandlerOptions & {
    /** Route path */
    route: string
    /** Rto to validate socket event data on message (Body) and request search or params */
    rto?: RtoTypes | RtoTypes['Body']
  },
): ZanixClassDecorator

export function Socket(
  options?: SocketDecoratorOptions,
): ZanixClassDecorator {
  return defineSocketDecorator(options)
}
