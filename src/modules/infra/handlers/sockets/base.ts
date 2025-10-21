import type { HandlerContext } from 'typings/context.ts'
import type { SocketPrototype, ZanixInteractorGeneric } from 'typings/targets.ts'

import { HandlerGenericClass } from '../generic.ts'

import logger from '@zanix/logger'

/**
 * Abstract class that extends `HandlerGenericClass` and serves as the base for implementing WebSockets in Deno server applications.
 * This class provides the foundational structure for creating and managing WebSocket connections.
 *
 * Classes extending `ZanixWebSocket` must implement the logic to handle TCP or TLS requests and return appropriate responses.
 * Additionally, they must override the protected methods as needed to handle specific WebSocket events.
 *
 * @extends HandlerBaseClass
 * @template Interactor - The generic type representing the type of interactors used in the controller.
 *                        By default, it is set to `never`, meaning no interactor is provided unless specified.
 *
 * @example
 * ```ts
 * // Example of a class extending ZanixWebSocket and overriding protected methods
 * ´@Socket('socket-route-path')
 * class MyWebSocket extends ZanixWebSocket {
 *   protected override onopen(ev: Event): void {
 *     // Implement custom logic when the connection opens
 *     console.log("Connection opened successfully");
 *   }
 *
 *   protected override onclose(ev: CloseEvent): void {
 *     // Implement custom logic when the connection closes
 *     console.log("Connection closed");
 *   }
 *
 *   protected override onmessage(ev: MessageEvent): void {
 *     // Implement custom logic to handle incoming messages
 *     console.log("Message received:", ev.data);
 *   }
 *
 *   protected override onerror(ev: Event | ErrorEvent): void {
 *     // Implement custom logic to handle errors in the WebSocket connection
 *     console.error("WebSocket error:", ev);
 *   }
 * }
 * ```
 */
export abstract class ZanixWebSocket<Interactor extends ZanixInteractorGeneric = never>
  extends HandlerGenericClass<Interactor, SocketPrototype | HandlerContext> {
  #context: HandlerContext

  constructor(context: HandlerContext) {
    super(context.id)

    this.#context = context

    const currentOnMessage = this.onmessage.bind(this)

    this.onmessage = function (ev: MessageEvent) {
      const response = currentOnMessage(ev)
      if (!response) return

      if (response instanceof Promise) {
        response.then((resp) => {
          if (!resp) return
          this.socket.send(JSON.stringify(resp))
        })
      } else {
        this.socket.send(JSON.stringify(response))
      }
    }
  }

  /** WebSocket connection, excluding the default events */
  protected accessor socket!: Omit<WebSocket, 'onclose' | 'onerror' | 'onopen' | 'onmessage'>

  protected set context(ctx: HandlerContext) {
    this.#context = ctx
  }

  protected get context(): HandlerContext {
    return this.#context
  }

  /**
   * Event triggered when the WebSocket connection is closed.
   * Should be overridden to handle the closure of the connection with custom logic.
   *
   * @param {CloseEvent} _ev - The close event of the connection.
   */
  protected onclose(_ev: CloseEvent) {
    logger.info('Socket connection closed', 'noSave')
  }

  /**
   * Event triggered when an error occurs on the WebSocket connection.
   * Should be overridden to handle errors with custom logic.
   *
   * @param {Event | ErrorEvent} ev - The error event.
   */
  protected onerror(ev: Event | ErrorEvent) {
    logger.error('An error occurred on socket', ev, 'noSave')
  }

  /**
   * Event triggered when a message is received via the WebSocket.
   * Should be overridden to handle incoming messages with custom logic.
   *
   * @param {MessageEvent} ev - The message event.
   */
  protected onmessage(
    ev: MessageEvent,
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void {
    logger.info('A socket message received', ev, 'noSave')
  }

  /**
   * Event triggered when the WebSocket connection opens.
   * Should be overridden to handle the opening of the connection with custom logic.
   *
   * @param {Event} _ev - The event triggered when the connection opens.
   */
  protected onopen(_ev: Event) {
    logger.info('Socket connection open', 'noSave')
  }
}
